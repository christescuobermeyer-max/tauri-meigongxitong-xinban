import { generateImage, uploadImageToOss } from "./tauri";
import { compressAndArchiveGenerated } from "./oss-assets";
import { runWithAutoRetry } from "./generation-retry";
import { safeFileName } from "./utils";
import type { GenerationItem, GenerationLine, GenerationStatus, UploadedImage } from "../types";

export const PICTURE_WALL_SOURCE_SIZE = { w: 1086, h: 1448 };
export const PICTURE_WALL_EXPORT_SIZE = { w: 240, h: 330 };
export const PICTURE_WALL_GENERATION_SIZE = "1024x1536";
const APIMART_PICTURE_WALL_SIZE = "3:4";

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
  return entries.filter(
    (entry) => entry.item.status === "succeeded" && entry.item.rawBase64 && entry.item.remoteUrl
  ).length;
}

export function failPendingPictureWallEntries(
  entries: PictureWallEntry[],
  failedSourceImageId: string,
  errorMessage: string,
  attempt?: number
): PictureWallEntry[] {
  return entries.map((entry) => {
    if (entry.sourceImageId === failedSourceImageId) {
      return {
        ...entry,
        item: {
          ...entry.item,
          status: "failed",
          errorMessage,
          attempt: attempt ?? entry.item.attempt,
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
  generationLine: GenerationLine,
  options: { onAttempt?: (attempt: number) => void } = {}
) {
  const productOssUrl = await resolvePictureWallProductOssUrl(sourceImage, shopName);
  const generated = await runWithAutoRetry({
    onAttempt: (attempt) => options.onAttempt?.(attempt),
    run: async () => ({
      rawBase64: await generateImage({
        prompt: buildPictureWallPrompt(shopName, sourceImage.productName, productOssUrl),
        size: resolvePictureWallGenerationSize(generationLine),
        product_images: [productOssUrl],
        api_line: generationLine,
      }),
    }),
  });
  const archive = await archivePictureWallResult(generated.rawBase64, shopName, sourceImage.id);
  return {
    kind: "picture_wall" as const,
    rawBase64: generated.rawBase64,
    rawDataUrl: `data:image/png;base64,${generated.rawBase64}`,
    remoteUrl: archive,
    generationLine,
    status: "succeeded" as const,
    attempt: generated.attempt,
  };
}

function resolvePictureWallGenerationSize(generationLine: GenerationLine) {
  return generationLine === "line5" ? APIMART_PICTURE_WALL_SIZE : PICTURE_WALL_GENERATION_SIZE;
}

async function archivePictureWallResult(rawBase64: string, shopName: string, sourceImageId: string) {
  try {
    return await compressAndArchiveGenerated(
      "picture_wall",
      rawBase64,
      `${safeFileName(shopName)}-picture-wall-${sourceImageId}`
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`图片墙生成结果上传 OSS 失败：${message}`);
  }
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
