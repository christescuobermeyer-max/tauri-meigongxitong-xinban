const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

export type OssImageFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface OssImageDownloadOptions {
  fetchImpl?: OssImageFetch;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

export interface DownloadedOssImage {
  base64: string;
  mimeType: string;
  dataUrl: string;
  byteSize: number;
}

export async function downloadOssImageAsBase64(
  url: string,
  options: OssImageDownloadOptions = {},
): Promise<DownloadedOssImage> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const retryBaseDelayMs = nonNegativeInteger(
    options.retryBaseDelayMs,
    DEFAULT_RETRY_BASE_DELAY_MS,
  );
  let lastError = "未知错误";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error("OSS 返回了空图片");
      }
      const bytes = new Uint8Array(buffer);
      const headerMime = normalizeImageMime(response.headers.get("Content-Type"));
      const detectedMime = detectImageMime(bytes);
      const mimeType = detectedMime ?? headerMime;
      if (!mimeType) {
        throw new Error("OSS 返回的内容不是图片");
      }

      const base64 = arrayBufferToBase64(buffer);
      return {
        base64,
        mimeType,
        dataUrl: `data:${mimeType};base64,${base64}`,
        byteSize: buffer.byteLength,
      };
    } catch (error: unknown) {
      lastError = sanitizeDownloadError(error, controller.signal.aborted, timeoutMs);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }

    if (attempt < maxAttempts && retryBaseDelayMs > 0) {
      await delay(retryBaseDelayMs * attempt);
    }
  }

  throw new Error(`OSS 图片下载失败（已尝试 ${maxAttempts} 次）：${lastError}`);
}

export function imageBase64ToDataUrl(base64: string, fallbackMime = "image/png"): string {
  const prefix = base64.slice(0, 24);
  let detectedMime: string | null = null;
  try {
    const binary = atob(prefix);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    detectedMime = detectImageMime(bytes);
  } catch {
    // Keep the legacy fallback for malformed or partial values; the native image decoder
    // will still provide the final validation when the user previews or exports it.
  }
  return `data:${detectedMime ?? fallbackMime};base64,${base64}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function normalizeImageMime(value: string | null): string | null {
  const mime = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime === "image/jpg") return "image/jpeg";
  return mime.startsWith("image/") ? mime : null;
}

function sanitizeDownloadError(error: unknown, aborted: boolean, timeoutMs: number): string {
  if (aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return `请求超过 ${Math.round(timeoutMs / 1000)} 秒`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/[^\s)]+/gi, "[OSS URL]");
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 0 ? Math.floor(value!) : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
