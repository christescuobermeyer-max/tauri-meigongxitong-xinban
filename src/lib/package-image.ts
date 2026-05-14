import type { Platform, UploadedImage } from "../types";

export function buildPackageImagePrompt(options: {
  shopName: string;
  productNames: string[];
  platform: Platform;
}) {
  const shop = options.shopName.trim() || "未命名店铺";
  const names = normalizeProductNames(options.productNames);
  const nameText = names.length ? `套餐包含产品：${names.join("、")}。` : "";
  const layout = options.platform === "meituan" ? "横版产品图" : "正方形产品图";

  return `输入的店铺名：${shop}。${nameText}本次请求包含多张参考图：第1张传给系统的参考图为参考设计风格图，第2张到第5张传给系统的参考图为需要同时融入套餐图的产品图。请以第1张参考设计风格图作为最终画面的版式模板，保留它的背景氛围、构图结构、光影层次、配色方向和文案排版位置。请把后续所有上传产品图中的真实食物主体都组合进同一张套餐图，必须保留每张产品图中的真实产品主体，不能遗漏任何一张产品图，不能只取第一张，不能凭空更换成其他食物，也不要生成多张图。请根据文件名中识别到的产品名称自动组织套餐表达，不要要求用户手动输入描述文字。生成一张适合外卖平台展示的${layout}。图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。`;
}

export function resolvePackageImageReferences(
  styleImages: Array<Partial<UploadedImage>>,
  productImages: Array<Partial<UploadedImage>>
) {
  return [
    resolveUploadedImageReference(styleImages[0]),
    ...productImages.map(resolveUploadedImageReference),
  ].filter((value): value is string => Boolean(value));
}

export function resolvePackageImageProductNames(images: Array<Pick<UploadedImage, "productName">>) {
  return normalizeProductNames(images.map((image) => image.productName));
}

export function resolvePackageImageProductName(images: Array<Pick<UploadedImage, "productName">>) {
  const names = resolvePackageImageProductNames(images);
  return names.length ? `${names.join("、")}套餐图` : "套餐图";
}

function normalizeProductNames(names: string[]) {
  return names.map((name) => name.trim()).filter(Boolean).slice(0, 4);
}

function resolveUploadedImageReference(image?: Partial<UploadedImage>) {
  return image?.productOssUrl || image?.productBase64 || image?.base64 || "";
}
