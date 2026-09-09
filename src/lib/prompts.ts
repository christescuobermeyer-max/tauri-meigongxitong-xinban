import type { AppearanceOptions, BrandStyle, Platform, ThemeColor } from "../types";

export type { AppearanceOptions } from "../types";

const THEME_COLOR_HINTS: Record<ThemeColor, string> = {
  light: "整体采用浅色主题配色，以明亮干净的浅色调（白、米、奶油等）作为画面主色，营造清新通透的视觉感",
  dark: "整体采用深色主题配色，以沉稳深邃的深色调（深棕、墨黑、暗夜蓝等）作为画面主色，营造高端质感与戏剧氛围",
  red: "整体采用红色主题配色，以红色作为画面主色调，营造热情诱人、食欲浓烈的氛围",
  yellow: "整体采用黄色主题配色，以黄色作为画面主色调，营造温暖明亮、活力诱人的氛围",
  orange: "整体采用橙色主题配色，以橙色作为画面主色调，营造食欲诱人的暖橙氛围",
  blue: "整体采用深蓝主题配色。主背景色以深蓝 #262C75 为主，暗部和边缘可用更深的 #20245F，形成稳重的外卖品牌头图底色；辅助色使用低饱和蓝灰 #6F77A8，用于小字、品牌标识、细线和弱化装饰，文字要克制、清晰；食物区域色使用暖白、奶白、浅米白 #F4F0E7 和 #FFF8ED，承托碗盘、菜品和留白区域，避免纯白刺眼。整体风格参考高质感外卖店铺头图：上半部是干净深蓝品牌区，下半部是暖白食物展示区，食物主体突出，旁边可搭配少量小盘或圆形辅图，画面干净商业化，不要做成霓虹科技风、赛博科技风或彩色渐变",
  pink: "整体采用浅粉色主题配色，以明亮柔和、低饱和的暖浅粉、奶油粉、樱花粉（约 #F7D6DC、#FBE5E3）作为大面积主题背景，搭配少量暖白 #FFF7F2 自然过渡，营造清新轻盈、柔和通透的视觉氛围；该主题色只约束画面背景与环境氛围，不规定文字内容、版式、构图、装饰元素或食物摆放，避免玫红、荧光粉、紫粉和大面积高饱和艳粉",
  deepSea: "整体采用深海冰川蓝主题配色，可用于任何菜品，不限定食物品类。主色使用深海墨蓝 #062333 作为大面积背景与暗部，辅色使用冰川浅青 #BFEAF2 用于背景冷调层次、局部高光、边缘光和装饰性光影，并搭配少量冷白 #F5FCFF 提升洁净通透感；保留产品主体本身的真实自然色彩，让食物成为视觉焦点。整体营造清凉、纯净、通透、有质感的商业食品氛围，不要使用暖黄、土棕或过度饱和的背景色，不要做成赛博科技风或霓虹渐变；该主题色只约束画面背景与环境氛围，不改变真实产品主体、文字内容、版式或构图",
};

const BRAND_STYLE_HINTS: Record<BrandStyle, string> = {
  young: "整体走年轻化风格，配色活泼、构图大胆，富有视觉活力，符合年轻消费群体审美",
  lifeFire: "整体走生活烟火风格，氛围真实接地气，富有市井烟火气息和生活温度",
  fresh: "整体走清爽风格，画面干净简约，色彩明快不杂乱，给人清爽舒适的观感",
};

function buildAppearanceClause(themeColor?: ThemeColor, brandStyle?: BrandStyle): string {
  const parts: string[] = [];
  if (themeColor && THEME_COLOR_HINTS[themeColor]) parts.push(THEME_COLOR_HINTS[themeColor]);
  if (brandStyle && BRAND_STYLE_HINTS[brandStyle]) parts.push(BRAND_STYLE_HINTS[brandStyle]);
  return parts.length ? parts.join("；") + "。" : "";
}

