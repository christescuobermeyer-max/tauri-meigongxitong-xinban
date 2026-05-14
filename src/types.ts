export type Platform = "meituan" | "taobao";
export type AvatarReferenceMode = "category" | "image";
export type GenerationLine = "line1" | "line2" | "line3" | "line4" | "line5";

/** 主题色偏好（可选，未选时不影响 prompt） */
export type ThemeColor = "light" | "dark" | "red" | "yellow" | "orange";
/** 设计风格偏好（可选，未选时不影响 prompt） */
export type BrandStyle = "young" | "lifeFire" | "fresh";

/** 三件套生成时附加的视觉偏好；两个字段都不传时与默认提示词完全等价 */
export interface AppearanceOptions {
  themeColor?: ThemeColor;
  brandStyle?: BrandStyle;
}

export type AssetKind =
  | "avatar"
  | "storefront"
  | "poster"
  | "product"
  | "p_signboard"
  | "picture_wall"
  | "detail_page"
  | "brand_story";

/** 品牌故事文案 4 条线路 */
export type BrandStoryThreadId = "thread1" | "thread2" | "thread3" | "thread4";

export interface BrandCopyDetail {
  title: string;
  content: string;
}

export interface BrandCopy {
  mainSlogan: string;
  subSlogan: string;
  featureTitle: string;
  featureContent: string;
  detailsTitle: string;
  details: BrandCopyDetail[];
}

export interface BrandStoryThreadAvailabilityItem {
  available: boolean;
  name: string;
  description: string;
}

export type BrandStoryThreadAvailability = Record<
  BrandStoryThreadId,
  BrandStoryThreadAvailabilityItem
>;

export interface AssetSize {
  w: number;
  h: number;
}

export interface ProductImageSpec {
  /** 模型原图尺寸 */
  source: AssetSize;
  /** 平台导出尺寸 */
  export: AssetSize;
  /** 导出文件大小上限（字节） */
  maxBytes?: number;
}

export interface PosterImageSpec {
  /** 模型原图比例说明 */
  sourceLabel: string;
  /** 平台导出尺寸 */
  export: AssetSize;
}

export interface PlatformSpec {
  id: Platform;
  label: string;
  /** 平台导出尺寸 — 头像 */
  avatar: AssetSize;
  /** 平台导出尺寸 — 店招 */
  storefront: AssetSize;
  /** 平台海报图规格 */
  poster: PosterImageSpec;
  /** 平台产品图规格 */
  product: ProductImageSpec;
  /** 平台主题色（仅 UI 标识用） */
  swatch: string;
}

export interface UploadedImage {
  id: string;
  /** 头像/店招参考图，不含 data: 前缀 */
  base64: string;
  /** 产品图参考图，不含 data: 前缀 */
  productBase64: string;
  /** 压缩后的产品参考图已上传到 OSS 后返回的可访问 URL */
  productOssUrl?: string;
  /** data:image/jpeg;base64,... — UI 预览用 */
  dataUrl: string;
  name: string;
  mime: string;
  /** 头像/店招压缩后参考图大小 */
  size: number;
  /** 产品图压缩后参考图大小 */
  productSize: number;
  /** 上传原图大小 */
  originalSize: number;
  /** 从文件名自动提取的产品名称 */
  productName: string;
}

export type GenerationStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface GenerationItem {
  kind: AssetKind;
  /** API 返回的原图或比例图（1024x1024 / 16:9 / 21:9 等）— base64 不含前缀 */
  rawBase64: string | null;
  /** 仅用于 UI 预览 */
  rawDataUrl: string | null;
  /** 归档到 OSS 后返回的可访问 URL */
  remoteUrl?: string;
  /** 本次生图使用的线路；历史旧数据或专用接口可为空 */
  generationLine?: GenerationLine | null;
  status: GenerationStatus;
  errorMessage?: string;
  /** 生成耗时（毫秒） */
  elapsedMs?: number;
  /** 当前生成尝试次数；自动重试时第二次为 2 */
  attempt?: number;
}
