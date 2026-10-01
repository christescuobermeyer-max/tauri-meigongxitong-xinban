import { buildImageEditBatchEntries, getImageEditSourceMaxCount, syncImageEditBatchEntries, type ImageEditKind } from "../../lib/image-edit";
import { ensureUploadedImagesOnOss } from "../../lib/oss-assets";
import { emptyItem } from "../../lib/workspace-session";
import type { UploadedImage } from "../../types";
import { createImageEditBatchRunner } from "./batch-runner";
import type { Options } from "./types";
import type { useImageEditState } from "./useImageEditState";
type Context = ReturnType<typeof useImageEditState> & Options;

export function createImageEditBatchActions(context: Context) {
  const { generationLine, onToast, shopName, platform, currentPlatform, busy, entries, patchEntry, createBatchSetter, setEntries } = context;
  const runBatchItem = createImageEditBatchRunner(context);
  async function generateBatch(kind: ImageEditKind) {
    const entry = entries[kind];
    if (busy) return;
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    if (entry.images.length === 0) {
      onToast(`请先上传需要批量修改的${kind === "product" ? "产品图" : "图片"}`, "error");
      return;
    }
    if (entry.images.length > getImageEditSourceMaxCount(kind, "batch")) {
      onToast(`批量修改最多支持 ${getImageEditSourceMaxCount(kind, "batch")} 张图片`, "error");
      return;
    }
    if (!entry.instruction.trim()) {
      onToast("请填写需要修改的文字要求", "error");
      return;
    }

    const snapshot = {
      shopName,
      platform,
      currentPlatform,
      generationLine,
      instruction: entry.instruction,
    };

    patchEntry(kind, {
      item: emptyItem(kind),
      batchEntries: buildImageEditBatchEntries(kind, entry.images, "queued"),
    });
    onToast(`正在上传 ${entry.images.length + entry.referenceImages.length} 张素材到 OSS，请稍候…`, "info");

    let syncedImages: UploadedImage[];
    let syncedReferenceImages: UploadedImage[];
    try {
      syncedImages = await ensureUploadedImagesOnOss(entry.images);
      syncedReferenceImages = await ensureUploadedImagesOnOss(entry.referenceImages);
      patchEntry(kind, {
        images: syncedImages,
        referenceImages: syncedReferenceImages,
        batchEntries: buildImageEditBatchEntries(kind, syncedImages, "queued"),
      });
    } catch (error: unknown) {
      patchEntry(kind, {
        batchEntries: buildImageEditBatchEntries(kind, entry.images, "idle"),
      });
      onToast(`上传参考图到 OSS 失败：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }

    onToast(`素材上传完成，开始批量逐张修改 ${syncedImages.length} 张图片，请耐心等待…`, "info");
    for (const [index, image] of syncedImages.entries()) {
      await runBatchItem(kind, image, syncedReferenceImages, snapshot, index + 1, syncedImages.length);
    }
  }

  async function retryBatchItem(kind: ImageEditKind, sourceImageId: string) {
    const entry = entries[kind];
    if (busy) return;
    if (!platform || !currentPlatform) {
      onToast("请先选择投放平台：美团或淘宝闪购", "error");
      return;
    }
    const sourceImage = entry.images.find((image) => image.id === sourceImageId);
    if (!sourceImage) {
      onToast("未找到对应的原图", "error");
      return;
    }
    if (!entry.instruction.trim()) {
      onToast("请填写需要修改的文字要求", "error");
      return;
    }

    const snapshot = {
      shopName,
      platform,
      currentPlatform,
      generationLine,
      instruction: entry.instruction,
    };
    createBatchSetter(kind, sourceImageId)({ ...emptyItem(kind), status: "queued" });

    try {
      const syncedImages = await ensureUploadedImagesOnOss(entry.images);
      const syncedReferenceImages = await ensureUploadedImagesOnOss(entry.referenceImages);
      setEntries((prev) => ({
        ...prev,
        [kind]: {
          ...prev[kind],
          images: syncedImages,
          referenceImages: syncedReferenceImages,
          batchEntries: syncImageEditBatchEntries(kind, syncedImages, prev[kind].batchEntries),
        },
      }));
      const syncedImage = syncedImages.find((image) => image.id === sourceImageId);
      if (!syncedImage) {
        onToast("未找到对应的原图", "error");
        return;
      }
      const index = syncedImages.findIndex((image) => image.id === sourceImageId);
      await runBatchItem(kind, syncedImage, syncedReferenceImages, snapshot, index + 1, syncedImages.length);
    } catch (error: unknown) {
      createBatchSetter(kind, sourceImageId)((prev) => ({
        ...prev,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      onToast(`重新修改失败：${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  return { generateBatch, retryBatchItem };
}