const BEVERAGE_BRAND_OR_PRODUCT_PATTERN =
  /康师傅|统一|可口可乐|coca[-\s]?cola|百事可乐|百事|pepsi|雪碧|sprite|芬达|fanta|美年达|农夫山泉|怡宝|娃哈哈|王老吉|加多宝|红牛|东鹏特饮?|脉动|尖叫|元气森林|汇源|美汁源|果粒橙|冰露|景田|百岁山|乐虎|健力宝|雀巢|三得利|乌苏|青岛|雪花|哈尔滨|燕京|崂山|波克|魔爪/i;

const BEVERAGE_GENERIC_PATTERN =
  /冰红茶|红茶|绿茶|乌龙茶|茉莉蜜茶|柠檬茶|可乐|汽水|橙汁|果汁|矿泉水|纯净水|苏打水|凉茶|啤酒|奶茶|饮料|咖啡|拿铁|美式|酸梅汤|豆浆|椰汁|牛奶|乳酸菌|酸奶|能量饮料|运动饮料/i;

const BEVERAGE_PACKAGE_PATTERN = /\d+(?:\.\d+)?\s*(?:ml|毫升|l|升)|瓶|罐|听|盒|支|杯|装|饮料|汽水|啤酒|可乐|冰红茶|红茶|绿茶|乌龙茶|柠檬茶|果汁|矿泉水|纯净水|苏打水|凉茶/i;

const BEVERAGE_BRAND_REPLACEMENTS: RegExp[] = [
  /康师傅|统一|农夫山泉|怡宝|娃哈哈|王老吉|加多宝|红牛|东鹏特饮?|脉动|尖叫|元气森林|汇源|美汁源|果粒橙|冰露|景田|百岁山|乐虎|健力宝|雀巢|三得利|乌苏|青岛|雪花|哈尔滨|燕京|崂山|波克|魔爪/gi,
  /可口可乐|coca[-\s]?cola|百事可乐|百事|pepsi/gi,
  /雪碧|sprite|芬达|fanta|美年达/gi,
];

function inferGenericBeverageName(product: string): string | null {
  if (/雪碧|sprite|柠檬.*汽水/i.test(product)) return "柠檬味汽水";
  if (/可口可乐|百事可乐|百事|pepsi|coca[-\s]?cola|可乐/i.test(product)) return "可乐";
  if (/芬达|fanta|美年达/i.test(product)) return "橙味汽水";
  if (/绿茶|茉莉蜜茶/i.test(product)) return "绿茶";
  if (/冰红茶|红茶/i.test(product)) return "冰红茶";
  if (/乌龙茶|乌龙/i.test(product)) return "乌龙茶";
  if (/柠檬茶/i.test(product)) return "柠檬茶";
  if (/果粒橙|橙汁|果汁/i.test(product)) return "果汁饮料";
  if (/怡宝|纯净水|冰露/i.test(product)) return "纯净水";
  if (/农夫山泉|矿泉水|景田|百岁山/i.test(product)) return "矿泉水";
  if (/王老吉|加多宝|凉茶/i.test(product)) return "凉茶";
  if (/乌苏|青岛|雪花|哈尔滨|燕京|崂山|波克|啤酒/i.test(product)) return "啤酒";
  if (/红牛|东鹏|乐虎|魔爪|能量饮料/i.test(product)) return "能量饮料";
  if (/脉动|运动饮料/i.test(product)) return "运动饮料";
  if (/奶茶/i.test(product)) return "奶茶";
  if (/咖啡|拿铁|美式/i.test(product)) return "咖啡";
  if (/酸梅汤/i.test(product)) return "酸梅汤";
  if (/豆浆/i.test(product)) return "豆浆";
  if (/椰汁/i.test(product)) return "椰汁";
  if (/牛奶|乳酸菌|酸奶/i.test(product)) return "乳饮料";
  if (/饮料/i.test(product)) return "饮料";
  return null;
}

