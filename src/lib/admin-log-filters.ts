import type { GenerationLogRow } from "./supabase";

export type AssetKindLabel =
  | "全部"
  | "头像"
  | "店招"
  | "海报"
  | "产品图"
  | "P门头"
  | "图片墙"
  | "详情页"
  | "品牌故事"
  | "数据分析"
  | "巡店话术";

export const ASSET_LABEL: Record<string, string> = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
  product: "产品图",
  p_signboard: "P门头",
  picture_wall: "图片墙",
  detail_page: "详情页",
  brand_story: "品牌故事",
  data_analysis: "数据分析",
  patrol_script: "巡店话术",
};

export const GENERATION_LINE_LABEL: Record<
  "line1" | "line2" | "line3" | "line4" | "line5" | "line6",
  string
> = {
  line1: "线路1",
  line2: "线路2",
  line3: "线路3",
  line4: "线路4",
  line5: "线路5",
  line6: "线路6",
};

export interface GenerationLogFilter {
  assetLabel: AssetKindLabel;
  statDay?: string | null;
}

export function getShanghaiDateRange(statDay: string) {
  const [year, month, day] = statDay.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function filterGenerationLogs(
  logs: GenerationLogRow[],
  filter: GenerationLogFilter
): GenerationLogRow[] {
  const range = filter.statDay ? getShanghaiDateRange(filter.statDay) : null;
  return logs.filter((row) => {
    const assetMatched = filter.assetLabel === "全部" || ASSET_LABEL[row.asset_kind] === filter.assetLabel;
    const dateMatched =
      !range || (row.created_at >= range.startIso && row.created_at < range.endIso);
    return assetMatched && dateMatched;
  });
}
