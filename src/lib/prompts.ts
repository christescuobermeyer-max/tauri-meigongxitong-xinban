import type { Platform } from "../types";

/**
 * 头像 prompt：强调产品图融入、吸引力、1:1 外卖头像。
 */
export function buildAvatarPrompt(shopName: string): string {
  const name = shopName.trim();
  return `输入的店铺名：${name}。请参考输入的店铺名和上传的产品图，为这个店铺设计生成一张醒目且极具冲击力的广告电商头像logo图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。画面必须为1:1正方形构图，铺满整个正方形画面，不要圆形边框，不要圆形徽章，不要圆形裁切，内容需覆盖全部页面`;
}

/**
 * 头像 prompt：按店铺经营品类直接生成，不依赖上传参考图。
 */
export function buildAvatarCategoryPrompt(shopName: string, category: string): string {
  const name = shopName.trim();
  const categoryName = category.trim();
  return `输入的店铺名：${name}。店铺经营品类：${categoryName}。请参考输入的店铺名、店铺经营品类和上传的产品图中的食物，为这个店铺设计生成一张醒目且极具冲击力的广告电商头像logo图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。头像内容必须紧扣上传的产品图中的食物主体和该店铺经营品类，不能脱离上传的食物另起炉灶。画面必须为1:1正方形构图，铺满整个正方形画面，不要圆形边框，不要圆形徽章，不要圆形裁切，内容需覆盖全部页面`;
}

/**
 * 横版宣传图 prompt：参考店铺名和上一步生成的头像图。
 */
export function buildStorefrontPrompt(shopName: string): string {
  const name = shopName.trim();
  return `输入的店铺名：${name}。请参考输入的店铺名和上传生成的头像图，为这个店铺设计生成一张醒目且极具冲击力的广告电商海报图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。`;
}

/**
 * 海报 prompt：参考店招图，风格一致但版式内容不能完全重复。
 */
export function buildPosterPrompt(shopName: string): string {
  const name = shopName.trim();
  return `输入的店铺名：${name}。请参考已生成的店招宣传图，为这个店铺设计生成一张醒目且极具冲击力的21:9横版广告电商海报图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。`;
}

/**
 * 产品图 prompt：必须以原产品图为基础重新设计，按平台尺寸出图。
 */
export function buildProductPrompt(shopName: string, productName: string, platform: Platform): string {
  const name = shopName.trim();
  const product = productName.trim();
  const layout =
    platform === "meituan"
      ? "横版产品图"
      : "正方形产品图";
  return `输入的店铺名：${name}。产品名称：${product}。请参考输入的店铺名，将上传的产品图中的主题背景重新设计更加具有视觉冲击力和吸引力的背景图，并写入产品名称“${product}”在图中。保持上传产品图中的主体食物不变，只强化背景氛围、光影层次和整体视觉吸引力，生成一张适合外卖平台展示的${layout}。`;
}

/**
 * 全店图 prompt：参考单张设计图风格，把每张产品替换进去并同步替换产品文案。
 */
export function buildProductBatchPrompt(
  shopName: string,
  productName: string,
  platform: Platform
): string {
  const name = shopName.trim();
  const product = productName.trim();
  const layout = platform === "meituan" ? "横版产品图" : "正方形产品图";
  return `输入的店铺名：${name}。产品名称：${product}。第1张传给系统的参考图为参考设计风格图，第2张传给系统的参考图为当前需要生成的产品图。请严格区分两张图的用途：第1张图仅参考整体设计风格、版式构图、背景氛围、光影层次、配色方向和文案排版，不要直接复用第1张图中的原产品主体，也不要保留第1张图中的原有产品文案。必须保留第2张图中的真实产品主体，并将第2张图中的产品替换到最终画面中作为唯一产品主体。请结合输入的店铺名，将第2张图中的产品按照第1张图的高级感设计风格重新设计，生成一张适合外卖平台展示的${layout}。图中的产品文案必须替换成产品名称“${product}”，不要出现其他无关文案，不要混入第1张图原有的产品或文字。`;
}
