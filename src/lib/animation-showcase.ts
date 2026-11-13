import { supabase } from "./supabase";
import { getBackendGatewayUrl, pickSavePath, saveBase64Image } from "./tauri";
import { downloadOssImageAsBase64 } from "./oss-image-download";
import { safeName } from "./product-animation/file-names";

const REQUEST_TIMEOUT_MS = 15_000;
export const ANIMATION_SHOWCASE_MAX_PAGES = 10;

export interface AnimationShowcaseItem {
  id: string;
  displayName: string;
  title: string;
  format: "gif" | "webp";
  width: number;
  height: number;
  durationMs: number;
  frames: number;
  bytes: number;
  url: string;
  posterUrl: string;
  createdAt: string;
}

export interface AnimationShowcasePage {
  page: number;
  pageSize: number;
  pageCount: number;
  visibleTotalCount: number;
  items: AnimationShowcaseItem[];
}

interface GatewayItem {
  id: string; display_name: string; title: string; format: "gif" | "webp"; width: number; height: number;
  duration_ms: number; frames: number; bytes: number; url: string; poster_url: string; created_at: string;
}
interface GatewayPage { page: number; page_size: number; page_count: number; visible_total_count: number; items: GatewayItem[] }

export function normalizeAnimationShowcase(response: GatewayPage): AnimationShowcasePage {
  const pageCount = Math.min(ANIMATION_SHOWCASE_MAX_PAGES, Math.max(1, response.page_count || 1));
  return {
    page: Math.min(pageCount, Math.max(1, response.page || 1)),
    pageSize: response.page_size || 12,
    pageCount,
    visibleTotalCount: Math.max(0, response.visible_total_count || 0),
    items: response.items.map((item) => ({
      id: item.id, displayName: item.display_name || "未知账号", title: item.title || "视频动图", format: item.format,
      width: item.width, height: item.height, durationMs: item.duration_ms, frames: item.frames, bytes: item.bytes,
      url: item.url, posterUrl: item.poster_url, createdAt: item.created_at,
    })),
  };
}

/** Latest video animations from every account, newest first. */
export async function fetchAnimationShowcase(page = 1): Promise<AnimationShowcasePage> {
  const baseUrl = getBackendGatewayUrl();
  if (!baseUrl) throw new Error("未配置网关地址，无法读取动图展示");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("登录态已失效，请重新登录");
  const url = new URL(`${baseUrl}/api/animation-showcase`);
  url.searchParams.set("page", String(Math.min(ANIMATION_SHOWCASE_MAX_PAGES, Math.max(1, Math.floor(page) || 1))));
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok) throw new Error(`动图展示接口返回 ${response.status}：${(await response.text().catch(() => "")) || "(空响应)"}`);
    return normalizeAnimationShowcase(await response.json() as GatewayPage);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("动图展示加载超时，请稍后重试");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Save name for a showcase animation: its title, or 视频动图 when it has none. */
export const showcaseFileName = (item: Pick<AnimationShowcaseItem, "title" | "format">) => `${safeName(item.title) || "视频动图"}.${item.format}`;

/** Asks where to save, then writes the original GIF/WebP bytes. Returns false when cancelled. */
export async function downloadShowcaseItem(item: AnimationShowcaseItem): Promise<boolean> {
  const path = await pickSavePath(showcaseFileName(item), [{ name: item.format.toUpperCase(), extensions: [item.format] }]);
  if (!path) return false;
  const file = await downloadOssImageAsBase64(item.url);
  if (file.mimeType !== `image/${item.format}`) throw new Error("下载的文件不是动图，请刷新后重试");
  await saveBase64Image({ base64_data: file.base64, output_path: path });
  return true;
}
