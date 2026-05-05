import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { GenerationLine } from "../types";

function ensureTauriInvoke() {
  if (typeof invoke !== "function") {
    throw new Error("Tauri IPC 不可用：当前环境未注入 invoke，请在桌面应用窗口中使用此功能");
  }
  return invoke;
}

export interface GenerateImageRequest {
  prompt: string;
  /** 1024x1024 / 1024x1536 / 1536x1024 / 21:9 / 3:4 */
  size: string;
  /** 参考图列表：支持不含 data: 前缀的 base64，也支持可访问 URL；可为空 */
  product_images: string[];
  /** 线路1为 yunwu，线路2为 pockgo，线路3为 vectorengine */
  api_line?: GenerationLine;
}

/** 调用 Rust 端的 image-2 生图（已设置 600s 超时） */
export async function generateImage(req: GenerateImageRequest): Promise<string> {
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
