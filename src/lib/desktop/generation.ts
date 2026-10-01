import { downloadOssImageAsBase64, imageBase64ToDataUrl } from "../oss-image-download";
import { ensureTauriInvoke } from "./invoke";
import { callBackendGateway, getBackendGatewayUrl } from "./gateway";
import type { RemotePromptConfig, GenerationLine, HistoricalGenerationLine, Platform } from "../../types";

export interface GenerateImageRequest {
  prompt: string;
  /** 云端 prompt 模板配置：生产网关优先用它渲染最终 prompt，本地直连保留 prompt 兜底 */
  prompt_config?: RemotePromptConfig;
  /** 线路2/4/5支持 16:9 店招与 21:9 海报；线路3支持 1024x1024 / 1024x1536 / 1536x1024 / 21:9 / 3:4；线路5门头 auto 会转为 3:2 */
  size: string;
  /** 参考图列表：支持不含 data: 前缀的 base64，也支持可访问 URL；可为空 */
  product_images: string[];
  /** 线路2/3/4复用 Zikl 上游，线路5为 APIMart 兼容线路 */
  api_line?: GenerationLine | "auto";
}

export interface ArchiveGeneratedImageRequest {
  asset_kind: string;
  file_name_stem: string;
  shop_name?: string;
  product_name?: string;
  platform?: Platform;
}

export interface GenerateImageResponse {
  image?: string | null;
  image_url?: string | null;
  result_delivery?: "inline_base64" | "oss_url";
  generation_line?: HistoricalGenerationLine;
  archive_url?: string | null;
  archive_key?: string | null;
  archive_error?: string | null;
  history_recorded?: boolean | null;
  history_error?: string | null;
}

export interface GenerateImageWithLineResult {
  image: string;
  imageDataUrl: string;
  generationLine: GenerationLine;
  archiveUrl?: string;
  archiveKey?: string;
  archiveError?: string;
  historyRecorded?: boolean;
  historyError?: string;
}

/** 调用 Rust 端的 image-2 生图（已设置 350s 超时） */
export async function generateImage(req: GenerateImageRequest): Promise<string> {
  return (await generateImageWithLine(req)).image;
}

export async function generateImageWithLine(
  req: GenerateImageRequest
): Promise<GenerateImageWithLineResult> {
  if (getBackendGatewayUrl()) {
    const response = await callBackendGateway<string | GenerateImageResponse>(
      "/api/generate-image",
      req
    );
    if (typeof response === "string") {
      return {
        image: response,
        imageDataUrl: imageBase64ToDataUrl(response),
        generationLine: normalizeGeneratedLine(req.api_line),
      };
    }
    const image = await resolveGatewayGeneratedImage(response);
    return {
      image: image.base64,
      imageDataUrl: image.dataUrl,
      generationLine: normalizeGeneratedLine(response.generation_line ?? req.api_line),
      archiveUrl: response.archive_url ?? undefined,
      archiveKey: response.archive_key ?? undefined,
      archiveError: response.archive_error ?? undefined,
      historyRecorded: response.history_recorded ?? undefined,
      historyError: response.history_error ?? undefined,
    };
  }
  const localReq = req.api_line === "auto" ? { ...req, api_line: normalizeGeneratedLine(req.api_line) } : req;
  const image = await ensureTauriInvoke()<string>("generate_image", { req: localReq });
  return {
    image,
    imageDataUrl: imageBase64ToDataUrl(image),
    generationLine: normalizeGeneratedLine(req.api_line),
  };
}

export async function generateArchivedImageWithLine(
  req: GenerateImageRequest,
  archive: ArchiveGeneratedImageRequest
): Promise<GenerateImageWithLineResult> {
  if (!getBackendGatewayUrl()) return await generateImageWithLine(req);

  const response = await callBackendGateway<string | GenerateImageResponse>(
    "/api/generate-image",
    { ...req, result_delivery: "oss_url", archive }
  );
  if (typeof response === "string") {
    return {
      image: response,
      imageDataUrl: imageBase64ToDataUrl(response),
      generationLine: normalizeGeneratedLine(req.api_line),
    };
  }
  const image = await resolveGatewayGeneratedImage(response);
  return {
    image: image.base64,
    imageDataUrl: image.dataUrl,
    generationLine: normalizeGeneratedLine(response.generation_line ?? req.api_line),
    archiveUrl: response.archive_url ?? undefined,
    archiveKey: response.archive_key ?? undefined,
    archiveError: response.archive_error ?? undefined,
    historyRecorded: response.history_recorded ?? undefined,
    historyError: response.history_error ?? undefined,
  };
}

async function resolveGatewayGeneratedImage(
  response: GenerateImageResponse
): Promise<{ base64: string; dataUrl: string }> {
  const inlineImage = response.image?.trim();
  if (inlineImage) {
    return {
      base64: inlineImage,
      dataUrl: imageBase64ToDataUrl(inlineImage),
    };
  }

  const imageUrl = response.image_url?.trim() || response.archive_url?.trim();
  if (!imageUrl) {
    const archiveDetail = response.archive_error?.trim();
    throw new Error(
      archiveDetail
        ? `生成图归档失败，且网关未返回可用图片：${archiveDetail}`
        : "网关未返回生成图片或 OSS 下载地址"
    );
  }

  const downloaded = await downloadOssImageAsBase64(imageUrl);
  return { base64: downloaded.base64, dataUrl: downloaded.dataUrl };
}

function normalizeGeneratedLine(line: GenerateImageRequest["api_line"] | HistoricalGenerationLine): GenerationLine {
  return line && line !== "auto" && line !== "line1" ? line : "line5";
}
