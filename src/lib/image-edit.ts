import type { AssetKind, PlatformSpec } from "../types";

export type ImageEditKind = Extract<AssetKind, "avatar" | "storefront" | "poster" | "product">;

export const IMAGE_EDIT_KINDS: ImageEditKind[] = ["avatar", "storefront", "poster", "product"];

export const IMAGE_EDIT_LABEL: Record<ImageEditKind, string> = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
  product: "产品图",
};

export function getImageEditSourceMaxCount(kind: ImageEditKind) {
  return kind === "product" ? 4 : 1;
}

export function buildImageEditPrompt(options: {
  kind: ImageEditKind;
  instruction: string;
  referenceUrl?: string;
  referenceUrls?: string[];
  shopName: string;
  productName?: string;
}) {
  const label = IMAGE_EDIT_LABEL[options.kind];
  const shop = options.shopName.trim() || "未命名店铺";
  const product = options.productName?.trim();
  const productText = options.kind === "product" && product ? `产品名称：“${product}”。` : "";
  const referenceUrls = normalizeReferenceUrls(options.referenceUrls, options.referenceUrl);
  const referenceText = formatReferenceText(label, referenceUrls);
  const packageText =
    options.kind === "product" && referenceUrls.length > 1
      ? `本次是多产品套餐图修改，请把这 ${referenceUrls.length} 张产品图中的主体食物都合理融入同一张成图，不能遗漏任何一张，不能只保留第一张。`
      : "";
  return `店铺名称：“${shop}”。${productText}${referenceText}${packageText}请严格以上传图片为基础，按照修改要求：“${options.instruction.trim()}” 对图片进行修改和调整。除非修改要求明确要求替换主体、食物或参考图元素，否则保持原图主体、基础构图、透视关系和平台展示用途不变，只修改用户明确提出的内容。除非修改要求中明确说明，不要添加促销价格、二维码、地址、电话、联系方式或其他无关营销元素。`;
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
  }>
) {
  return [
    ...resolveImageEditSourceReferences(sourceImages),
    ...referenceImages.map(resolveUploadedImageReference),
  ].filter(Boolean);
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

function formatReferenceText(label: string, referenceUrls: string[]) {
  if (referenceUrls.length <= 1) {
    return `上传的${label} OSS 地址：${referenceUrls[0] || ""}。`;
  }
  const list = referenceUrls.map((url, index) => `第 ${index + 1} 张 ${url}`).join("；");
  return `上传的${label} OSS 地址共 ${referenceUrls.length} 张：${list}。`;
}
