import { useEffect, useState } from "react";
import {
  applyPictureWallEntryUpdate,
  buildPictureWallEntries,
  failPendingPictureWallEntries,
  generatePictureWallItem,
  getPictureWallCompletedCount,
  hasBusyPictureWallEntries,
  syncPictureWallEntries,
  type PictureWallEntry,
} from "../lib/picture-wall";
import {
  downloadPictureWallEntries,
  type PictureWallDownloadProgress,
} from "../lib/picture-wall-download";
import type { UploadedImage } from "../types";
import type { GenerationItem, GenerationLine } from "../types";

interface Options {
  shopName: string;
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordPictureWallHistory?: (item: GenerationItem) => void;
}

export default function usePictureWallWorkspace({
  shopName,
  generationLine,
  onToast,
  onRecordPictureWallHistory,
}: Options) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [entries, setEntries] = useState<PictureWallEntry[]>([]);
  const [downloadStatus, setDownloadStatus] = useState<
    (PictureWallDownloadProgress & { active: boolean }) | null
  >(null);

  useEffect(() => {
    setEntries((previous) => syncPictureWallEntries(images, previous));
  }, [images]);

  const busy = hasBusyPictureWallEntries(entries);
  const completedCount = getPictureWallCompletedCount(entries);

  function validateInputs() {
    if (!shopName.trim()) {
      onToast("请输入店铺名称", "error");
      return false;
    }
    if (images.length !== 3) {
      onToast("请上传 3 张产品图片", "error");
      return false;
    }
    return true;
  }

  async function handleGenerate() {
    if (!validateInputs()) return;

    setEntries(buildPictureWallEntries(images, "queued"));
    onToast("正在按顺序生成 3 张图片墙，请耐心等待…", "info");

    for (const image of images) {
      const started = Date.now();
      setEntries((previous) =>
        applyPictureWallEntryUpdate(previous, image.id, (item) => ({
          ...item,
          status: "running",
          errorMessage: undefined,
        }))
      );

      try {
        const item = await generatePictureWallItem(image, shopName, generationLine);
        onRecordPictureWallHistory?.(item);
        setEntries((previous) =>
          applyPictureWallEntryUpdate(previous, image.id, {
            ...item,
            elapsedMs: Date.now() - started,
          })
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setEntries((previous) =>
          failPendingPictureWallEntries(previous, image.id, message)
        );
        onToast(`图片墙生成失败，已停止剩余排队任务：${message}`, "error");
        return;
      }
    }

    onToast("图片墙已生成完成", "success");
  }

  async function handleRetry(sourceImageId: string) {
    if (!shopName.trim()) {
      onToast("请输入店铺名称", "error");
      return;
    }
    const image = images.find((item) => item.id === sourceImageId);
    if (!image) {
      onToast("未找到要重试的产品图片，请重新上传", "error");
      return;
    }

    const started = Date.now();
    setEntries((previous) =>
      applyPictureWallEntryUpdate(previous, sourceImageId, (item) => ({
        ...item,
        status: "running",
        errorMessage: undefined,
      }))
    );

    try {
      const item = await generatePictureWallItem(image, shopName, generationLine);
      onRecordPictureWallHistory?.(item);
      setEntries((previous) =>
        applyPictureWallEntryUpdate(previous, sourceImageId, {
          ...item,
          elapsedMs: Date.now() - started,
        })
      );
      onToast("该图片墙已重新生成完成", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setEntries((previous) =>
        applyPictureWallEntryUpdate(previous, sourceImageId, (item) => ({
          ...item,
          status: "failed",
          errorMessage: message,
        }))
      );
      onToast(`图片墙重试失败：${message}`, "error");
    }
  }

  async function handleDownload() {
    try {
      setDownloadStatus({
        active: true,
        savedCount: 0,
        totalCount: completedCount * 2,
        currentImageIndex: 0,
        totalImages: completedCount,
        currentFileLabel: "选择文件夹",
        message: "请选择图片墙下载文件夹",
      });
      const saved = await downloadPictureWallEntries(entries, shopName, {
        onProgress: (progress) => setDownloadStatus({ ...progress, active: true }),
      });
      if (!saved || saved.length === 0) {
        setDownloadStatus(null);
        return;
      }
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `下载完成，共保存 ${saved.length} 个文件` } : null
      );
      onToast(`图片下载完成，已保存 ${saved.length} 个文件`, "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `下载失败：${message}` } : null
      );
      onToast(`下载失败：${message}`, "error");
    }
  }

  return {
    images,
    setImages,
    entries,
    downloadStatus,
    busy,
    completedCount,
    handleGenerate,
    handleRetry,
    handleDownload,
  };
}
