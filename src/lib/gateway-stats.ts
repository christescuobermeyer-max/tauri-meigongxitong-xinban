import { getBackendGatewayUrl } from "./tauri";
import { supabase } from "./supabase";
import type { LineHealthEntry } from "./line-health";

const REQUEST_TIMEOUT_MS = 8000;

export interface LineLimiterSnapshot {
  line: string;
  limit: number;
  active: number;
}

export interface WaitingTicketSnapshot {
  ticket_id: number;
  user_id: string;
  /** "auto" 或 "line" */
  kind: string;
  /** auto 模式是 size，line 模式是线路名 */
  detail: string;
  /** retry 已经试过的线路（auto 才有） */
  excluded_lines: string[];
  waited_ms: number;
}

export interface GatewayQueueSnapshot {
  global_limit: number;
  global_active: number;
  user_limit: number;
  lines: LineLimiterSnapshot[];
  /** user_id → 在跑任务数 */
  active_by_user: Record<string, number>;
  waiting: WaitingTicketSnapshot[];
}

export interface GatewayStatsResponse {
  queue: GatewayQueueSnapshot;
  health: { lines: Record<string, LineHealthEntry> };
  display_names: Record<string, string>;
  /** ISO8601 UTC，前端用来计算等待秒数与服务器对齐 */
  server_time: string;
}

export async function fetchGatewayStats(): Promise<GatewayStatsResponse> {
  const baseUrl = getBackendGatewayUrl();
  if (!baseUrl) {
    throw new Error("未配置网关地址（VITE_BACKEND_GATEWAY_URL）");
  }
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) {
    throw new Error("登录态已失效，请重新登录");
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/admin/gateway-stats`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`网关监控接口返回 ${response.status}：${text || "(空响应)"}`);
    }
    return (await response.json()) as GatewayStatsResponse;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 把毫秒等待时间格式化成"X秒"或"X分Y秒" */
export function formatWaited(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m${s}s`;
}

/** 把 user_id 转成"显示名"（缺失时回退到 id 前 8 位） */
export function displayNameOf(
  userId: string,
  names: Record<string, string>,
): string {
  return names[userId] || `${userId.slice(0, 8)}…`;
}

/** 线路上限利用率（0~1） */
export function lineUtilization(snap: LineLimiterSnapshot): number {
  if (snap.limit <= 0) return 0;
  return snap.active / snap.limit;
}

/** 网关健康状态的中文标签 */
export const HEALTH_LABEL: Record<string, string> = {
  green: "🟢 健康",
  yellow: "🟡 偏慢",
  red: "🔴 故障",
  unknown: "⚪ 未知",
};
