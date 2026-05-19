import { useEffect, useState } from "react";
import {
  applyPictureWallEntryUpdate,
  buildPictureWallEntries,
  failPendingPictureWallEntries,
  generatePictureWallItem,
  getPictureWallFailedSourceImageIds,
  getPictureWallCompletedCount,
  hasBusyPictureWallEntries,
  queuePictureWallEntriesForRetry,
  syncPictureWallEntries,
  type PictureWallEntry,
} from "../lib/picture-wall";
import {
  downloadPictureWallEntries,
  downloadSinglePictureWallEntry,
  type PictureWallDownloadProgress,
} from "../lib/picture-wall-download";
import { getAutoRetryAttempt } from "../lib/generation-retry";
import type {
  AssetKind,
  BrandStyle,
  GenerationItem,
  GenerationLine,
  Platform,
  ThemeColor,
  UploadedImage,
} from "../types";

const PICTURE_WALL_PLATFORM: Platform = "meituan";

interface Options {
  generationLine: GenerationLine;
  setGenerationLine: (line: GenerationLine) => void;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  onRecordHistory: (
    kind: AssetKind,
    item: GenerationItem,
    shopName: string,
    platform: Platform
  ) => void;
}

export default function usePictureWallWorkspace({
  generationLine,
  setGenerationLine,
  onToast,
  onRecordHistory,
}: Options) {
  const [shopName, setShopName] = useState("");
  const [themeColor, setThemeColor] = useState<ThemeColor | "">("");
  const [brandStyle, setBrandStyle] = useState<BrandStyle | "">("");
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

    const snapshot = {
      shopName: shopName.trim(),
      generationLine,
      appearance: {
        themeColor: themeColor || undefined,
        brandStyle: brandStyle || undefined,
      },
    };

    const failedSourceImageIds = getPictureWallFailedSourceImageIds(entries);
    const shouldRetryFailedOnly = failedSourceImageIds.length > 0;
    const targetImages = shouldRetryFailedOnly
      ? images.filter((image) => failedSourceImageIds.includes(image.id))
      : images;

    setEntries((previous) =>
      shouldRetryFailedOnly
        ? queuePictureWallEntriesForRetry(previous, failedSourceImageIds)
        : buildPictureWallEntries(images, "queued")
    );
    onToast(
      shouldRetryFailedOnly
        ? `正在补生成 ${targetImages.length} 张失败图片墙，请耐心等待…`
        : "正在按顺序生成 3 张图片墙，请耐心等待…",
      "info"
    );

    for (const image of targetImages) {
      const started = Date.now();
      setEntries((previous) =>
        applyPictureWallEntryUpdate(previous, image.id, (item) => ({
          ...item,
          status: "running",
          errorMessage: undefined,
        }))
      );

      try {
        const item = await generatePictureWallItem(image, snapshot.shopName, snapshot.generationLine, {
          appearance: snapshot.appearance,
          onAttempt: (attempt) =>
            setEntries((previous) =>
              applyPictureWallEntryUpdate(previous, image.id, (current) => ({
                ...current,
                status: "running",
                errorMessage: undefined,
                attempt,
              }))
            ),
        });
        onRecordHistory("picture_wall", item, snapshot.shopName, PICTURE_WALL_PLATFORM);
        setEntries((previous) =>
          applyPictureWallEntryUpdate(previous, image.id, {
            ...item,
            elapsedMs: Date.now() - started,
          })
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const attempt = getAutoRetryAttempt(error);
        setEntries((previous) =>
          failPendingPictureWallEntries(previous, image.id, message, attempt)
        );
        onToast(`图片墙生成失败，已停止剩余排队任务：${message}`, "error");
        return;
      }
    }

    onToast(shouldRetryFailedOnly ? "失败图片墙已补生成完成" : "图片墙已生成完成", "success");
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

    const snapshot = {
      shopName: shopName.trim(),
      generationLine,
      appearance: {
        themeColor: themeColor || undefined,
        brandStyle: brandStyle || undefined,
      },
    };

    const started = Date.now();
    setEntries((previous) =>
      applyPictureWallEntryUpdate(previous, sourceImageId, (item) => ({
        ...item,
        status: "running",
        errorMessage: undefined,
      }))
    );

    try {
      const item = await generatePictureWallItem(image, snapshot.shopName, snapshot.generationLine, {
        appearance: snapshot.appearance,
        onAttempt: (attempt) =>
          setEntries((previous) =>
            applyPictureWallEntryUpdate(previous, sourceImageId, (current) => ({
              ...current,
              status: "running",
              errorMessage: undefined,
              attempt,
            }))
          ),
      });
      onRecordHistory("picture_wall", item, snapshot.shopName, PICTURE_WALL_PLATFORM);
      setEntries((previous) =>
        applyPictureWallEntryUpdate(previous, sourceImageId, {
          ...item,
          elapsedMs: Date.now() - started,
        })
      );
      onToast("该图片墙已重新生成完成", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = getAutoRetryAttempt(error);
      setEntries((previous) =>
        applyPictureWallEntryUpdate(previous, sourceImageId, (item) => ({
          ...item,
          status: "failed",
          errorMessage: message,
          attempt: attempt ?? item.attempt,
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

  async function handleDownloadSingle(sourceImageId: string) {
    const index = entries.findIndex((entry) => entry.sourceImageId === sourceImageId);
    if (index < 0) return;
    const entry = entries[index];
    if (entry.item.status !== "succeeded" || !entry.item.rawBase64) {
      onToast("该图片暂未生成完成，无法下载", "error");
      return;
    }
    const number = index + 1;
    try {
      setDownloadStatus({
        active: true,
        savedCount: 0,
        totalCount: 2,
        currentImageIndex: number,
        totalImages: 1,
        currentFileLabel: "选择文件夹",
        message: `请选择第 ${number} 张图片的下载文件夹`,
      });
      const saved = await downloadSinglePictureWallEntry(entry, shopName, number, {
        onProgress: (progress) => setDownloadStatus({ ...progress, active: true }),
      });
      if (!saved || saved.length === 0) {
        setDownloadStatus(null);
        return;
      }
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `第 ${number} 张已下载，共保存 ${saved.length} 个文件` } : null
      );
      onToast(`第 ${number} 张已下载，已保存 ${saved.length} 个文件`, "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setDownloadStatus((previous) =>
        previous ? { ...previous, active: false, message: `下载失败：${message}` } : null
      );
      onToast(`下载失败：${message}`, "error");
    }
  }

  return {
    generationLine,
    setGenerationLine,
    shopName,
    setShopName,
    themeColor,
    setThemeColor,
    brandStyle,
    setBrandStyle,
    images,
    setImages,
    entries,
    downloadStatus,
    busy,
    completedCount,
    handleGenerate,
    handleRetry,
    handleDownload,
    handleDownloadSingle,
  };
}
