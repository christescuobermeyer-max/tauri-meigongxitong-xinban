import type { AssetKind, GenerationItem, GenerationStatus, PlatformSpec, UploadedImage } from "../types";
import { PICTURE_WALL_EXPORT_SIZE, PICTURE_WALL_SOURCE_SIZE } from "./picture-wall";

export type ImageEditKind = Extract<
  AssetKind,
  "avatar" | "storefront" | "poster" | "product" | "picture_wall"
>;

export const IMAGE_EDIT_KINDS: ImageEditKind[] = [
  "avatar",
  "storefront",
  "poster",
  "product",
  "picture_wall",
];

export type ImageEditMode = "single" | "batch";

export const IMAGE_EDIT_BATCH_MAX_IMAGES = 20;

export const IMAGE_EDIT_LABEL: Record<ImageEditKind, string> = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
  product: "产品图",
  picture_wall: "图片墙",
};

export interface ImageEditBatchEntry {
  sourceImageId: string;
  sourceName: string;
  productName: string;
  previewUrl: string;
  item: GenerationItem;
}

export type ImageEditBatchEntryUpdate =
  | GenerationItem
  | ((previous: GenerationItem) => GenerationItem);

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

export function buildImageEditPrompt(options: {
  kind: ImageEditKind;
  instruction: string;
  referenceUrl?: string;
  referenceUrls?: string[];
  optionalReferenceUrls?: string[];
  shopName: string;
  productName?: string;
  batchIndex?: number;
  batchTotal?: number;
}) {
  const label = IMAGE_EDIT_LABEL[options.kind];
  const shop = options.shopName.trim() || "未命名店铺";
  const product = options.productName?.trim();
  const productText = options.kind === "product" && product ? `产品名称：“${product}”。` : "";
  const referenceUrls = normalizeReferenceUrls(options.referenceUrls, options.referenceUrl);
  const optionalReferenceUrls = normalizeReferenceUrls(options.optionalReferenceUrls);
  const optionalReferenceAsEditBase =
    optionalReferenceUrls.length > 0 && shouldUseOptionalReferenceAsEditBase(options.instruction);
  const referenceText = formatReferenceText(
    label,
    referenceUrls,
    optionalReferenceAsEditBase ? optionalReferenceUrls.length : 0
  );
  const optionalReferenceText = formatOptionalReferenceText(
    referenceUrls.length,
    optionalReferenceUrls,
    optionalReferenceAsEditBase
  );
  const roleText = formatImageEditRoleText(
    label,
    referenceUrls.length,
    optionalReferenceUrls.length,
    optionalReferenceAsEditBase
  );
  const packageText =
    options.kind === "product" && referenceUrls.length > 1
      ? `本次是多产品套餐图修改，请把这 ${referenceUrls.length} 张产品图中的主体食物都合理融入同一张成图，不能遗漏任何一张，不能只保留第一张。`
      : "";
  const batchText =
    options.batchIndex && options.batchTotal
      ? `本次是批量逐张修改中的第 ${options.batchIndex}/${options.batchTotal} 张，只处理当前这一张原图，不要融合、引用或复刻其他批量图片的主体内容。`
      : "";
  return `店铺名称：“${shop}”。${productText}${referenceText}${optionalReferenceText}${roleText}${packageText}${batchText}请严格以上传图片为基础，按照修改要求：“${options.instruction.trim()}” 对图片进行修改和调整。除非修改要求明确要求替换主体、食物或参考图元素，否则保持原图主体、基础构图、透视关系和平台展示用途不变，只修改用户明确提出的内容。除非修改要求中明确说明，不要添加促销价格、二维码、地址、电话、联系方式或其他无关营销元素。`;
}

export function getImageEditSpec(kind: ImageEditKind, platform: PlatformSpec) {
  if (kind === "avatar") {
    return {
      sourceLabel: "原图 1024×1024",
      exportLabel: `${platform.avatar.w}×${platform.avatar.h}`,
      uploadTitle: "上传 1 张头像图",
    };
  }

  if (kind === "storefront") {
    return {
      sourceLabel: "原图 1792×1024",
      exportLabel: `${platform.storefront.w}×${platform.storefront.h}`,
      uploadTitle: "上传 1 张店招图",
    };
  }

  if (kind === "poster") {
    return {
      sourceLabel: `原图 ${platform.poster.sourceLabel} 横版`,
      exportLabel: `${platform.poster.export.w}×${platform.poster.export.h}`,
      uploadTitle: "上传 1 张海报图",
    };
  }

  if (kind === "picture_wall") {
    return {
      sourceLabel: "原图 1024×1536（2:3 竖版）",
      exportLabel: `${PICTURE_WALL_SOURCE_SIZE.w}×${PICTURE_WALL_SOURCE_SIZE.h} + ${PICTURE_WALL_EXPORT_SIZE.w}×${PICTURE_WALL_EXPORT_SIZE.h}`,
      uploadTitle: "上传 1 张图片墙图",
    };
  }

  return {
    sourceLabel: `原图 ${platform.product.source.w}×${platform.product.source.h}`,
    exportLabel: `${platform.product.export.w}×${platform.product.export.h}`,
    uploadTitle: "上传 1-4 张产品图",
  };
}

export function resolveImageEditReference(images: Array<{
  productOssUrl?: string;
  productBase64?: string;
  base64?: string;
}>) {
  const first = images[0];
  return resolveUploadedImageReference(first);
}

