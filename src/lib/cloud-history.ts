import { getHistoryRetentionCutoffIso } from "./history-retention.js";
import { supabase, type GenerationLogRow } from "./supabase";
import type { AssetKind, Platform } from "../types";

export interface RecordGenerationLogInput {
  userId: string;
  shopName: string;
  assetKind: AssetKind;
  platform: Platform;
  ossUrl: string;
  generationLine?: "line1" | "line2" | "line3" | null;
}

/** 写一条生图记录到云端。失败只 console.warn，不阻塞主流程。 */
export async function recordGenerationLog(
  input: RecordGenerationLogInput
): Promise<void> {
  const { error } = await supabase.from("generation_logs").insert({
    user_id: input.userId,
    shop_name: input.shopName.trim() || "未命名店铺",
    asset_kind: input.assetKind,
    platform: input.platform,
    generation_line: input.generationLine ?? null,
    oss_url: input.ossUrl,
  });
  if (error) console.warn("[cloud-history] insert generation_log failed:", error.message);
}

/** 清理 7 天前已过期的云端生图记录。 */
export async function cleanupExpiredGenerationLogs(): Promise<number> {
  const { data, error } = await supabase.rpc("cleanup_expired_generation_logs", {
    p_cutoff: getHistoryRetentionCutoffIso(),
  });
  if (error) {
    console.warn("[cloud-history] cleanupExpiredGenerationLogs failed:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/** 读取当前用户今日已生成的图片数量（按 Asia/Shanghai 切日）。 */
export async function fetchTodayCount(userId: string): Promise<number> {
  const startIso = startOfShanghaiTodayIso();
  const { count, error } = await supabase
    .from("generation_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startIso);
  if (error) {
    console.warn("[cloud-history] fetchTodayCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** 拉取当前用户全部云端生图记录（默认按时间倒序）。 */
export async function fetchGenerationLogs(
  userId: string,
  limit?: number
): Promise<GenerationLogRow[]> {
  let query = supabase
    .from("generation_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (typeof limit === "number") query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.warn("[cloud-history] fetchGenerationLogs failed:", error.message);
    return [];
  }
  return (data as GenerationLogRow[] | null) ?? [];
}

/** 拉取当前用户最近的 N 条云端生图记录。 */
export async function fetchRecentGenerationLogs(
  userId: string,
  limit = 30
): Promise<GenerationLogRow[]> {
  return fetchGenerationLogs(userId, limit);
}

function startOfShanghaiTodayIso(): string {
  // Asia/Shanghai 比 UTC 早 8 小时；当下时间减去 (UTC+8 当日已过的毫秒) = UTC 中本日开始
  const now = new Date();
  const shanghaiNowMs = now.getTime() + 8 * 60 * 60 * 1000;
  const startOfDayShanghaiMs =
    Math.floor(shanghaiNowMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  return new Date(startOfDayShanghaiMs - 8 * 60 * 60 * 1000).toISOString();
}
