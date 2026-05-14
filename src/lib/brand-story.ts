import { generateImage, generateBrandStoryText } from "./tauri";
import { compressAndArchiveGenerated } from "./oss-assets";
import { runWithAutoRetry } from "./generation-retry";
import { safeFileName } from "./utils";
import type {
  BrandCopy,
  BrandStoryThreadId,
  GenerationItem,
  GenerationLine,
  GenerationStatus,
} from "../types";

/** 5 张配图的固定配置（与源项目一致） */
export const BRAND_STORY_IMAGE_CONFIGS: ReadonlyArray<{
  index: number;
  aspectRatio: "3:2" | "16:9" | "4:3";
  name: string;
  getPrompt: (copy: BrandCopy) => string;
}> = [
  {
    index: 1,
    aspectRatio: "3:2",
    name: "主文案配图",
    getPrompt: (copy) => `${copy.mainSlogan} ${copy.subSlogan}`.trim(),
  },
  {
    index: 2,
    aspectRatio: "16:9",
    name: "品牌特色配图",
    getPrompt: (copy) => `${copy.featureTitle} ${copy.featureContent}`.trim(),
  },
  {
    index: 3,
    aspectRatio: "4:3",
    name: "细节1配图",
    getPrompt: (copy) => copy.details[0]?.content ?? "",
  },
  {
    index: 4,
    aspectRatio: "4:3",
    name: "细节2配图",
    getPrompt: (copy) => copy.details[1]?.content ?? "",
  },
  {
    index: 5,
    aspectRatio: "4:3",
    name: "细节3配图",
    getPrompt: (copy) => copy.details[2]?.content ?? "",
  },
];

/** 战略价值说明文案（来自源项目 brand-story-constants） */
export const BRAND_STORY_STRATEGY_TEXT =
  [
    "我们已为您创建“品牌故事”，这不只是简介，而是连接顾客心灵的情感桥梁。市场研究表明，情感连接是顾客忠诚度的首要驱动力：",
    "战略价值",
    "信任基石：透明展示您的品牌理念、食材来源和制作工艺，建立深层信任关系",
    "差异化定位：在千篇一律的外卖市场中，独特的品牌故事为您创造不可复制的竞争壁垒",
    "情感资产：品牌故事能触发顾客共鸣，将一次性消费者转化为品牌拥护者",
    "高端感知：专业的品牌叙事提升顾客对产品价值的感知，支持更健康的定价策略",
    "社区归属感：分享您的创业历程和匠心理念，让顾客感到参与品牌成长的满足感",
  ].join("\n");

export interface BrandStoryImageEntry {
  /** 1..5 */
  index: number;
  aspectRatio: string;
  name: string;
  item: GenerationItem;
}

export function buildBrandStoryEntries(status: GenerationStatus = "idle"): BrandStoryImageEntry[] {
  return BRAND_STORY_IMAGE_CONFIGS.map((config) => ({
    index: config.index,
    aspectRatio: config.aspectRatio,
    name: config.name,
    item: {
      kind: "brand_story",
      rawBase64: null,
      rawDataUrl: null,
      status,
    },
  }));
}

type EntryUpdate =
  | GenerationItem
  | ((previous: GenerationItem) => GenerationItem);

export function applyBrandStoryEntryUpdate(
  entries: BrandStoryImageEntry[],
  index: number,
  update: EntryUpdate
): BrandStoryImageEntry[] {
  return entries.map((entry) => {
    if (entry.index !== index) return entry;
    const nextItem = typeof update === "function" ? update(entry.item) : update;
    return { ...entry, item: nextItem };
  });
}

export function hasBusyBrandStoryEntries(entries: BrandStoryImageEntry[]): boolean {
  return entries.some(
    (entry) => entry.item.status === "queued" || entry.item.status === "running"
  );
}

export function getBrandStoryCompletedCount(entries: BrandStoryImageEntry[]): number {
  return entries.filter(
    (entry) => entry.item.status === "succeeded" && entry.item.rawBase64 && entry.item.remoteUrl
  ).length;
}

export function buildBrandStoryImagePrompt(
  storeName: string,
  category: string,
  promptContent: string
): string {
  const shop = storeName.trim() || "未命名店铺";
  const cat = category.trim() || "餐饮";
  return [
    `为${shop}（${cat}店铺）生成一张纯美食图片。`,
    "要求：",
    "1. 只展示美食，不要任何文字、logo或水印",
    "2. 高清、精美、有食欲感",
    `3. 图片内容与以下描述相关：${promptContent}`,
  ].join("\n");
}

/** 调用 Rust 端文案接口，返回结构化的 BrandCopy */
export async function generateBrandStoryCopy(
  storeName: string,
  category: string,
  threadId: BrandStoryThreadId
): Promise<BrandCopy> {
  return await generateBrandStoryText({
    store_name: storeName.trim(),
    category: category.trim(),
    thread_id: threadId,
  });
}

/** 生成单张品牌故事配图，并把结果归档到 OSS */
export async function generateBrandStoryImage(options: {
  index: number;
  copy: BrandCopy;
  storeName: string;
  category: string;
  generationLine: GenerationLine;
  onAttempt?: (attempt: number) => void;
}): Promise<GenerationItem> {
  const config = BRAND_STORY_IMAGE_CONFIGS.find((c) => c.index === options.index);
  if (!config) throw new Error(`未知品牌故事配图索引：${options.index}`);

  const prompt = buildBrandStoryImagePrompt(
    options.storeName,
    options.category,
    config.getPrompt(options.copy)
  );

  const generated = await runWithAutoRetry({
    onAttempt: (attempt) => options.onAttempt?.(attempt),
    run: async () => ({
      rawBase64: await generateImage({
        prompt,
        size: config.aspectRatio,
        product_images: [],
        api_line: options.generationLine,
      }),
    }),
  });

  const remoteUrl = await compressAndArchiveGenerated(
    "brand_story",
    generated.rawBase64,
    `${safeFileName(options.storeName)}-brand-story-${options.index}`
  );

  return {
    kind: "brand_story",
    rawBase64: generated.rawBase64,
    rawDataUrl: `data:image/png;base64,${generated.rawBase64}`,
    remoteUrl,
    generationLine: options.generationLine,
    status: "succeeded",
    attempt: generated.attempt,
  };
}
