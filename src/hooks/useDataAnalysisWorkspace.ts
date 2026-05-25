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
  generateArchivedImageWithLine,
  pickSavePath,
  resizeAndSaveImage,
  uploadImageToOss,
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
    const screenshotOssUrl = await prepareScreenshotOssUrl();
    if (!screenshotOssUrl) return;
    await runGeneration({
      storeName: storeName.trim(),
      screenshotOssUrl,
      generationLine,
    });
  }

  async function handleRetry() {
    if (!validateInputs()) return;
    const screenshotOssUrl = await prepareScreenshotOssUrl();
    if (!screenshotOssUrl) return;
    await runGeneration({
      storeName: storeName.trim(),
      screenshotOssUrl,
      generationLine,
    });
  }

  // 先把截图传到 OSS uploads/，再把 OSS URL 传给生图网关：
  // 避免 6 个客户端同 IP 并发 POST 数 MB base64 把公司出口带宽挤爆。
  // 复用 UploadedImage.productOssUrl 缓存，重生成不重复上传。
  async function prepareScreenshotOssUrl(): Promise<string | null> {
    const source = images[0];
    if (source.productOssUrl) return source.productOssUrl;
    try {
      const uploaded = await uploadImageToOss({
        base64_data: source.productBase64 || source.base64,
        mime_type: source.mime,
        folder: "uploads",
        file_name: `${safeFileName(storeName.trim() || "store")}-data-analysis-source-${source.id}.jpg`,
      });
      setImages((prev) =>
        prev.map((image) =>
          image.id === source.id ? { ...image, productOssUrl: uploaded.url } : image
        )
      );
      return uploaded.url;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      onToast(`截图上传 OSS 失败：${message}`, "error");
      return null;
    }
  }

  async function runGeneration(snapshot: {
    storeName: string;
    screenshotOssUrl: string;
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
          const response = await generateArchivedImageWithLine(
            {
              prompt: buildDataAnalysisPrompt(snapshot.storeName),
              size: resolveDataAnalysisSize(snapshot.generationLine),
              product_images: [snapshot.screenshotOssUrl],
              api_line: "auto",
            },
            {
              asset_kind: DATA_ANALYSIS_ASSET_KIND,
              file_name_stem: `${safeFileName(snapshot.storeName)}-data-analysis`,
            }
          );
          return {
            rawBase64: response.image,
            generationLine: response.generationLine,
            archiveUrl: response.archiveUrl,
            archiveError: response.archiveError,
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
        rawDataUrl: `data:image/png;base64,${result.rawBase64}`,
        remoteUrl,
        status: "succeeded",
        generationLine: result.generationLine,
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
