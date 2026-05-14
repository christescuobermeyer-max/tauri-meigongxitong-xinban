import { invoke } from "@tauri-apps/api/core";
import { getShanghaiDateRange } from "./admin-log-filters";
import {
  ALL_ACCOUNTS_ID,
  aggregateDailyStatRows,
  getShanghaiCutoffDay,
  type AccountSummary,
} from "./admin-stats";
import { supabase, type DailyStatRow, type GenerationLogRow, type ProfileRow } from "./supabase";
import { callBackendGateway, getBackendGatewayUrl } from "./tauri";

export {
  ALL_ACCOUNTS_ID,
  aggregateDailyStatRows,
  buildAllAccountsSummary,
} from "./admin-stats";
export type { AccountSummary } from "./admin-stats";

/** 获取所有账号列表 + 每个账号的累计/今日生图数（管理员视角，依赖 RLS） */
export async function listAccountSummaries(): Promise<AccountSummary[]> {
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (profileError) throw new Error(`读取账号列表失败：${profileError.message}`);
  const profileRows = (profiles as ProfileRow[] | null) ?? [];
  if (profileRows.length === 0) return [];

  const stats = await fetchAggregatedStats(profileRows.map((profile) => profile.id));
  const summaries: AccountSummary[] = profileRows.map((profile) => {
    const stat = stats.get(profile.id);
    return {
      ...profile,
      total_count: stat?.total ?? 0,
      today_count: stat?.today ?? 0,
    };
  });

  summaries.sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (a.role !== "admin" && b.role === "admin") return 1;
    return 0;
  });

  return summaries;
}

interface AggregatedStat {
  total: number;
  today: number;
}

async function fetchAggregatedStats(profileIds: string[]): Promise<Map<string, AggregatedStat>> {
  const todayStartIso = startOfShanghaiTodayIso();
  const pairs = await Promise.all(
    profileIds.map(async (userId) => {
      const [total, today] = await Promise.all([
        fetchExactGenerationCount(userId),
        fetchExactGenerationCount(userId, todayStartIso),
      ]);
      return [userId, { total, today }] as const;
    })
  );
  return new Map(pairs);
}

async function fetchExactGenerationCount(userId: string, startIso?: string): Promise<number> {
  let query = supabase
    .from("generation_logs")
    .select("id", { count: "exact", head: true });
  if (userId !== ALL_ACCOUNTS_ID) query = query.eq("user_id", userId);
  if (startIso) query = query.gte("created_at", startIso);
  const { count, error } = await query;
  if (error) {
    console.warn("[admin] fetchExactGenerationCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

interface GenerationLogQueryOptions {
  limit?: number;
  statDay?: string | null;
}

/** 拉取指定用户的生图记录，可按上海日期查看当天明细 */
export async function fetchAccountGenerationLogs(
  userId: string,
  options: number | GenerationLogQueryOptions = 50
): Promise<GenerationLogRow[]> {
  const limit = typeof options === "number" ? options : options.limit ?? 50;
  const statDay = typeof options === "number" ? null : options.statDay;
  let query = supabase
    .from("generation_logs")
    .select("*")
    .order("created_at", { ascending: false });
  if (userId !== ALL_ACCOUNTS_ID) query = query.eq("user_id", userId);
  if (statDay) {
    const range = getShanghaiDateRange(statDay);
    query = query.gte("created_at", range.startIso).lt("created_at", range.endIso);
  }
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`读取该账号生图记录失败：${error.message}`);
  return (data as GenerationLogRow[] | null) ?? [];
}

/** 拉取指定用户最近 N 天的每日统计 */
export async function fetchAccountDailyStats(
  userId: string,
  days = 14
): Promise<DailyStatRow[]> {
  let query = supabase
    .from("daily_generation_stats")
    .select("*")
    .order("stat_day", { ascending: false });
  if (userId === ALL_ACCOUNTS_ID) {
    const cutoffDay = getShanghaiCutoffDay(days);
    query = query.gte("stat_day", cutoffDay).limit(50000);
  } else {
    query = query.eq("user_id", userId).limit(days);
  }
  const { data, error } = await query;
  if (error) throw new Error(`读取每日统计失败：${error.message}`);
  const rows = (data as DailyStatRow[] | null) ?? [];
  return userId === ALL_ACCOUNTS_ID ? aggregateDailyStatRows(rows, days) : rows;
}

function startOfShanghaiTodayIso(): string {
  const now = new Date();
  const shanghaiNowMs = now.getTime() + 8 * 60 * 60 * 1000;
  const startOfDayShanghaiMs =
    Math.floor(shanghaiNowMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  return new Date(startOfDayShanghaiMs - 8 * 60 * 60 * 1000).toISOString();
}

/** 推导出 Supabase Dashboard 创建用户页面的 URL（仅当应用内创建失败时给一个备用入口） */
export function getDashboardUsersUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return "https://supabase.com/dashboard";
  const match = url.match(/^https?:\/\/([^.]+)\./);
  if (!match) return "https://supabase.com/dashboard";
  return `https://supabase.com/dashboard/project/${match[1]}/auth/users`;
}

// ===========================================================================
// 创建账号（通过 Rust 端 service_role 调 Supabase Admin API）
// ===========================================================================

export interface CreatedAccount {
  id: string;
  email: string;
  display_name: string;
  password: string;
}

/**
 * 创建一个新账号。
 * - 邮箱：基于姓名 slug + 6 位随机后缀，自动生成（仅作 Supabase 登录标识，不发邮件）
 * - 密码：12 位随机
 * - 仅管理员可调用，Rust 端会校验
 */
export async function createUser(displayName: string): Promise<CreatedAccount> {
  const name = displayName.trim();
  if (!name) throw new Error("请输入姓名");

  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("登录态已失效，请重新登录后再试");

  const password = generateRandomPassword(12);
  const email = generateAutoEmail(name);
  const req = {
    access_token: accessToken,
    display_name: name,
    email,
    password,
  };

  if (getBackendGatewayUrl()) {
    return await callBackendGateway<CreatedAccount>("/api/admin-create-user", req);
  }

  return await invoke<CreatedAccount>("admin_create_user", {
    req,
  });
}

/** 12 位随机密码，包含大小写字母与数字（去掉容易混淆的 0/O/1/l/I） */
function generateRandomPassword(len = 12): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += charset[buf[i] % charset.length];
  return out;
}

/** 基于姓名 slug 生成伪邮箱：<slug>-<6位随机>@csgh.local */
function generateAutoEmail(name: string): string {
  const slug = toSlug(name);
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  const tail = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  const local = slug ? `${slug}-${tail}` : `user-${tail}`;
  return `${local}@csgh.local`;
}

/** 中文/特殊字符 → 安全 ASCII slug，截断到 16 字符 */
function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}
