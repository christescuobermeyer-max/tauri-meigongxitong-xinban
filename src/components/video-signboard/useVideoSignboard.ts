import { useEffect, useState } from "react";
import { parseDouyinVideo } from "../../lib/tauri";
import type { CropArea, TimeRange } from "./VideoEditor";

export type VideoPlatform = "xiaohongshu" | "douyin";
export type VideoExportTarget = "meituan" | "taobaoFlash";

export interface VideoInfo {
  videoUrl: string;
  title: string;
  author: string;
  platform: VideoPlatform;
  headers?: Record<string, string>;
}

export type VideoSource =
  | { type: "remote"; info: VideoInfo }
  | { type: "local"; filePath: string; displayName: string };

interface Options {
  onToast: (message: string, type?: "info" | "success" | "error") => void;
}

function extractCategoryFromShareText(shareText: string): string {
  const textWithoutUrl = shareText
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/http?:\/\/[^\s]+/g, "");
  const chineseMatch = textWithoutUrl.match(/[\u4e00-\u9fa5]+/g);

  if (chineseMatch && chineseMatch.length > 0) {
    const filtered = chineseMatch.filter(
      (word) =>
        !["复制", "打开", "抖音", "看看", "的作品", "发布了", "一篇", "小红书", "笔记", "快来看吧"].includes(word) &&
        word.length >= 2
    );
    if (filtered.length > 0) {
      const longest = filtered.reduce((a, b) => (a.length >= b.length ? a : b));
      return longest.slice(0, 20);
    }
  }

  return "店招视频";
}

function detectPlatform(text: string): VideoPlatform | null {
  if (text.includes("xhslink.com") || text.includes("xiaohongshu.com")) return "xiaohongshu";
  if (text.includes("v.douyin.com") || text.includes("douyin.com/video")) return "douyin";
  return null;
}

function getFileStem(filePath: string): string {
  const baseName = filePath.split(/[/\\]/).pop() || "店招视频";
  const stem = baseName.replace(/\.[^.]+$/, "");
  return stem.trim() || "店招视频";
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}

function extractFolderPath(filePath: string): string {
  const separatorIndex = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : "";
}

export function useVideoSignboard({ onToast }: Options) {
  const [exportPath, setExportPath] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTarget, setProcessingTarget] = useState<VideoExportTarget | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 692, height: 390 });
  const [timeRange, setTimeRange] = useState<TimeRange>({ start: 0, end: 0 });
  const [category, setCategory] = useState("");
  const [customFileName, setCustomFileName] = useState("");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const savedExportPath = await invoke<string | null>("get_video_export_path");
        if (!cancelled) setExportPath(savedExportPath ?? "");
      } catch {
        if (!cancelled) setExportPath("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleParse() {
    if (!inputUrl.trim()) {
      onToast("请输入视频链接", "error");
      return;
    }

    const platform = detectPlatform(inputUrl);
    if (!platform) {
      onToast("仅支持小红书或抖音分享链接", "error");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
      const result =
        platform === "douyin"
          ? await parseDouyinVideo(inputUrl)
          : await invoke<VideoInfo>("parse_xiaohongshu", { shareText: inputUrl });
      const extractedCategory = extractCategoryFromShareText(inputUrl);
      const downloadArgs: { url: string; platform: VideoPlatform; headers?: Record<string, string> } = {
        url: result.videoUrl,
        platform: result.platform,
      };
      if (result.headers) downloadArgs.headers = result.headers;
      const localPath = await invoke<string>("download_video", downloadArgs);

      setVideoSource({ type: "remote", info: result });
      setCategory(extractedCategory);
      setCustomFileName(extractedCategory);
      setPreviewUrl(convertFileSrc(localPath));
      onToast("视频解析成功", "success");
    } catch (err) {
      const message = getErrorMessage(err, "解析失败");
      setError(message);
      onToast(`解析失败：${message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectLocalVideo() {
    setIsLoading(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        title: "选择本地视频",
        filters: [{ name: "视频文件", extensions: ["mp4", "mov", "mkv", "avi", "webm"] }],
      });
      if (!selected) return;

      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;

      const { invoke, convertFileSrc } = await import("@tauri-apps/api/core");
      const stem = getFileStem(filePath);
      const previewPath = await invoke<string>("prepare_local_video_preview", { inputPath: filePath });
      setError("");
      setInputUrl("");
      setCategory("");
      setCustomFileName(stem);
      setVideoSource({ type: "local", filePath, displayName: stem });
      setPreviewUrl(convertFileSrc(previewPath));
      onToast("本地视频已加载", "success");
    } catch (err) {
      const message = getErrorMessage(err, "选择本地视频失败");
      setError(message);
      onToast(`选择本地视频失败：${message}`, "error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleProcess(exportTarget: VideoExportTarget) {
    if (!videoSource) return;
    if (timeRange.end <= timeRange.start) {
      onToast("时间范围无效，请调整截取时间", "error");
      return;
    }

    const duration = timeRange.end - timeRange.start;
    if (exportTarget === "taobaoFlash" && (duration < 5 || duration > 90)) {
      onToast("淘宝闪购视频店招时长需为 5 秒至 90 秒", "error");
      return;
    }

    setIsProcessing(true);
    setProcessingTarget(exportTarget);
    setProgress(0);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const fileName = customFileName || category || "店招视频";
      const crop = {
        x: cropArea.x,
        y: cropArea.y,
        width: cropArea.width,
        height: cropArea.height,
        startTime: timeRange.start,
        endTime: timeRange.end,
      };
      const outputPath =
        videoSource.type === "remote"
          ? await invoke<string>("process_video", {
              videoUrl: videoSource.info.videoUrl,
              platform: videoSource.info.platform,
              headers: videoSource.info.headers,
              fileName,
              crop,
              exportTarget,
              includeAudio,
            })
          : await invoke<string>("process_local_video", {
              inputPath: videoSource.filePath,
              fileName,
              crop,
              exportTarget,
              includeAudio,
            });

      setProgress(100);
      const folderPath = extractFolderPath(outputPath);
      if (folderPath) setExportPath(folderPath);
      setRefreshTrigger((prev) => prev + 1);
      onToast(`视频处理完成：${outputPath}`, "success");
    } catch (err) {
      const message = getErrorMessage(err, "未知错误");
      onToast(`处理失败：${message}`, "error");
    } finally {
      setIsProcessing(false);
      setProcessingTarget(null);
    }
  }

  async function openExportFolder() {
    if (!exportPath) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_export_folder", { exportPath });
    } catch (err) {
      onToast(getErrorMessage(err, "打开导出文件夹失败"), "error");
    }
  }

  function handleReset() {
    setInputUrl("");
    setVideoSource(null);
    setPreviewUrl("");
    setError("");
    setCropArea({ x: 0, y: 0, width: 692, height: 390 });
    setTimeRange({ start: 0, end: 0 });
    setProgress(0);
    setCategory("");
    setCustomFileName("");
    onToast("已重置，可粘贴新链接或上传本地视频", "info");
  }

  return {
    exportPath,
    inputUrl,
    setInputUrl,
    videoSource,
    previewUrl,
    isLoading,
    isProcessing,
    processingTarget,
    progress,
    error,
    cropArea,
    setCropArea,
    timeRange,
    setTimeRange,
    category,
    customFileName,
    setCustomFileName,
    includeAudio,
    setIncludeAudio,
    refreshTrigger,
    handleParse,
    handleSelectLocalVideo,
    handleProcess,
    handleReset,
    openExportFolder,
  };
}
