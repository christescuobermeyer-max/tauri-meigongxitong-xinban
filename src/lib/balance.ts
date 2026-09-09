import { invoke } from "@tauri-apps/api/core";
import { callBackendGateway, getBackendGatewayUrl } from "./tauri";

export interface BalanceLineDef {
  id: string;
  /** 显示名 */
  name: string;
  /** 余额管理后台首页 URL（提示用户去手动登录的入口） */
  consoleUrl: string;
  /** 线路2/6/7可直接用 API Key 读取 billing；其它线路沿用网页登录 session。 */
  balanceMode?: "session" | "api_key";
  /** 当前是否已接入 Rust 命令；false 时前端只显示占位 */
  supported: boolean;
}

export const BALANCE_LINES: BalanceLineDef[] = [
  { id: "line2", name: "线路2（Zikl）", consoleUrl: "https://img.zikl.dev/console", balanceMode: "api_key", supported: true },
  { id: "line3", name: "线路3（vectorengine）", consoleUrl: "https://api.vectorengine.ai/console", supported: true },
  { id: "line4", name: "线路4（pockgo）", consoleUrl: "https://newapi.pockgo.com/console", supported: true },
  { id: "line5", name: "线路5（APIMart）", consoleUrl: "https://apimart.ai/zh/overview", supported: true },
  { id: "line6", name: "线路6（manxiaobai）", consoleUrl: "https://api.manxiaobai.online/console", balanceMode: "api_key", supported: true },
  { id: "line7", name: "线路7（novaeworld）", consoleUrl: "https://api.novaeworld.top/console", balanceMode: "api_key", supported: true },
];

/** balance_fetch 命令的成功结果 */
export interface BalanceFetchOk {
  ok: true;
  balance: number;
  history_used: number;
  unit: string;
  userId: number;
  username?: string;
  displayName?: string;
  rawQuota?: number;
  rawUsedQuota?: number;
}

/** balance_fetch 命令的失败结果（脚本主动返回的，区别于 invoke 抛错） */
export interface BalanceFetchErr {
  ok: false;
  reason: "no_session" | "expired" | "incomplete_session" | "no_cookies"
        | "bad_session" | "api_error" | "http_error" | "network_error" | "parse_error";
  detail?: string;
  body?: string;
}

export type BalanceFetchResult = BalanceFetchOk | BalanceFetchErr;

/** 触发余额刷新；可能 throw（Rust 端 invoke 失败） */
export async function fetchBalance(lineId: string): Promise<BalanceFetchResult> {
  const line = BALANCE_LINES.find((item) => item.id === lineId);
  if (getBackendGatewayUrl() && line?.balanceMode === "api_key") {
    return await callBackendGateway<BalanceFetchResult>(
      "/api/admin/balance",
      { line: lineId },
      { timeoutMs: 30_000 }
    );
  }
  return await invoke<BalanceFetchResult>("balance_fetch", { line: lineId });
}

/** 触发手动登录（弹 Playwright 窗口）；script 跑完才 resolve，可能数分钟 */
export async function triggerBalanceLogin(lineId: string): Promise<void> {
  await invoke<void>("balance_login", { line: lineId });
}

/** 打开该线路后台 console（注入已有 cookies，免登录），用户关窗口后才 resolve */
export async function openBalanceConsole(lineId: string): Promise<void> {
  await invoke<void>("balance_open_console", { line: lineId });
}

export interface LinePauseResponse {
  ok: boolean;
  paused: {
    line: string;
    reason: string;
    paused_at: string;
    source: string;
  };
}

export interface LineResumeResponse {
  ok: boolean;
  removed: boolean;
}

/**
 * 通知网关暂停指定线路（auto 路由不再分配 + manual 选择被拒）。
 * 仅在网关模式下生效；本地 Tauri 调试模式没有这个概念。幂等。
 */
export async function pauseLine(
  lineId: string,
  reason: string,
  source = "balance_zero"
): Promise<LinePauseResponse | null> {
  if (!getBackendGatewayUrl()) return null;
  return await callBackendGateway<LinePauseResponse>("/api/admin/line-pause", {
    line: lineId,
    reason,
    source,
  });
}

/**
 * 通知网关恢复指定线路。幂等：没有暂停记录时也会成功，removed=false。
 */
export async function resumeLine(lineId: string): Promise<LineResumeResponse | null> {
  if (!getBackendGatewayUrl()) return null;
  return await callBackendGateway<LineResumeResponse>("/api/admin/line-resume", {
    line: lineId,
  });
}