export function resolveImageEditSourceReferences(images: Array<{
  productOssUrl?: string;
  productBase64?: string;
  base64?: string;
}>) {
  return images.map(resolveUploadedImageReference).filter(Boolean);
}

export function resolveImageEditReferences(
  sourceImages: Array<{
    productOssUrl?: string;
    productBase64?: string;
    base64?: string;
  }>,
  referenceImages: Array<{
    productOssUrl?: string;
    productBase64?: string;
    base64?: string;
  }>,
  instruction = ""
) {
  const sourceReferences = resolveImageEditSourceReferences(sourceImages);
  const optionalReferences = referenceImages.map(resolveUploadedImageReference).filter(Boolean);
  if (shouldUseOptionalReferenceAsEditBase(instruction) && optionalReferences.length > 0) {
    return [...optionalReferences, ...sourceReferences];
  }
  return [...sourceReferences, ...optionalReferences];
}

export function shouldUseOptionalReferenceAsEditBase(instruction: string) {
  const text = instruction.trim().replace(/\s+/g, "");
  if (!text.includes("参考图")) return false;
  return (
    /(以|用|按照|保留)参考图(作为|为|的)?(底图|基础|画面|场景|构图|背景|容器|锅|盘|碗)/.test(text) ||
    /产品图.*(替换|放入|放进|放到|移入|移到|加入|合成到).*参考图/.test(text) ||
    /参考图.*(锅|盘|碗|容器|场景|画面|背景).*(替换|放入|放进|放到|移入|加入|放置)/.test(text)
  );
}

function resolveUploadedImageReference(image?: {
  productOssUrl?: string;
  productBase64?: string;
  base64?: string;
}) {
  return image?.productOssUrl || image?.productBase64 || image?.base64 || "";
}

function normalizeReferenceUrls(referenceUrls?: string[], fallback?: string) {
  const urls = referenceUrls?.filter(Boolean) ?? [];
  if (urls.length > 0) return urls;
  return fallback ? [fallback] : [];
}

function formatReferenceText(label: string, referenceUrls: string[], startIndex = 0) {
  if (referenceUrls.length <= 1) {
    const orderText = startIndex > 0 ? `（传图顺序第 ${startIndex + 1} 张）` : "";
    return `上传的${label} OSS 地址${orderText}：${referenceUrls[0] || ""}。`;
  }
  const list = referenceUrls.map((url, index) => `第 ${startIndex + index + 1} 张 ${url}`).join("；");
  return `上传的${label} OSS 地址共 ${referenceUrls.length} 张：${list}。`;
}

function formatOptionalReferenceText(
  sourceCount: number,
  optionalReferenceUrls: string[],
  optionalReferenceFirst: boolean
) {
  if (optionalReferenceUrls.length === 0) return "";
  const prefix = `可选参考图 OSS 地址共 ${optionalReferenceUrls.length} 张`;
  const startIndex = optionalReferenceFirst ? 0 : sourceCount;
  const list = optionalReferenceUrls
    .map((url, index) => `第 ${startIndex + index + 1} 张 ${url}`)
    .join("；");
  return `${prefix}：${list}。`;
}

function formatImageEditRoleText(
  label: string,
  sourceCount: number,
  optionalReferenceCount: number,
  optionalReferenceFirst: boolean
) {
  if (optionalReferenceCount === 0) return "";
  const sourceStart = optionalReferenceFirst ? optionalReferenceCount + 1 : 1;
  const sourceRange =
    sourceCount > 1 ? `第 ${sourceStart}-${sourceStart + sourceCount - 1} 张` : `第 ${sourceStart} 张`;
  const optionalStart = optionalReferenceFirst ? 1 : sourceCount + 1;
  const optionalRange =
    optionalReferenceCount > 1
      ? `第 ${optionalStart}-${optionalStart + optionalReferenceCount - 1} 张`
      : `第 ${optionalStart} 张`;
  const baseRule = optionalReferenceFirst
    ? `请严格区分图片角色：${optionalRange}是“参考图（可选）”，也是最终画面的底图/场景图；${sourceRange}是主上传区的${label}原图/产品主体图，是要放入参考图场景的食物来源。除非修改要求明确指定使用参考图里的食物，严禁把参考图中的菜品、食物或商品主体复制、迁移或替换到主上传区原图里。`
    : `请严格区分图片角色：${sourceRange}是主上传区的${label}原图/产品主体图；${optionalRange}是“参考图（可选）”，默认只用于风格、构图、容器、场景、光影或细节参照。除非修改要求明确指定使用参考图里的食物，严禁把参考图中的菜品、食物或商品主体复制、迁移或替换到主上传区原图里。`;
  if (!optionalReferenceFirst) return baseRule;
  return `${baseRule}本次修改要求明确要把产品图食物放入参考图场景：最终画面必须以“参考图（可选）”作为构图、锅/盘/容器、背景、光影和透视基础；移除参考图锅里或容器里的原有食物，只保留容器与环境；再把主上传区产品图中的食物主体替换到参考图对应位置。严禁反向操作，不能把参考图里的食物替换到产品图中。`;
}

function resolveImageEditBatchName(image: UploadedImage, index: number) {
  return image.productName.trim() || `图片${index + 1}`;
}
