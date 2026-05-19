import { safeFileName } from "./utils";
import { uploadImageToOss } from "./tauri";
import { compressGeneratedImage } from "./tauri-image";
import type { AssetKind, UploadedImage } from "../types";

interface CompressionConfig {
  /** 最长边像素，超过会按比例缩小 */
  maxDimension: number;
  /** JPEG 质量 1-100 */
  quality: number;
}

/**
 * 各类生成图归档到 OSS 时的压缩参数。
 *
 * OSS 上的图仅用于历史预览与跨电脑回看，不参与下载交付——
 * 员工最终交付给商家的图走 rawBase64 + resize_and_save_image 写本地，
 * 与 OSS 的这份图是两条独立链路。
 *
 * 详情页因为通常含较多文字，质量阈值更高。
 */
const COMPRESSION_BY_KIND: Record<AssetKind, CompressionConfig> = {
  avatar: { maxDimension: 768, quality: 82 },
  storefront: { maxDimension: 1536, quality: 88 },
  poster: { maxDimension: 1536, quality: 88 },
  p_signboard: { maxDimension: 1536, quality: 88 },
  product: { maxDimension: 1024, quality: 88 },
  picture_wall: { maxDimension: 1024, quality: 88 },
  detail_page: { maxDimension: 2048, quality: 92 },
  brand_story: { maxDimension: 1792, quality: 90 },
  data_analysis: { maxDimension: 1792, quality: 90 },
  patrol_script: { maxDimension: 1792, quality: 90 },
};

const UPLOAD_CONCURRENCY = 3;
const UPLOAD_TIMEOUT_MS = 30_000;
const UPLOAD_MAX_ATTEMPTS = 3;

async function uploadOneWithRetry(image: UploadedImage): Promise<UploadedImage> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const uploaded = await uploadImageToOss(
        {
          base64_data: image.productBase64,
          mime_type: image.mime,
          folder: "uploads",
          file_name: image.name,
        },
        { timeoutMs: UPLOAD_TIMEOUT_MS }
      );
      return { ...image, productOssUrl: uploaded.url };
    } catch (error) {
      lastError = error;
      if (attempt < UPLOAD_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`上传 ${image.name} 到 OSS 失败：${String(lastError)}`);
}

export async function ensureUploadedImagesOnOss(
  images: UploadedImage[]
): Promise<UploadedImage[]> {
  const pending = images
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => !image.productOssUrl);
  if (pending.length === 0) return images;

  const next = images.slice();
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(UPLOAD_CONCURRENCY, pending.length) },
    async () => {
      while (true) {
        const slot = cursor++;
        if (slot >= pending.length) return;
        const { image, index } = pending[slot];
        next[index] = await uploadOneWithRetry(image);
      }
    }
  );
  await Promise.all(workers);
  return next;
}

/**
 * 把生成图按其类型对应的压缩参数压成 JPEG，再归档到 OSS 的 generated/ 目录。
 *
 * @param kind          图片类型，决定压缩参数
 * @param rawBase64     生图接口返回的原始 base64（不含 data: 前缀）
 * @param fileNameStem  OSS 文件名主体（不含扩展名，由调用方负责去重）
 * @returns             OSS 可访问 URL
 */
export async function compressAndArchiveGenerated(
  kind: AssetKind,
  rawBase64: string,
  fileNameStem: string
): Promise<string> {
  const cfg = COMPRESSION_BY_KIND[kind];
  const compressed = await compressGeneratedImage({
    base64_data: rawBase64,
    max_dimension: cfg.maxDimension,
    quality: cfg.quality,
  });
  const uploaded = await uploadImageToOss({
    base64_data: compressed.base64_data,
    mime_type: compressed.mime_type,
    folder: "generated",
    file_name: `${fileNameStem}.jpg`,
  });
  return uploaded.url;
}

/**
 * 兼容旧调用方（avatar / storefront / poster / product 走 workspace-generation 通道）。
 * 文件名约定为 `<shopName>-<kind>.jpg`。
 */
export async function archiveGeneratedImage(
  kind: AssetKind,
  shopName: string,
  rawBase64: string
): Promise<string> {
  return compressAndArchiveGenerated(kind, rawBase64, `${safeFileName(shopName)}-${kind}`);
}
