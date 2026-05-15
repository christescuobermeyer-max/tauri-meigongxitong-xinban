import { useState } from "react";
import {
  DATA_ANALYSIS_ASSET_KIND,
  buildDataAnalysisPrompt,
  DATA_ANALYSIS_EXPORT_SIZE,
  DATA_ANALYSIS_PLATFORM,
  resolveDataAnalysisSize,
} from "../lib/data-analysis";
import { getAutoRetryAttempt, runWithAutoRetry } from "../lib/generation-retry";
import { compressAndArchiveGenerated } from "../lib/oss-assets";
import { generateImage, pickSavePath, resizeAndSaveImage } from "../lib/tauri";
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
    const snapshot = {
      storeName: storeName.trim(),
      screenshotBase64: images[0].productBase64 || images[0].base64,
      generationLine,
    };
    await runGeneration(snapshot);
  }

  async function handleRetry() {
    if (!validateInputs()) return;
    await runGeneration({
      storeName: storeName.trim(),
      screenshotBase64: images[0].productBase64 || images[0].base64,
      generationLine,
    });
  }

  async function runGeneration(snapshot: {
    storeName: string;
    screenshotBase64: string;
    generationLine: GenerationLine;
  }) {
    const started = Date.now();
    setItem({
      ...INITIAL_ITEM,
      status: "running",
      generationLine: snapshot.generationLine,
    });
    onToast("正在读取截图并生成数据分析图…", "info");

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
          const rawBase64 = await generateImage({
            prompt: buildDataAnalysisPrompt(snapshot.storeName),
            size: resolveDataAnalysisSize(snapshot.generationLine),
            product_images: [snapshot.screenshotBase64],
            api_line: snapshot.generationLine,
          });
          return { rawBase64 };
        },
      });
      const remoteUrl = await compressAndArchiveGenerated(
        DATA_ANALYSIS_ASSET_KIND,
        result.rawBase64,
        `${safeFileName(snapshot.storeName)}-data-analysis`
      );
      const itemWithRemoteUrl: GenerationItem = {
        kind: DATA_ANALYSIS_ASSET_KIND,
        rawBase64: result.rawBase64,
        rawDataUrl: `data:image/png;base64,${result.rawBase64}`,
        remoteUrl,
        status: "succeeded",
        generationLine: snapshot.generationLine,
        elapsedMs: Date.now() - started,
        attempt: result.attempt,
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
    handleRetry,
    handleDownload,
  };
}