function normalizeBeverageName(product: string): string {
  return product
    .replace(/[（）()【】\[\]「」『』]/g, " ")
    .replace(/[·•、，,。；;:：_\-]+/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

function resolveBeverageSafeName(product: string): string | null {
  const original = product.trim();
  if (!original) return null;

  const isKnownBrand = BEVERAGE_BRAND_OR_PRODUCT_PATTERN.test(original);
  const isPackagedBeverage = BEVERAGE_GENERIC_PATTERN.test(original) && BEVERAGE_PACKAGE_PATTERN.test(original);
  if (!isKnownBrand && !isPackagedBeverage) return null;

  const inferredName = inferGenericBeverageName(original) ?? "饮料";
  const size = original.match(/\d+(?:\.\d+)?\s*(?:ml|毫升|l|升)/i)?.[0]?.replace(/\s+/g, "") ?? "";
  let safeName = original;
  for (const pattern of BEVERAGE_BRAND_REPLACEMENTS) {
    safeName = safeName.replace(pattern, "");
  }
  safeName = normalizeBeverageName(safeName);

  if (!safeName || !BEVERAGE_GENERIC_PATTERN.test(safeName)) {
    return `${size}${inferredName}`;
  }
  return safeName;
}

const BEVERAGE_REFERENCE_SAFETY_CLAUSE =
  "检测到该产品可能是瓶装、罐装或盒装饮料。参考图只用于识别饮料类型、液体颜色、容器轮廓和摆放角度；最终主体必须重绘为通用无品牌饮料，不要复制、复刻或保留参考图上的第三方品牌商标、logo、品牌字体、瓶贴/罐身/杯身包装版式、图案、条码、注册商标符号或任何可识别商业包装。";

export function buildAvatarPrompt(shopName: string, appearance: AppearanceOptions = {}): string {
  const name = shopName.trim();
  const appearanceClause = buildAppearanceClause(appearance.themeColor, appearance.brandStyle);
  return `输入的店铺名：${name}。请参考输入的店铺名和上传的产品图，为这个店铺设计生成一张醒目且极具冲击力的广告电商头像logo图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。画面中需要包含店铺名“${name}”作为主标题，并搭配1-2行品类标语或氛围文案（如菜品特色、口感描述等），文字需有大小层次感，主标题最大最醒目，副文案适当缩小作为点缀。画面必须为1:1正方形构图，铺满整个正方形画面，不要圆形边框，不要圆形徽章，不要圆形裁切，内容需覆盖全部页面${appearanceClause ? "。" + appearanceClause : ""}`;
}

export function buildAvatarCategoryPrompt(
  shopName: string,
  category: string,
  appearance: AppearanceOptions = {}
): string {
  const name = shopName.trim();
  const categoryName = category.trim();
  const appearanceClause = buildAppearanceClause(appearance.themeColor, appearance.brandStyle);
  return `输入的店铺名：${name}。店铺经营品类：${categoryName}。请参考输入的店铺名、店铺经营品类和上传的产品图中的食物，为这个店铺设计生成一张醒目且极具冲击力的广告电商头像logo图，采用极具戏剧性的商业食品摄影风格，商业海报式的构图，以及高端诱人的快餐广告美学。头像内容必须紧扣上传的产品图中的食物主体和该店铺经营品类，不能脱离上传的食物另起炉灶。画面中需要包含店铺名“${name}”作为主标题，并搭配1-2行品类标语或氛围文案（如菜品特色、口感描述等），文字需有大小层次感，主标题最大最醒目，副文案适当缩小作为点缀。画面必须为1:1正方形构图，铺满整个正方形画面，不要圆形边框，不要圆形徽章，不要圆形裁切，内容需覆盖全部页面${appearanceClause ? "。" + appearanceClause : ""}`;
}

export function buildStorefrontPrompt(
  shopName: string,
  category = "",
  appearance: AppearanceOptions = {}
): string {
  const name = shopName.trim();
  const categoryName = category.trim();
  const categoryText = categoryName ? `店铺经营品类：${categoryName}。` : "";
  const appearanceClause = buildAppearanceClause(appearance.themeColor, appearance.brandStyle);
  return `输入的店铺名：${name}。${categoryText}请参考上传的产品图，为这个店铺设计生成一张醒目且极具冲击力的16:9横版店招宣传图，采用极具戏剧性的商业食品摄影风格、商业海报式的构图，以及高端诱人的快餐广告美学。店招内容必须紧扣上传产品图中的真实食物主体、店铺经营品类和店铺名，不能脱离上传的食物与经营品类另起炉灶，不能凭空更换成其他食物。画面需要适合外卖店铺顶部店招展示：横向空间开阔，主体食物清晰突出，背景具备丰富的环境氛围、光影层次和视觉冲击力。画面中需要包含店铺名“${name}”作为主标题文字，并搭配1-2行品类标语或氛围文案（如菜品特色、口感描述、品牌口号等），文字需有大小层次感，主标题最大最醒目，副文案适当缩小作为点缀，整体文字排版自然融入画面左侧或右侧区域。整体视觉要符合“${categoryName || "该"}”品类的消费场景和菜品气质。画布必须为16:9横版构图，不要生成1:1，不要生成3:4，不要后期裁切成横版。图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。${appearanceClause}`;
}

export function buildPosterPrompt(
  shopName: string,
  category = "",
  appearance: AppearanceOptions = {}
): string {
  const name = shopName.trim();
  const categoryName = category.trim();
  const categoryText = categoryName ? `店铺经营品类：${categoryName}。` : "";
  const appearanceClause = buildAppearanceClause(appearance.themeColor, appearance.brandStyle);
  return `输入的店铺名：${name}。${categoryText}请参考上传的产品图，为这个店铺设计生成一张醒目且极具冲击力的21:9横版广告电商海报图，采用极具戏剧性的商业食品摄影风格、商业海报式的构图，以及高端诱人的快餐广告美学。海报内容必须紧扣上传产品图中的真实食物主体、店铺经营品类和店铺名，不能脱离上传的食物与经营品类另起炉灶，不能凭空更换成其他食物。海报画布宽高比必须严格为21:9，必须直接生成21:9比例，不要生成16:9，不要生成1:1，不要生成3:4，不要改成其他比例，不要后期裁切成21:9。画面采用电影级宽银幕叙事构图：横向排布多组视觉元素，可以从不同角度展示食物、加入丰富的氛围光影和装饰性背景层次，画面从左到右要有视觉流动感和节奏感。画面中需要包含店铺名“${name}”作为主标题文字，并搭配1-2行品类标语或氛围文案（如菜品特色、口感描述、品牌口号等），文字需有大小层次感，主标题最大最醒目，副文案适当缩小作为点缀，整体文字排版自然融入画面。整体视觉要符合“${categoryName || "该"}”品类的消费场景和菜品气质。图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。${appearanceClause}`;
}

export function buildProductPrompt(
  shopName: string,
  productName: string,
  platform: Platform,
  appearance: AppearanceOptions = {},
  options: { includeProductName?: boolean } = {}
): string {
  const name = shopName.trim();
  const product = productName.trim();
  const beverageSafeName = resolveBeverageSafeName(product);
  const displayProductName = beverageSafeName ?? product;
  const layout =
    platform === "meituan"
      ? "横版产品图"
      : "正方形产品图";
  const appearanceClause = buildAppearanceClause(appearance.themeColor, appearance.brandStyle);
  const includeProductName = options.includeProductName !== false;
  const productNameIntro = includeProductName ? `产品名称：${displayProductName}。` : "生成时产品名称为空。";
  const productNameInstruction = beverageSafeName
    ? includeProductName
      ? `画面文字只允许使用通用产品名称“${displayProductName}”或口味描述，不要写入参考图中的第三方品牌名、logo文字或包装文字。`
      : "不要写入产品名称文字，也不要保留参考产品图中的原产品名、第三方品牌名、logo文字或包装文字。"
    : includeProductName
      ? `并写入产品名称“${product}”在图中。`
      : "不要写入产品名称文字，也不要保留参考产品图中的原产品名或其他产品名称文字。";
  const subjectInstruction = beverageSafeName
    ? `${BEVERAGE_REFERENCE_SAFETY_CLAUSE}只强化背景氛围、光影层次和整体视觉吸引力，生成一张适合外卖平台展示的${layout}。`
    : `保持上传产品图中的主体食物不变，只强化背景氛围、光影层次和整体视觉吸引力，生成一张适合外卖平台展示的${layout}。`;
  return `输入的店铺名：${name}。${productNameIntro}请参考输入的店铺名，将上传的产品图中的主题背景重新设计更加具有视觉冲击力和吸引力的背景图，${productNameInstruction}${subjectInstruction}${appearanceClause}`;
}

export function buildProductBatchPrompt(
  shopName: string,
  productName: string,
  platform: Platform,
  appearance: AppearanceOptions = {},
  options: { includeProductName?: boolean } = {}
): string {
  const name = shopName.trim();
  const product = productName.trim();
  const beverageSafeName = resolveBeverageSafeName(product);
  const displayProductName = beverageSafeName ?? product;
  const layout = platform === "meituan" ? "横版产品图" : "正方形产品图";
  const appearanceClause = buildAppearanceClause(appearance.themeColor, appearance.brandStyle);
  const includeProductName = options.includeProductName !== false;
  const productNameIntro = includeProductName ? `产品名称：${displayProductName}。` : "生成时产品名称为空。";
  const subjectTransfer = beverageSafeName
    ? `把第2张产品图中的饮料类型、液体颜色、容器轮廓和摆放角度迁移到第1张图的产品主体位置，但最终主体必须重绘为通用无品牌饮料；不要复制或保留第2张图上的品牌商标、logo、品牌字体、瓶贴/罐身/杯身包装版式、图案、条码或任何可识别商业包装，也不能继续保留第1张图中的原产品主体。`
    : "把第2张产品图中的真实食物主体替换进第1张图的产品主体位置，必须保留第2张图中的真实产品主体，不能凭空更换成其他食物，也不能继续保留第1张图中的原产品主体。";
  const copyReplacement = beverageSafeName
    ? includeProductName
      ? `请把第1张图中的店铺名、产品名或其他原有产品文案替换为店铺名“${name}”和通用产品名称“${displayProductName}”，并自然融入原参考图的文案排版区域；画面文字不要写入第2张参考图中的第三方品牌名、logo文字或包装文字。`
      : `请把第1张图中的店铺名、产品名或其他原有产品文案替换为店铺名“${name}”；生成时产品名称为空，不要写入产品名称文字，也不要保留参考设计风格图或第2张参考图里的原产品名、第三方品牌名、logo文字或包装文字。`
    : includeProductName
      ? `请把第1张图中的店铺名、产品名或其他原有产品文案替换为店铺名“${name}”和产品名称“${product}”，并自然融入原参考图的文案排版区域。`
      : `请把第1张图中的店铺名、产品名或其他原有产品文案替换为店铺名“${name}”；生成时产品名称为空，不要写入产品名称文字，也不要保留参考设计风格图里的原产品名。`;
  return `输入的店铺名：${name}。${productNameIntro}本次请求只包含两张参考图：第1张传给系统的参考图为参考设计风格图，第2张传给系统的参考图为当前需要生成的产品图。这里的第1张和第2张只代表本次单张生成请求中的两张参考图，不是产品图列表中的第1张或第2张；即使用户一次上传多张产品图，每次只从产品图列表中取当前正在生成的这一张产品图，与同一张参考设计风格图组成两图请求。请严格区分两张图的用途：以第1张参考设计风格图作为最终画面的版式模板，必须保留第1张图的背景氛围、构图结构、光影层次、配色方向和文案排版位置，让最终图一眼能看出延续了第1张图的设计风格。${subjectTransfer}${copyReplacement}生成一张适合外卖平台展示的${layout}。不要只根据第2张产品图单独重新设计背景，不要忽略第1张参考设计风格图，不要出现促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。${appearanceClause}`;
}
