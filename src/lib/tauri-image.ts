import { invoke } from "@tauri-apps/api/core";

function ensureTauriInvoke() {
  if (typeof invoke !== "function") {
    throw new Error("Tauri IPC 不可用：当前环境未注入 invoke，请在桌面应用窗口中使用此功能");
  }
  return invoke;
}

export interface CompressGeneratedImageRequest {
  base64_data: string;
  max_dimension?: number;
  quality?: number;
}

export interface CompressGeneratedImageResponse {
  base64_data: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
}

/** 模型生成图归档前压缩为 JPEG，降低下游接口拉取 OSS 参考图失败概率 */
export async function compressGeneratedImage(
  req: CompressGeneratedImageRequest
): Promise<CompressGeneratedImageResponse> {
  return await ensureTauriInvoke()<CompressGeneratedImageResponse>("compress_generated_image", { req });
}
