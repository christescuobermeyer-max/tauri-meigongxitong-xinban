import type { DailyStatRow, ProfileRow } from "./supabase";

export const ALL_ACCOUNTS_ID = "__all_accounts__";

export interface AccountSummary extends ProfileRow {
  /** 累计生图总数 */
  total_count: number;
  /** 今日生图数 */
  today_count: number;
  /** 是否为后台汇总行 */
  is_all?: boolean;
}

export function buildAllAccountsSummary(accounts: AccountSummary[]): AccountSummary {
  const lastLogin = accounts
    .map((account) => account.last_login_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
  return {
    id: ALL_ACCOUNTS_ID,
    display_name: "所有账户",
    role: "admin",
    login_count: accounts.reduce((sum, account) => sum + account.login_count, 0),
    last_login_at: lastLogin,
    is_active: true,
    created_at: "",
    total_count: accounts.reduce((sum, account) => sum + account.total_count, 0),
    today_count: accounts.reduce((sum, account) => sum + account.today_count, 0),
    is_all: true,
  };
}

export function aggregateDailyStatRows(rows: DailyStatRow[], days: number): DailyStatRow[] {
  const map = new Map<string, DailyStatRow>();
  for (const row of rows) {
    const current = map.get(row.stat_day) ?? buildEmptyDailyStat(row.stat_day);
    current.total_count += row.total_count;
    current.avatar_count += row.avatar_count;
    current.storefront_count += row.storefront_count;
    current.poster_count += row.poster_count;
    current.product_count += row.product_count;
    current.p_signboard_count += row.p_signboard_count;
    current.picture_wall_count += row.picture_wall_count;
    current.detail_page_count += row.detail_page_count;
    current.brand_story_count += row.brand_story_count ?? 0;
    current.data_analysis_count += row.data_analysis_count ?? 0;
    current.patrol_script_count += row.patrol_script_count ?? 0;
    map.set(row.stat_day, current);
  }
  return [...map.values()]
    .sort((a, b) => b.stat_day.localeCompare(a.stat_day))
    .slice(0, days);
}

export function getShanghaiCutoffDay(days: number): string {
  const now = new Date();
  const shanghaiNowMs = now.getTime() + 8 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = Math.floor(shanghaiNowMs / dayMs) * dayMs;
  const cutoff = new Date(startOfToday - Math.max(0, days - 1) * dayMs);
  return `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}-${String(
    cutoff.getUTCDate()
  ).padStart(2, "0")}`;
}

function buildEmptyDailyStat(statDay: string): DailyStatRow {
  return {
    user_id: ALL_ACCOUNTS_ID,
    stat_day: statDay,
    total_count: 0,
    avatar_count: 0,
    storefront_count: 0,
    poster_count: 0,
    product_count: 0,
    p_signboard_count: 0,
    picture_wall_count: 0,
    detail_page_count: 0,
    brand_story_count: 0,
    data_analysis_count: 0,
    patrol_script_count: 0,
  };
}
