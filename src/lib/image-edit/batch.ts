import type { GenerationStatus, UploadedImage } from "../../types";
import { IMAGE_EDIT_BATCH_MAX_IMAGES, type ImageEditKind, type ImageEditMode, type ImageEditBatchEntry, type ImageEditBatchEntryUpdate } from "./types";

export function getImageEditSourceMaxCount(kind: ImageEditKind, mode: ImageEditMode = "single") {
  if (mode === "batch") return IMAGE_EDIT_BATCH_MAX_IMAGES;
  return kind === "product" ? 4 : 1;
}

export function buildImageEditBatchEntries(
  kind: ImageEditKind,
  images: UploadedImage[],
  status: GenerationStatus = "idle"
): ImageEditBatchEntry[] {
  return images.map((image, index) => ({
    sourceImageId: image.id,
    sourceName: image.name,
    productName: resolveImageEditBatchName(image, index),
    previewUrl: image.dataUrl,
    item: {
      kind,
      rawBase64: null,
      rawDataUrl: null,
      status,
    },
  }));
}

export function syncImageEditBatchEntries(
  kind: ImageEditKind,
  images: UploadedImage[],
  previousEntries: ImageEditBatchEntry[]
): ImageEditBatchEntry[] {
  return images.map((image, index) => {
    const previous = previousEntries.find((entry) => entry.sourceImageId === image.id);
    return {
      sourceImageId: image.id,
      sourceName: image.name,
      productName: resolveImageEditBatchName(image, index),
      previewUrl: image.dataUrl,
      item: previous?.item ?? {
        kind,
        rawBase64: null,
        rawDataUrl: null,
        status: "idle",
      },
    };
  });
}

export function applyImageEditBatchEntryUpdate(
  entries: ImageEditBatchEntry[],
  sourceImageId: string,
  update: ImageEditBatchEntryUpdate
) {
  return entries.map((entry) => {
    if (entry.sourceImageId !== sourceImageId) return entry;
    const nextItem = typeof update === "function" ? update(entry.item) : update;
    return {
      ...entry,
      item: nextItem,
    };
  });
}

export function hasBusyImageEditBatchEntries(entries: ImageEditBatchEntry[]) {
  return entries.some((entry) => entry.item.status === "queued" || entry.item.status === "running");
}

export function getImageEditBatchCompletedCount(entries: ImageEditBatchEntry[]) {
  return entries.filter((entry) => entry.item.status === "succeeded").length;
}

function resolveImageEditBatchName(image: UploadedImage, index: number) {
  return image.productName.trim() || `图片${index + 1}`;
}
