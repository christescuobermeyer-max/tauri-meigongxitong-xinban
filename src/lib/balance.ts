import { invoke } from "@tauri-apps/api/core";

export interface BalanceLineDef {
  id: string;
  /** 显示名 */
  name: string;
  /** 余额管理后台首页 URL（提示用户去手动登录的入口） */
  consoleUrl: string;
  /** 当前是否已接入 Rust 命令；false 时前端只显示占位 */
  supported: boolean;
}

export const BALANCE_LINES: BalanceLineDef[] = [
  { id: "line1", name: "线路1（共用线路2 yunwu）", consoleUrl: "https://yunwu.ai/console", supported: true },
  { id: "line2", name: "线路2（云雾 yunwu.ai）", consoleUrl: "https://yunwu.ai/console", supported: true },
  { id: "line3", name: "线路3（vectorengine）", consoleUrl: "https://api.vectorengine.ai/console", supported: true },
  { id: "line4", name: "线路4（pockgo）", consoleUrl: "https://newapi.pockgo.com/console", supported: true },
  { id: "line5", name: "线路5（APIMart）", consoleUrl: "https://apimart.ai/zh/overview", supported: true },
  { id: "line6", name: "线路6（manxiaobai）", consoleUrl: "https://api.manxiaobai.online/console", supported: true },
  { id: "line7", name: "线路7（otuapi）", consoleUrl: "https://otuapi.com/console", supported: true },
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
  return await invoke<BalanceFetchResult>("balance_fetch", { line: lineId });
}

/** 触发手动登录（弹 Playwright 窗口）；script 跑完才 resolve，可能数分钟 */
export async function triggerBalanceLogin(lineId: string): Promise<void> {
  await invoke<void>("balance_login", { line: lineId });
}
