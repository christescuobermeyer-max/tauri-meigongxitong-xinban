import { ensureTauriInvoke } from "./invoke";
import { callBackendGateway, getBackendGatewayUrl } from "./gateway";

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

export async function uploadImageToOss(
  req: UploadImageToOssRequest,
  options: { timeoutMs?: number } = {}
): Promise<UploadImageToOssResponse> {
  // 网关模式下走"网关签 URL + 客户端直 PUT 到 OSS"，避开客户端 → 网关那段
  // 用户公网出口；多个员工同 IP 上传时不再互相挤。
  if (getBackendGatewayUrl()) {
    return await uploadImageToOssViaPresignedUrl(req, options);
  }
  return await ensureTauriInvoke()<UploadImageToOssResponse>("upload_image_to_oss", { req });
}

async function uploadImageToOssViaPresignedUrl(
  req: UploadImageToOssRequest,
  options: { timeoutMs?: number } = {}
): Promise<UploadImageToOssResponse> {
  const presign = await requestOssPresignedUrls({
    folder: req.folder,
    file_name: req.file_name,
    mime_type: req.mime_type,
  });

  const bytes = decodeBase64ToBytes(req.base64_data);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Content-Type 必须用网关签名时锚定的值，否则阿里云会拒签。
    const response = await fetch(presign.put_url, {
      method: "PUT",
      headers: { "Content-Type": presign.content_type },
      body: new Blob([bytes], { type: presign.content_type }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`直传 OSS 失败：HTTP ${response.status}${detail ? ` - ${detail.slice(0, 200)}` : ""}`);
    }
    return { key: presign.key, url: presign.get_url };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`直传 OSS 超过 ${Math.round(timeoutMs / 1000)} 秒，请稍后重试`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function decodeBase64ToBytes(input: string): Uint8Array<ArrayBuffer> {
  const trimmed = input.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const binary = atob(trimmed);
  // 显式从 ArrayBuffer 构造，避免 TS 5.7+ 推断成 Uint8Array<ArrayBufferLike>
  // （Blob/fetch body 只接受 ArrayBufferView<ArrayBuffer>）。
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface PresignOssUrlsRequest {
  folder: "uploads" | "generated";
  file_name?: string;
  mime_type?: string;
}

export interface PresignOssUrlsResponse {
  key: string;
  put_url: string;
  get_url: string;
  content_type: string;
  put_expires_in_seconds: number;
}

/**
 * 向网关请求一对 OSS 签名 URL：
 * - put_url：短期（10 分钟）授权客户端直接 PUT，绕开网关
 * - get_url：7 天用于后续展示，等同今天写入 generation_logs 的 URL
 *
 * 仅在配置了网关 URL 时可用；本地 Tauri 直接调用模式没有这条路径。
 */
export async function requestOssPresignedUrls(
  req: PresignOssUrlsRequest
): Promise<PresignOssUrlsResponse> {
  return await callBackendGateway<PresignOssUrlsResponse>(
    "/api/oss-presigned-urls",
    req,
    { timeoutMs: 15_000 }
  );
}
