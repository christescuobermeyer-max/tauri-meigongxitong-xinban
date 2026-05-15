import type { GenerationLogRow, PlatformDb } from "./supabase";
import { pruneExpiredHistoryEntries } from "./history-retention.js";
import type { AssetKind, Platform } from "../types";

export interface HistoryEntry {
  id: string;
  kind: AssetKind;
  title: string;
  shopName: string;
  remoteUrl: string;
  platform: Platform;
  generationLine?: "line1" | "line2" | "line3" | "line4" | "line5" | null;
  previewUrl?: string;
  createdAt: string;
}

const STORAGE_KEY = "csgh-image-history";

export function appendHistoryEntry(
  entries: HistoryEntry[],
  entry: HistoryEntry,
  now = new Date()
): HistoryEntry[] {
  return pruneExpiredHistoryEntries(normalizeHistoryEntries([entry, ...entries]), now);
}

export function buildHistoryEntriesFromGenerationLogs(
  logs: Array<
    Pick<
      GenerationLogRow,
      "id" | "asset_kind" | "shop_name" | "oss_url" | "generation_line" | "created_at" | "platform"
    >
  >,
  now = new Date()
): HistoryEntry[] {
  return pruneExpiredHistoryEntries(
    normalizeHistoryEntries(
      logs.map((log) => ({
        id: log.id,
        kind: log.asset_kind,
        title: getHistoryTitle(log.asset_kind),
        shopName: log.shop_name,
        remoteUrl: log.oss_url,
        platform: normalizePlatform(log.platform),
        generationLine: normalizeGenerationLine(log.asset_kind, log.generation_line),
        createdAt: log.created_at,
      }))
    ),
    now
  );
}

export function getHistoryTitle(kind: AssetKind): string {
  return kind === "avatar"
    ? "头像"
    : kind === "storefront"
      ? "店招"
      : kind === "poster"
        ? "海报"
        : kind === "product"
          ? "产品图"
          : kind === "p_signboard"
            ? "P门头"
            : kind === "picture_wall"
              ? "图片墙"
              : kind === "detail_page"
                ? "详情页"
                : kind === "brand_story"
                  ? "品牌故事"
                  : kind === "data_analysis"
                    ? "数据分析"
                    : kind === "patrol_script"
                      ? "巡店话术"
                      : "图片墙";
}

export function loadHistoryEntries(): HistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem("csgh-image-history");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneExpiredHistoryEntries(normalizeHistoryEntries(parsed.filter(isHistoryEntry)));
  } catch {
    return [];
  }
}

export function saveHistoryEntries(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  const compactEntries = pruneExpiredHistoryEntries(normalizeHistoryEntries(entries)).map((entry) => ({
    id: entry.id,
    kind: entry.kind,
      title: entry.title,
      shopName: entry.shopName,
      remoteUrl: entry.remoteUrl,
      platform: entry.platform,
      generationLine: entry.generationLine,
      createdAt: entry.createdAt,
    }));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compactEntries));
  } catch {
    // 忽略存储配额错误，避免影响主界面渲染。
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.kind === "string" &&
    typeof entry.title === "string" &&
    typeof entry.shopName === "string" &&
    typeof entry.remoteUrl === "string" &&
    (entry.platform === "meituan" || entry.platform === "taobao" || typeof entry.platform === "undefined") &&
    (entry.generationLine === "line1" || entry.generationLine === "line2" || entry.generationLine === "line3" || entry.generationLine === "line4" || entry.generationLine === "line5" || entry.generationLine === null || typeof entry.generationLine === "undefined") &&
    (typeof entry.previewUrl === "string" || typeof entry.previewUrl === "undefined") &&
    typeof entry.createdAt === "string"
  );
}

function normalizeHistoryEntries(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.map((entry) => {
    const inferredKind = inferHistoryKindFromUrl(entry.remoteUrl) ?? entry.kind;
    const generationLine = normalizeGenerationLine(inferredKind, entry.generationLine);
    const platform = normalizePlatform(entry.platform);
    return inferredKind === entry.kind &&
      entry.title === getHistoryTitle(inferredKind) &&
      generationLine === entry.generationLine &&
      platform === entry.platform
      ? entry
      : { ...entry, kind: inferredKind, title: getHistoryTitle(inferredKind), generationLine, platform };
  });
}

function normalizePlatform(platform: PlatformDb | Platform | null | undefined): Platform {
  return platform === "taobao" ? "taobao" : "meituan";
}

function normalizeGenerationLine(
  kind: AssetKind,
  line?: "line1" | "line2" | "line3" | "line4" | "line5" | null
): "line1" | "line2" | "line3" | "line4" | "line5" | null {
  if (line === "line1" || line === "line2" || line === "line3" || line === "line4" || line === "line5") return line;
  return kind === "picture_wall" ? null : "line1";
}

function inferHistoryKindFromUrl(remoteUrl: string): AssetKind | null {
  const value = remoteUrl.toLowerCase();
  if (value.includes("p-signboard")) return "p_signboard";
  if (value.includes("picture-wall")) return "picture_wall";
  if (value.includes("detail-page")) return "detail_page";
  if (value.includes("brand-story")) return "brand_story";
  if (value.includes("data-analysis")) return "data_analysis";
  if (value.includes("patrol-script")) return "patrol_script";
  return null;
}
