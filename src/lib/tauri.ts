import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { supabase } from "./supabase";
import type {
  BrandCopy,
  BrandStoryThreadAvailability,
  BrandStoryThreadId,
  GenerationLine,
} from "../types";

function ensureTauriInvoke() {
  if (typeof invoke !== "function") {
    throw new Error("Tauri IPC 不可用：当前环境未注入 invoke，请在桌面应用窗口中使用此功能");
  }
  return invoke;
}

export function getBackendGatewayUrl(): string {
  return (import.meta.env.VITE_BACKEND_GATEWAY_URL ?? "").trim().replace(/\/+$/, "");
}

export async function callBackendGateway<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = getBackendGatewayUrl();
  if (!baseUrl) throw new Error("未配置后端网关地址 VITE_BACKEND_GATEWAY_URL");

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("登录态已失效，请重新登录后再试");

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(parseGatewayError(text) || `后端网关请求失败：${response.status}`);
  return JSON.parse(text) as T;
}

function parseGatewayError(text: string): string {
  if (!text.trim()) return "";
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

export interface GenerateImageRequest {
  prompt: string;
  /** 线路1/3支持 1024x1024 / 1024x1536 / 1536x1024 / 21:9 / 3:4；线路2海报使用 1792x768；线路4额外支持 16:9 / 1792x1024；线路5使用比例值，门头 auto 会转为 3:2 */
  size: string;
  /** 参考图列表：支持不含 data: 前缀的 base64，也支持可访问 URL；可为空 */
  product_images: string[];
  /** 线路1为 yunwu，线路2为 yunwu，线路3为 vectorengine，线路4为 pockgo，线路5为 APIMart */
  api_line?: GenerationLine;
}

/** 调用 Rust 端的 image-2 生图（已设置 300s 超时） */
export async function generateImage(req: GenerateImageRequest): Promise<string> {
  if (getBackendGatewayUrl()) {
    return await callBackendGateway<string>("/api/generate-image", req);
  }
  return await ensureTauriInvoke()<string>("generate_image", { req });
}

export interface UploadImageToOssRequest {
  base64_data: string;
  mime_type?: string;
  folder: "uploads" | "generated";
  file_name?: string;
}

export interface UploadImageToOssResponse {
  key: string;
  url: string;
}

/** 调用 Rust 端：把图片上传到 OSS，并返回可访问 URL */
export async function uploadImageToOss(
  req: UploadImageToOssRequest
): Promise<UploadImageToOssResponse> {
  if (getBackendGatewayUrl()) {
    return await callBackendGateway<UploadImageToOssResponse>("/api/upload-image-to-oss", req);
  }
  return await ensureTauriInvoke()<UploadImageToOssResponse>("upload_image_to_oss", { req });
}

export interface ResizeAndSaveRequest {
  base64_data: string;
  target_width: number;
  target_height: number;
  output_path: string;
  max_bytes?: number;
}

/** 调用 Rust 端：base64 → 拉伸到目标尺寸 → 写入磁盘（保留完整内容、不裁剪） */
export async function resizeAndSaveImage(req: ResizeAndSaveRequest): Promise<string> {
  return await ensureTauriInvoke()<string>("resize_and_save_image", { req });
}

interface SaveFilter {
  name: string;
  extensions: string[];
}

/** 弹出原生保存对话框 */
export async function pickSavePath(
  defaultName: string,
  filters = [
    { name: "PNG 图像", extensions: ["png"] },
    { name: "JPEG 图像", extensions: ["jpg", "jpeg"] },
  ] satisfies SaveFilter[]
): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
    filters,
  });
  return result ?? null;
}

/** 弹出原生文件夹选择对话框 */
export async function pickDirectoryPath(title = "选择文件夹"): Promise<string | null> {
  const result = await open({
    title,
    directory: true,
    multiple: false,
  });
  if (Array.isArray(result)) return result[0] ?? null;
  return result ?? null;
}

export interface BrandStoryTextRequest {
  store_name: string;
  category: string;
  thread_id: BrandStoryThreadId;
}

/** 调用 Rust 端：根据店铺名/品类生成品牌故事 6 段文案 */
export async function generateBrandStoryText(
  req: BrandStoryTextRequest
): Promise<BrandCopy> {
  if (getBackendGatewayUrl()) {
    return await callBackendGateway<BrandCopy>("/api/brand-story-generate-text", req);
  }
  return await ensureTauriInvoke()<BrandCopy>("brand_story_generate_text", { req });
}

/** 查询品牌故事 4 条线路的可用性（不暴露密钥本身） */
export async function fetchBrandStoryThreadAvailability(): Promise<BrandStoryThreadAvailability> {
  const baseUrl = getBackendGatewayUrl();
  if (baseUrl) {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error("登录态已失效，请重新登录后再试");
    const response = await fetch(`${baseUrl}/api/brand-story-thread-availability`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`获取品牌故事线路可用性失败：${response.status}`);
    return (await response.json()) as BrandStoryThreadAvailability;
  }
  return await ensureTauriInvoke()<BrandStoryThreadAvailability>(
    "brand_story_thread_availability"
  );
}
