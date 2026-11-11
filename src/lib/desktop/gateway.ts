import { supabase } from "../supabase";

const BACKEND_GATEWAY_REQUEST_TIMEOUT_MS = 600_000;

export function getBackendGatewayUrl(): string {
  return (import.meta.env.VITE_BACKEND_GATEWAY_URL ?? "").trim().replace(/\/+$/, "");
}

export async function callBackendGateway<T>(
  path: string,
  body: unknown,
  options: { timeoutMs?: number } = {}
): Promise<T> {
  const baseUrl = getBackendGatewayUrl();
  if (!baseUrl) throw new Error("未配置后端网关地址 VITE_BACKEND_GATEWAY_URL");

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("登录态已失效，请重新登录后再试");

  const timeoutMs = options.timeoutMs ?? BACKEND_GATEWAY_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(parseGatewayError(text) || `后端网关请求失败：${response.status}`);
    return JSON.parse(text) as T;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (path === "/api/generate-image") {
        throw new Error("生图请求等待超时，任务可能仍在云端处理。请先查看历史记录，避免重复提交");
      }
      throw new Error(`后端网关请求超过 ${Math.round(timeoutMs / 1000)} 秒，请稍后重试`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
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
