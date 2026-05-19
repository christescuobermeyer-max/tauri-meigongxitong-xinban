import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn(
    "[supabase] 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，云端功能将不可用"
  );
}

export const supabase: SupabaseClient = createClient(url ?? "http://localhost", anonKey ?? "anon", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "csgh-auth",
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);

export type AssetKindDb =
  | "avatar"
  | "storefront"
  | "poster"
  | "product"
  | "p_signboard"
  | "picture_wall"
  | "detail_page"
  | "brand_story"
  | "data_analysis"
  | "patrol_script";
export type PlatformDb = "meituan" | "taobao";
export type RoleDb = "user" | "admin";

export interface ProfileRow {
  id: string;
  display_name: string;
  role: RoleDb;
  login_count: number;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GenerationLogRow {
  id: string;
  user_id: string;
  shop_name: string;
  asset_kind: AssetKindDb;
  platform: PlatformDb;
  generation_line: "line1" | "line2" | "line3" | "line4" | "line5" | "line6" | null;
  oss_url: string;
  oss_key: string | null;
  created_at: string;
  elapsed_ms: number | null;
}

export interface GenerationTotalRow {
  user_id: string;
  total_count: number;
  updated_at: string;
}

export interface DailyStatRow {
  user_id: string;
  stat_day: string;
  total_count: number;
  avatar_count: number;
  storefront_count: number;
  poster_count: number;
  product_count: number;
  p_signboard_count: number;
  picture_wall_count: number;
  detail_page_count: number;
  brand_story_count: number;
  data_analysis_count: number;
  patrol_script_count: number;
}
