import { generateImage, uploadImageToOss } from "./tauri";
import { compressAndArchiveGenerated } from "./oss-assets";
import { runWithAutoRetry } from "./generation-retry";
import { safeFileName } from "./utils";
import type {
  AppearanceOptions,
  BrandStyle,
  GenerationItem,
  GenerationLine,
  GenerationStatus,
  ThemeColor,
  UploadedImage,
} from "../types";

const THEME_COLOR_HINTS_PW: Record<ThemeColor, string> = {
  light: "整体采用浅色主题配色，以明亮干净的浅色调（白、米、奶油等）作为画面主色，营造清新通透的视觉感",
  dark: "整体采用深色主题配色，以沉稳深邃的深色调（深棕、墨黑、暗夜蓝等）作为画面主色，营造高端质感与戏剧氛围",
  red: "整体采用红色主题配色，以红色作为画面主色调，营造热情诱人、食欲浓烈的氛围",
  yellow: "整体采用黄色主题配色，以黄色作为画面主色调，营造温暖明亮、活力诱人的氛围",
  orange: "整体采用橙色主题配色，以橙色作为画面主色调，营造食欲诱人的暖橙氛围",
};

const BRAND_STYLE_HINTS_PW: Record<BrandStyle, string> = {
  young: "整体走年轻化风格，配色活泼、构图大胆，富有视觉活力，符合年轻消费群体审美",
  lifeFire: "整体走生活烟火风格，氛围真实接地气，富有市井烟火气息和生活温度",
  fresh: "整体走清爽风格，画面干净简约，色彩明快不杂乱，给人清爽舒适的观感",
};

function buildAppearanceClausePW(themeColor?: ThemeColor, brandStyle?: BrandStyle): string {
  const parts: string[] = [];
  if (themeColor && THEME_COLOR_HINTS_PW[themeColor]) parts.push(THEME_COLOR_HINTS_PW[themeColor]);
  if (brandStyle && BRAND_STYLE_HINTS_PW[brandStyle]) parts.push(BRAND_STYLE_HINTS_PW[brandStyle]);
  return parts.length ? parts.join("；") + "。" : "";
}

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
  productOssUrl: string,
  appearance: AppearanceOptions = {}
): string {
  const shop = shopName.trim() || "未命名店铺";
  const product = productName.trim() || "未命名产品";
  const appearanceClause = buildAppearanceClausePW(appearance.themeColor, appearance.brandStyle);
  return `参考上传的产品图，为这个外卖店铺“${shop}” 的产品名称：“${product}” 的店铺设计生成一张醒目且极具冲击力的广告海报KV，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。
上传的产品图 OSS URL：${productOssUrl}
图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。${appearanceClause}`;
}

export function buildPictureWallEntries(
  images: UploadedImage[],
  status: GenerationStatus = "queued"
): PictureWallEntry[] {
  return images.map((image) => ({
    sourceImageId: image.id,
    sourceName: image.name,
    previewUrl: image.dataUrl,
    item: buildEmptyPictureWallItem(status),
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
      item: previous?.item ?? buildEmptyPictureWallItem("idle"),
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

export function getPictureWallFailedSourceImageIds(entries: PictureWallEntry[]) {
  return entries
    .filter((entry) => entry.item.status === "failed")
    .map((entry) => entry.sourceImageId);
}

export function queuePictureWallEntriesForRetry(
  entries: PictureWallEntry[],
  sourceImageIds: string[]
): PictureWallEntry[] {
  const retryIds = new Set(sourceImageIds);
  return entries.map((entry) =>
    retryIds.has(entry.sourceImageId)
      ? { ...entry, item: buildEmptyPictureWallItem("queued") }
      : entry
  );
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

function buildEmptyPictureWallItem(status: GenerationStatus): GenerationItem {
  return {
    kind: "picture_wall",
    rawBase64: null,
    rawDataUrl: null,
    status,
  };
}

export async function generatePictureWallItem(
  sourceImage: UploadedImage,
  shopName: string,
  generationLine: GenerationLine,
  options: { onAttempt?: (attempt: number) => void; appearance?: AppearanceOptions } = {}
) {
  const productOssUrl = await resolvePictureWallProductOssUrl(sourceImage, shopName);
  const generated = await runWithAutoRetry({
    onAttempt: (attempt) => options.onAttempt?.(attempt),
    run: async () => ({
      rawBase64: await generateImage({
        prompt: buildPictureWallPrompt(shopName, sourceImage.productName, productOssUrl, options.appearance ?? {}),
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
