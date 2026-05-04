import { generateImage, uploadImageToOss } from "./tauri";
import { safeFileName } from "./utils";
import type { GenerationItem, GenerationLine, GenerationStatus, UploadedImage } from "../types";

export const PICTURE_WALL_SOURCE_SIZE = { w: 1086, h: 1448 };
export const PICTURE_WALL_EXPORT_SIZE = { w: 240, h: 330 };
export const PICTURE_WALL_GENERATION_SIZE = "3:4";

export interface PictureWallEntry {
  sourceImageId: string;
  sourceName: string;
  previewUrl: string;
  item: GenerationItem;
}

type EntryUpdate = GenerationItem | ((previous: GenerationItem) => GenerationItem);

export function buildPictureWallPrompt(
  shopName: string,
  productName: string,
  productOssUrl: string
): string {
  const shop = shopName.trim() || "未命名店铺";
  const product = productName.trim() || "未命名产品";
  return `参考上传的产品图，为这个外卖店铺“${shop}” 的产品名称：“${product}” 的店铺设计生成一张醒目且极具冲击力的广告海报KV，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。
上传的产品图 OSS URL：${productOssUrl}
图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。`;
}

export function buildPictureWallEntries(
  images: UploadedImage[],
  status: GenerationStatus = "queued"
): PictureWallEntry[] {
  return images.map((image) => ({
    sourceImageId: image.id,
    sourceName: image.name,
    previewUrl: image.dataUrl,
    item: {
      kind: "picture_wall",
      rawBase64: null,
      rawDataUrl: null,
      status,
    },
  }));
}

export function syncPictureWallEntries(
  images: UploadedImage[],
  previousEntries: PictureWallEntry[]
): PictureWallEntry[] {
  return images.map((image) => {
    const previous = previousEntries.find((entry) => entry.sourceImageId === image.id);
    return {
      sourceImageId: image.id,
      sourceName: image.name,
      previewUrl: image.dataUrl,
      item: previous?.item ?? {
        kind: "picture_wall",
        rawBase64: null,
        rawDataUrl: null,
        status: "idle",
      },
    };
  });
}

export function applyPictureWallEntryUpdate(
  entries: PictureWallEntry[],
  sourceImageId: string,
  update: EntryUpdate
) {
  return entries.map((entry) => {
    if (entry.sourceImageId !== sourceImageId) return entry;
    const nextItem = typeof update === "function" ? update(entry.item) : update;
    return { ...entry, item: nextItem };
  });
}

export function hasBusyPictureWallEntries(entries: PictureWallEntry[]) {
  return entries.some((entry) => entry.item.status === "queued" || entry.item.status === "running");
}

export function getPictureWallCompletedCount(entries: PictureWallEntry[]) {
  return entries.filter((entry) => entry.item.status === "succeeded" && entry.item.rawBase64).length;
}

export function failPendingPictureWallEntries(
  entries: PictureWallEntry[],
  failedSourceImageId: string,
  errorMessage: string
): PictureWallEntry[] {
  return entries.map((entry) => {
    if (entry.sourceImageId === failedSourceImageId) {
      return {
        ...entry,
        item: {
          ...entry.item,
          status: "failed",
          errorMessage,
        },
      };
    }
    if (entry.item.status === "queued") {
      return {
        ...entry,
        item: {
          ...entry.item,
          status: "failed",
          errorMessage: "已停止生成：前一张图片生成失败",
        },
      };
    }
    return entry;
  });
}

export async function generatePictureWallItem(
  sourceImage: UploadedImage,
  shopName: string,
  generationLine: GenerationLine
) {
  const productOssUrl = await resolvePictureWallProductOssUrl(sourceImage, shopName);
  const rawBase64 = await generateImage({
    prompt: buildPictureWallPrompt(shopName, sourceImage.productName, productOssUrl),
    size: PICTURE_WALL_GENERATION_SIZE,
    product_images: [productOssUrl],
    api_line: generationLine,
  });
  const uploaded = await uploadImageToOss({
    base64_data: rawBase64,
    mime_type: "image/png",
    folder: "generated",
    file_name: `${safeFileName(shopName)}-picture-wall-${sourceImage.id}.png`,
  });
  return {
    kind: "picture_wall" as const,
    rawBase64,
    rawDataUrl: `data:image/png;base64,${rawBase64}`,
    remoteUrl: uploaded.url,
    generationLine,
    status: "succeeded" as const,
  };
}

async function resolvePictureWallProductOssUrl(
  sourceImage: UploadedImage,
  shopName: string
): Promise<string> {
  if (sourceImage.productOssUrl) return sourceImage.productOssUrl;
  const uploaded = await uploadImageToOss({
    base64_data: sourceImage.productBase64,
    mime_type: sourceImage.mime,
    folder: "uploads",
    file_name: `${safeFileName(shopName)}-picture-wall-source-${sourceImage.id}.jpg`,
  });
  return uploaded.url;
}
