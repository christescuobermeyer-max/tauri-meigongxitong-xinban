import { useRef, useState } from "react";
import {
  DATA_ANALYSIS_ASSET_KIND,
  DATA_ANALYSIS_EXPORT_SIZE,
  DATA_ANALYSIS_PLATFORM,
  EMPTY_TRAFFIC_METRICS,
  extractTrafficMetrics,
  parseTrafficCount,
  type TrafficMetrics,
} from "../lib/data-analysis";
import { renderDataAnalysisImage } from "../lib/data-analysis-render";
import { pickSavePath, resizeAndSaveImage, uploadImageToOss } from "../lib/tauri";
import { safeFileName } from "../lib/utils";
import type { AssetKind, GenerationItem, Platform, UploadedImage } from "../types";

interface Options {
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (kind: AssetKind, item: GenerationItem, shopName: string, platform: Platform) => void;
}

const INITIAL_ITEM: GenerationItem = {
  kind: DATA_ANALYSIS_ASSET_KIND,
  rawBase64: null,
  rawDataUrl: null,
  status: "idle",
};

export default function useDataAnalysisWorkspace({ onToast, onRecordHistory }: Options) {
  const [storeName, setStoreName] = useState("");
  const [images, updateImages] = useState<UploadedImage[]>([]);
  const [metrics, setMetrics] = useState<TrafficMetrics>(EMPTY_TRAFFIC_METRICS);
  const [item, setItem] = useState<GenerationItem>(INITIAL_ITEM);
  const [recognizing, setRecognizing] = useState(false);
  const locked = useRef(false);
  const busy = recognizing || item.status === "running";

  function setImages(next: UploadedImage[]) {
    if (locked.current) return;
    if (next[0]?.id !== images[0]?.id) {
      setMetrics(EMPTY_TRAFFIC_METRICS);
      setItem(INITIAL_ITEM);
    }
    updateImages(next.slice(0, 1));
  }

  async function handleRecognize() {
    if (locked.current || !images[0]) return;
    locked.current = true;
    setRecognizing(true);
    const source = images[0];
    try {
      const { readTrafficScreenshot } = await import("../lib/data-analysis-ocr");
      const extracted = extractTrafficMetrics(await readTrafficScreenshot(`data:${source.mime};base64,${source.productBase64}`));
      if (!Object.values(extracted).some(Boolean)) {
        onToast("未识别到明确的『人』数值，请对照截图手动填写。", "info");
        return;
      }
      setMetrics((current) => ({
        exposure: extracted.exposure || current.exposure,
        visits: extracted.visits || current.visits,
        orders: extracted.orders || current.orders,
      }));
      onToast("识别完成，请核对人数后生成。", "success");
    } catch {
      onToast("截图识别失败，请对照截图手动填写人数。", "error");
    } finally {
      locked.current = false;
      setRecognizing(false);
    }
  }

  async function handleGenerate() {
    if (locked.current || !storeName.trim() || !images[0]) return;
    const values = Object.values(metrics).filter((value) => value.trim());
    if (!values.length || values.some((value) => parseTrafficCount(value) === null)) {
      onToast("请至少填写一项有效人数。只填写整数，可留空无法核对的字段。", "error");
      return;
    }
    locked.current = true;
    const started = Date.now();
    const snapshot = { storeName: storeName.trim(), metrics };
    setItem({ ...INITIAL_ITEM, status: "running" });
    try {
      const output = renderDataAnalysisImage(snapshot.storeName, snapshot.metrics);
      let remoteUrl: string | undefined;
      try {
        const archive = await uploadImageToOss({
          base64_data: output.base64,
          mime_type: "image/png",
          folder: "generated",
          file_name: `${safeFileName(snapshot.storeName)}-data-analysis.png`,
        });
        remoteUrl = archive.url;
      } catch (error) {
        console.warn("数据分析图归档失败", error);
      }
      const result: GenerationItem = {
        kind: DATA_ANALYSIS_ASSET_KIND,
        rawBase64: output.base64,
        rawDataUrl: output.dataUrl,
        remoteUrl,
        status: "succeeded",
        elapsedMs: Date.now() - started,
      };
      setItem(result);
      if (remoteUrl) onToast("数据分析图生成完成", "success");
      onRecordHistory(DATA_ANALYSIS_ASSET_KIND, result, snapshot.storeName, DATA_ANALYSIS_PLATFORM);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setItem({ ...INITIAL_ITEM, status: "failed", errorMessage: message });
      onToast(`数据分析图生成失败：${message}`, "error");
    } finally {
      locked.current = false;
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
    metrics,
    setMetrics,
    item,
    busy,
    recognizing,
    handleRecognize,
    handleGenerate,
    handleRetry: handleGenerate,
    handleDownload,
  };
}
