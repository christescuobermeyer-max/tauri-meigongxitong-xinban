import { generateImageWithLine, uploadImageToOss } from "./tauri";
import { compressAndArchiveGenerated } from "./oss-assets";
import { runWithAutoRetry } from "./generation-retry";
import { safeFileName } from "./utils";
import type { GenerationItem, GenerationLine, GenerationStatus, UploadedImage } from "../types";

export const DETAIL_PAGE_GENERATION_SIZE = "1024x1536";
export const DETAIL_PAGE_EXPORT_SIZE = { w: 1024, h: 1536 };

export const DETAIL_PAGE_TYPES = [
  {
    name: "主KV视觉",
    english: "Hero Shot",
    desc: "产品主图展示，突出店铺和核心卖点",
  },
  {
    name: "生活场景",
    english: "Lifestyle",
    desc: "营造真实用餐场景，增强食欲和代入感",
  },
  {
    name: "工艺展示",
    english: "Process/Concept",
    desc: "展示食材品质、制作工艺和产品价值感",
  },
] as const;

export interface DetailPageEntry {
  pageIndex: number;
  title: string;
  subtitle: string;
  item: GenerationItem;
}

type EntryUpdate = GenerationItem | ((previous: GenerationItem) => GenerationItem);

export function buildDetailPagePrompt(options: {
  shopName: string;
  productName: string;
  productOssUrl: string;
  pageIndex: number;
}) {
  const pageType = DETAIL_PAGE_TYPES[options.pageIndex] ?? DETAIL_PAGE_TYPES[0];
  const shop = options.shopName.trim() || "未命名店铺";
  const product = options.productName.trim() || "未命名产品";

  return `为店铺名：“${shop}”和上传的产品图生成第${options.pageIndex + 1}张详情页展示图。
本张详情页主题：“${pageType.name} / ${pageType.english}”，方向：${pageType.desc}。
产品名称：“${product}”。
上传的产品图 OSS URL：${options.productOssUrl}

请生成一份精美好看有吸引力的电商详情页展示图，竖版商业详情页构图，画面有清晰主视觉、统一字体层级、精致食物摄影质感、干净高级的背景和适合外卖/电商平台浏览的视觉冲击力。
必须参考上传产品图中的食物主体、色泽、形态和产品名称，保留食物识别度，让用户一眼知道这是“${product}”。
可以加入“严选食材、现做现售、口感丰富、品质用心”等通用品质表达，但不要编造具体价格、活动、地址或联系方式。
图中不要加入促销价格、满减信息、二维码、地址、电话、联系方式或其他无关营销元素。
尺寸为1024x1536。`;
}

export function buildDetailPageEntries(status: GenerationStatus = "idle"): DetailPageEntry[] {
  return DETAIL_PAGE_TYPES.map((type, pageIndex) => ({
    pageIndex,
    title: `详情页 ${pageIndex + 1}`,
    subtitle: `${type.name} · ${type.english}`,
    item: {
      kind: "detail_page",
      rawBase64: null,
      rawDataUrl: null,
      status,
    },
  }));
}

export function applyDetailPageEntryUpdate(
  entries: DetailPageEntry[],
  pageIndex: number,
  update: EntryUpdate
) {
  return entries.map((entry) => {
    if (entry.pageIndex !== pageIndex) return entry;
    const nextItem = typeof update === "function" ? update(entry.item) : update;
    return { ...entry, item: nextItem };
  });
}

export function hasBusyDetailPageEntries(entries: DetailPageEntry[]) {
  return entries.some((entry) => entry.item.status === "queued" || entry.item.status === "running");
}

export function getDetailPageCompletedCount(entries: DetailPageEntry[]) {
  return entries.filter(
    (entry) => entry.item.status === "succeeded" && entry.item.rawBase64 && entry.item.remoteUrl
  ).length;
}

export async function generateDetailPageItem(
  sourceImage: UploadedImage,
  shopName: string,
  pageIndex: number,
  _generationLine: GenerationLine,
  options: { onAttempt?: (attempt: number) => void } = {}
) {
  const productOssUrl = await resolveDetailPageProductOssUrl(sourceImage, shopName);
  const productName = sourceImage.productName?.trim() || sourceImage.name;
  const generated = await runWithAutoRetry({
    onAttempt: (attempt) => options.onAttempt?.(attempt),
    run: async () => {
      const response = await generateImageWithLine({
        prompt: buildDetailPagePrompt({ shopName, productName, productOssUrl, pageIndex }),
        size: DETAIL_PAGE_GENERATION_SIZE,
        product_images: [productOssUrl],
        api_line: "auto",
      });
      return {
        rawBase64: response.image,
        generationLine: response.generationLine,
      };
    },
  });
  const remoteUrl = await archiveDetailPageResult(generated.rawBase64, shopName, pageIndex);

  return {
    kind: "detail_page" as const,
    rawBase64: generated.rawBase64,
    rawDataUrl: `data:image/png;base64,${generated.rawBase64}`,
    remoteUrl,
    generationLine: generated.generationLine,
    status: "succeeded" as const,
    attempt: generated.attempt,
  };
}

async function resolveDetailPageProductOssUrl(sourceImage: UploadedImage, shopName: string) {
  if (sourceImage.productOssUrl) return sourceImage.productOssUrl;
  const uploaded = await uploadImageToOss({
    base64_data: sourceImage.productBase64,
    mime_type: sourceImage.mime,
    folder: "uploads",
    file_name: `${safeFileName(shopName)}-detail-page-source-${sourceImage.id}.jpg`,
  });
  return uploaded.url;
}

async function archiveDetailPageResult(rawBase64: string, shopName: string, pageIndex: number) {
  try {
    return await compressAndArchiveGenerated(
      "detail_page",
      rawBase64,
      `${safeFileName(shopName)}-detail-page-${pageIndex + 1}`
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`详情页生成结果上传 OSS 失败：${message}`);
  }
}
