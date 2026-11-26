import { useState } from "react";
import {
  DATA_ANALYSIS_ASSET_KIND,
  buildDataAnalysisPrompt,
  DATA_ANALYSIS_EXPORT_SIZE,
  DATA_ANALYSIS_PLATFORM,
  resolveDataAnalysisSize,
} from "../lib/data-analysis";
import { getAutoRetryAttempt, runWithAutoRetry } from "../lib/generation-retry";
import { resolveGeneratedArchiveUrl } from "../lib/oss-assets";
import {
  callBackendGateway,
  generateArchivedImageWithLine,
  getBackendGatewayUrl,
  pickSavePath,
  resizeAndSaveImage,
} from "../lib/tauri";
import { safeFileName } from "../lib/utils";
import type { AssetKind, GenerationItem, GenerationLine, Platform, UploadedImage } from "../types";

interface Options {
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

const INITIAL_ITEM: GenerationItem = {
  kind: DATA_ANALYSIS_ASSET_KIND,
  rawBase64: null,
  rawDataUrl: null,
  status: "idle",
};

export default function useDataAnalysisWorkspace({
  generationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [storeName, setStoreName] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [item, setItem] = useState<GenerationItem>(INITIAL_ITEM);
  // 同一张截图重生成时复用已识别的数据，不重复调用识别接口。
  const [extracted, setExtracted] = useState<{ imageId: string; metrics: string } | null>(null);

  const busy = item.status === "running" || item.status === "queued";

  function validateInputs() {
    if (!storeName.trim()) {
      onToast("请输入店铺名称", "error");
      return false;
    }
    if (images.length !== 1) {
      onToast("请上传 1 张店铺数据截图", "error");
      return false;
    }
    return true;
  }

  async function handleGenerate() {
    if (!validateInputs()) return;
    if (!getBackendGatewayUrl()) {
      onToast("数据分析需要连接云端网关", "error");
      return;
    }
    const metrics = await extractMetrics();
    if (!metrics) return;
    await runGeneration({
      storeName: storeName.trim(),
      metrics,
      generationLine,
    });
  }

  // 截图只交给网关视觉模型读出指标；生图请求不带截图，避免上游把原截图原样返回。
  async function extractMetrics(): Promise<string | null> {
    const source = images[0];
    if (extracted?.imageId === source.id) return extracted.metrics;
    setItem({ ...INITIAL_ITEM, status: "running", generationLine });
    onToast("正在读取截图数据…", "info");
    try {
      const result = await callBackendGateway<{ metrics: string }>("/api/data-analysis-extract", {
        screenshot: `data:${source.mime};base64,${source.productBase64 || source.base64}`,
      });
      const metrics = result.metrics?.trim();
      if (!metrics) throw new Error("没有从截图中识别到数据，请上传更清晰的店铺数据截图");
      setExtracted({ imageId: source.id, metrics });
      return metrics;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setItem({ ...INITIAL_ITEM, status: "failed", errorMessage: message });
      onToast(`读取截图数据失败：${message}`, "error");
      return null;
    }
  }

  async function runGeneration(snapshot: {
    storeName: string;
    metrics: string;
    generationLine: GenerationLine;
  }) {
    const started = Date.now();
    setItem({
      ...INITIAL_ITEM,
      status: "running",
      generationLine: snapshot.generationLine,
    });
    onToast("正在生成数据分析图…", "info");

    try {
      const result = await runWithAutoRetry({
        onAttempt: (attempt) =>
          setItem((current) => ({
            ...current,
            status: "running",
            errorMessage: undefined,
            attempt,
          })),
        run: async () => {
          const response = await generateArchivedImageWithLine(
            {
              prompt: buildDataAnalysisPrompt(snapshot.storeName, snapshot.metrics),
              size: resolveDataAnalysisSize(snapshot.generationLine),
              product_images: [],
              api_line: "auto",
            },
            {
              asset_kind: DATA_ANALYSIS_ASSET_KIND,
              file_name_stem: `${safeFileName(snapshot.storeName)}-data-analysis`,
              shop_name: snapshot.storeName,
              platform: DATA_ANALYSIS_PLATFORM,
            }
          );
          return {
            rawBase64: response.image,
            rawDataUrl: response.imageDataUrl,
            generationLine: response.generationLine,
            archiveUrl: response.archiveUrl,
            archiveError: response.archiveError,
            historyRecorded: response.historyRecorded,
            historyError: response.historyError,
          };
        },
      });
      const remoteUrl = await resolveGeneratedArchiveUrl(
        DATA_ANALYSIS_ASSET_KIND,
        result.rawBase64,
        `${safeFileName(snapshot.storeName)}-data-analysis`,
        result
      );
      const itemWithRemoteUrl: GenerationItem = {
        kind: DATA_ANALYSIS_ASSET_KIND,
        rawBase64: result.rawBase64,
        rawDataUrl: result.rawDataUrl ?? `data:image/png;base64,${result.rawBase64}`,
        remoteUrl,
        status: "succeeded",
        generationLine: result.generationLine,
        elapsedMs: Date.now() - started,
        attempt: result.attempt,
        historyRecorded: result.historyRecorded,
        historyError: result.historyError,
      };
      setItem({
        ...itemWithRemoteUrl,
      });
      onRecordHistory(
        DATA_ANALYSIS_ASSET_KIND,
        itemWithRemoteUrl,
        snapshot.storeName,
        DATA_ANALYSIS_PLATFORM
      );
      onToast("数据分析图生成完成", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = getAutoRetryAttempt(error);
      setItem((current) => ({
        ...current,
        status: "failed",
        errorMessage: message,
        attempt: attempt ?? current.attempt,
      }));
      onToast(`数据分析图生成失败：${message}`, "error");
    }
  }

  async function handleDownload() {
    if (item.status !== "succeeded" || !item.rawBase64) return;
    const fileName = `${safeFileName(storeName)}_数据分析图_${DATA_ANALYSIS_EXPORT_SIZE.w}x${DATA_ANALYSIS_EXPORT_SIZE.h}.png`;
    try {
      const selectedPath = await pickSavePath(fileName);
      if (!selectedPath) return;
      const saved = await resizeAndSaveImage({
        base64_data: item.rawBase64,
        target_width: DATA_ANALYSIS_EXPORT_SIZE.w,
        target_height: DATA_ANALYSIS_EXPORT_SIZE.h,
        output_path: selectedPath,
      });
      onToast(`已保存至：${saved}`, "success");
    } catch (error: unknown) {
      onToast(`数据分析图下载失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  return {
    storeName,
    setStoreName,
    images,
    setImages,
    item,
    busy,
    handleGenerate,
    handleRetry: handleGenerate,
    handleDownload,
  };
}
