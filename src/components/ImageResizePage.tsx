import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconCheck, IconClose, IconDownload, IconFolder, IconImage, IconPlay, IconRefresh } from "./Icons";
import { useToast } from "./Toast";
import { pickDirectoryPath } from "../lib/tauri";

type ResizePlatform = "meituan" | "eleme";

interface ImageInfo {
  file_name: string;
  file_path: string;
  file_size: number;
  width: number;
  height: number;
}

interface ProcessResult {
  file_name: string;
  input_path: string;
  output_path: string;
  input_size: number;
  output_size: number;
  input_dimensions: string;
  output_dimensions: string;
  status: string;
  error: string | null;
}

const PLATFORM_COPY: Record<ResizePlatform, { label: string; dimensions: string; hint: string }> = {
  meituan: { label: "美团", dimensions: "600×450", hint: "JPEG 输出，自动压缩到 500KB 以内" },
  eleme: { label: "饿了么", dimensions: "800×800", hint: "JPEG 输出，固定质量 95%" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return String(bytes) + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export default function ImageResizePage() {
  const toast = useToast();
  const [platform, setPlatform] = useState<ResizePlatform>("meituan");
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [outputDir, setOutputDir] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const spec = PLATFORM_COPY[platform];

  const successCount = useMemo(
    () => results.filter((result) => result.status === "success").length,
    [results]
  );

  async function selectImages() {
    try {
      const selected = await invoke<ImageInfo[]>("select_images");
      if (!selected.length) return;
      setImages((current) => [...current, ...selected]);
      setResults([]);
      setProgress(0);
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : "选择图片失败", "error");
    }
  }

  async function selectFolder() {
    try {
      const selected = await invoke<ImageInfo[]>("select_image_folder");
      if (!selected.length) return;
      setImages((current) => [...current, ...selected]);
      setResults([]);
      setProgress(0);
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : "扫描图片文件夹失败", "error");
    }
  }

  async function selectOutputDir() {
    try {
      const selected = await pickDirectoryPath("选择尺寸调整输出目录");
      if (selected) setOutputDir(selected);
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : "选择输出目录失败", "error");
    }
  }

  async function processImages() {
    if (!images.length) {
      toast.show("请先选择图片或图片文件夹", "error");
      return;
    }
    if (!outputDir) {
      toast.show("请先选择输出目录", "error");
      return;
    }

    setProcessing(true);
    setProgress(0);
    setResults([]);
    try {
      const nextResults = await invoke<ProcessResult[]>("process_images", {
        imagePaths: images.map((image) => image.file_path),
        outputDir,
        platform,
      });
      setResults(nextResults);
      setProgress(100);
      const failed = nextResults.length - nextResults.filter((result) => result.status === "success").length;
      toast.show(
        failed > 0
          ? "处理完成：" + (nextResults.length - failed) + " 张成功，" + failed + " 张失败"
          : "处理完成：" + nextResults.length + " 张图片已输出",
        failed > 0 ? "info" : "success"
      );
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : "批量处理失败", "error");
    } finally {
      setProcessing(false);
    }
  }

  async function openOutputDir() {
    if (!outputDir) return;
    try {
      await invoke("open_image_output_folder", { folderPath: outputDir });
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : "打开输出目录失败", "error");
    }
  }

  function clearAll() {
    setImages([]);
    setResults([]);
    setProgress(0);
  }

  return (
    <div className="image-resize-page">
      <section className="card image-resize__hero">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">产品尺寸调整</div>
            <span className="card__hint">批量转换美团 / 饿了么平台产品图尺寸，图片只在本机处理，不上传云端</span>
          </div>
        </div>
        <div className="card__body">
          <div className="image-resize__platforms">
            {(Object.keys(PLATFORM_COPY) as ResizePlatform[]).map((key) => {
              const current = PLATFORM_COPY[key];
              return (
                <button
                  key={key}
                  className="image-resize__platform"
                  data-active={platform === key}
                  type="button"
                  onClick={() => setPlatform(key)}
                  disabled={processing}
                >
                  <strong>{current.label}</strong>
                  <span>{current.dimensions}</span>
                  <small>{current.hint}</small>
                </button>
              );
            })}
          </div>
          <div className="image-resize__rule">
            当前输出规则：<strong>{spec.label} {spec.dimensions}</strong> · {spec.hint}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">选择图片</div>
            <span className="card__hint">支持 JPG、PNG、WEBP、BMP、GIF；选择文件夹会递归扫描子文件夹</span>
          </div>
          <span className="badge" data-tone="info">已选 {images.length} 张</span>
        </div>
        <div className="card__body">
          <div className="image-resize__toolbar">
            <button className="btn btn--secondary" type="button" onClick={selectImages} disabled={processing}>
              <IconImage /> 选择图片
            </button>
            <button className="btn btn--secondary" type="button" onClick={selectFolder} disabled={processing}>
              <IconFolder /> 选择文件夹
            </button>
            <button className="btn btn--ghost" type="button" onClick={clearAll} disabled={processing || !images.length}>
              <IconRefresh /> 清除全部
            </button>
          </div>
          {images.length ? (
            <div className="image-resize__list">
              {images.map((image, index) => (
                <div className="image-resize__row" key={image.file_path + "-" + index}>
                  <IconImage />
                  <div className="image-resize__row-main">
                    <strong title={image.file_path}>{image.file_name}</strong>
                    <span>{image.width}×{image.height} · {formatBytes(image.file_size)}</span>
                  </div>
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    disabled={processing}
                    title="移除图片"
                  >
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty empty--inline">请选择图片或文件夹，图片会显示在这里。</div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">输出目录</div>
            <span className="card__hint">输出文件统一保留原文件名，扩展名改为 .jpg；同名文件会覆盖</span>
          </div>
        </div>
        <div className="card__body">
          <div className="image-resize__output-row">
            <button className="btn btn--secondary" type="button" onClick={selectOutputDir} disabled={processing}>
              <IconFolder /> 选择输出目录
            </button>
            <span className="image-resize__path" title={outputDir}>{outputDir || "尚未选择输出目录"}</span>
          </div>
          <div className="image-resize__actions">
            <button className="btn btn--primary btn--lg" type="button" onClick={processImages} disabled={processing || !images.length || !outputDir}>
              <IconPlay /> {processing ? "正在处理…" : "开始处理" + (images.length ? " (" + images.length + " 张)" : "")}
            </button>
            <button className="btn btn--ghost btn--lg" type="button" onClick={openOutputDir} disabled={!outputDir || processing}>
              <IconDownload /> 打开输出目录
            </button>
          </div>
          {processing || progress === 100 ? (
            <div className="image-resize__progress" aria-live="polite">
              <div className="image-resize__progress-head">
                <span>{processing ? "正在处理图片…" : "处理完成：" + successCount + "/" + results.length + " 成功"}</span>
                <strong>{progress}%</strong>
              </div>
              <div className="image-resize__progress-track"><div style={{ width: progress + "%" }} /></div>
            </div>
          ) : null}
        </div>
      </section>

      {results.length ? (
        <section className="card">
          <div className="card__header">
            <div className="card__heading">
              <div className="card__title">处理结果</div>
              <span className="card__hint">成功项已写入输出目录，失败项不会影响其它图片继续处理</span>
            </div>
            <span className="badge" data-tone={successCount === results.length ? "success" : "warn"}>{successCount}/{results.length} 成功</span>
          </div>
          <div className="card__body image-resize__results">
            {results.map((result, index) => (
              <div className={"image-resize__result image-resize__result--" + result.status} key={result.file_name + "-" + index}>
                {result.status === "success" ? <IconCheck /> : <IconClose />}
                <div>
                  <strong>{result.file_name}</strong>
                  {result.status === "success" ? (
                    <span>{result.input_dimensions} → {result.output_dimensions} · {formatBytes(result.input_size)} → {formatBytes(result.output_size)}</span>
                  ) : (
                    <span>{result.error || "处理失败"}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
