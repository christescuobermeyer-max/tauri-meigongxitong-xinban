import type { Platform, UploadedImage } from "../types";

const MAX_PACKAGE_PRODUCT_IMAGES = 6;

export function buildPackageImagePrompt(options: {
  shopName: string;
  productNames: string[];
  productImageCount?: number;
  platform: Platform;
}) {
  const shop = options.shopName.trim() || "未命名店铺";
  const names = normalizeProductNames(options.productNames);
  const productImageCount = normalizeProductImageCount(options.productImageCount ?? names.length);
  const productRangeText = productImageCount === 1 ? "第2张" : `第2张到第${productImageCount + 1}张`;
  const nameText = names.length ? `套餐包含产品：${names.join("、")}。` : "";
  const layout = options.platform === "meituan" ? "横版产品图" : "正方形产品图";

  return `输入的店铺名：${shop}。${nameText}本次请求包含多张参考图：第1张传给系统的参考图为参考设计风格图，${productRangeText}传给系统的参考图为需要同时融入套餐图的产品图。请严格区分参考图用途：第1张参考设计风格图只用于参考版式和风格，不是套餐产品来源；严禁保留、复制或描绘第1张图里的原菜品、餐具、包装、饮品或任何商品主体，也不要根据第1张图中的产品数量或种类补齐套餐。请以第1张参考设计风格图作为最终画面的版式模板，只保留它的背景氛围、构图结构、光影层次、配色方向和文案排版位置；如果第1张图中原本有产品主体，请用${productRangeText}产品图中的主体替换其位置，而不是叠加或保留原产品。成图中允许出现的可识别食物主体只能来自${productRangeText}套餐产品图和“套餐包含产品”名单，不得添加名单外的菜品、饮品、小食、包装商品或参考图原产品。请把${productRangeText}所有上传产品图中的真实食物主体都组合进同一张套餐图，必须保留每张产品图中的真实产品主体，不能遗漏任何一张产品图，不能只取第一张，不能凭空更换成其他食物，也不要生成多张图。如果某张产品图里除文件名对应产品外还有其他菜品、参考样例或背景商品，只提取该图的目标产品主体，其他元素忽略。请根据文件名中识别到的产品名称自动组织套餐表达，不要要求用户手动输入描述文字。生成一张适合外卖平台展示的${layout}。图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。`;
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
  return names.map((name) => name.trim()).filter(Boolean).slice(0, MAX_PACKAGE_PRODUCT_IMAGES);
}

function normalizeProductImageCount(count: number) {
  const normalized = Number.isFinite(count) ? Math.floor(count) : 0;
  return Math.min(Math.max(normalized, 1), MAX_PACKAGE_PRODUCT_IMAGES);
}

function resolveUploadedImageReference(image?: Partial<UploadedImage>) {
  return image?.productOssUrl || image?.productBase64 || image?.base64 || "";
}
