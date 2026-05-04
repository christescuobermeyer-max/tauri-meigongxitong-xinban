import type { GenerationItem, GenerationStatus, UploadedImage } from "../types";

export interface ProductBatchEntry {
  sourceImageId: string;
  sourceName: string;
  productName: string;
  previewUrl: string;
  item: GenerationItem;
}

export type GenerationItemUpdate =
  | GenerationItem
  | ((previous: GenerationItem) => GenerationItem);

export function buildProductBatchEntries(
  images: UploadedImage[],
  status: GenerationStatus = "idle"
): ProductBatchEntry[] {
  return images.map((image, index) => ({
    sourceImageId: image.id,
    sourceName: image.name,
    productName: resolveProductBatchName(image, index),
    previewUrl: image.dataUrl,
    item: {
      kind: "product",
      rawBase64: null,
      rawDataUrl: null,
      status,
    },
  }));
}

export function syncProductBatchEntries(
  images: UploadedImage[],
  previousEntries: ProductBatchEntry[]
): ProductBatchEntry[] {
  return images.map((image, index) => {
    const previous = previousEntries.find((entry) => entry.sourceImageId === image.id);
    return {
      sourceImageId: image.id,
      sourceName: image.name,
      productName: resolveProductBatchName(image, index),
      previewUrl: image.dataUrl,
      item: previous?.item ?? {
        kind: "product",
        rawBase64: null,
        rawDataUrl: null,
        status: "idle",
      },
    };
  });
}

export function applyProductBatchEntryUpdate(
  entries: ProductBatchEntry[],
  sourceImageId: string,
  update: GenerationItemUpdate
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

export function hasBusyProductBatchEntries(entries: ProductBatchEntry[]) {
  return entries.some((entry) => entry.item.status === "queued" || entry.item.status === "running");
}

export function getProductBatchCompletedCount(entries: ProductBatchEntry[]) {
  return entries.filter((entry) => entry.item.status === "succeeded").length;
}

export function resolveProductBatchReferenceImages(
  styleImages: UploadedImage[],
  sourceImage: UploadedImage
) {
  const styleImage = styleImages[0];
  const styleReference = styleImage?.productOssUrl ?? styleImage?.productBase64;
  const sourceReference = sourceImage.productOssUrl ?? sourceImage.productBase64;
  return [styleReference, sourceReference].filter((value): value is string => Boolean(value));
}

function resolveProductBatchName(image: UploadedImage, index: number) {
  return image.productName.trim() || `产品${index + 1}`;
}
