import { supabase, type AssetKindDb, type PlatformDb } from "./supabase";
import { getBackendGatewayUrl } from "./tauri";
import type { HistoricalGenerationLine } from "../types";

const REQUEST_TIMEOUT_MS = 15_000;

export const IMAGE_PLAZA_PAGE_SIZE = 30;
export const IMAGE_PLAZA_MAX_PAGES = 10;

export interface ImagePlazaItem {
  id: string;
  userId: string;
  displayName: string;
  shopName: string;
  productName: string | null;
  assetKind: AssetKindDb;
  platform: PlatformDb;
  generationLine: HistoricalGenerationLine | null;
  imageUrl: string;
  createdAt: string;
  elapsedMs: number | null;
}

export interface ImagePlazaPage {
  page: number;
  pageSize: number;
  maxPages: number;
  totalCount: number;
  visibleTotalCount: number;
  pageCount: number;
  items: ImagePlazaItem[];
}

interface GatewayImagePlazaItem {
  id: string;
  user_id: string;
  display_name: string;
  shop_name: string;
  product_name: string | null;
  asset_kind: AssetKindDb;
  platform: PlatformDb;
  generation_line: HistoricalGenerationLine | null;
  image_url: string;
  created_at: string;
  elapsed_ms: number | null;
}

interface GatewayImagePlazaResponse {
  page: number;
  page_size: number;
  max_pages: number;
  total_count: number;
  visible_total_count: number;
  page_count: number;
  items: GatewayImagePlazaItem[];
}

export async function fetchImagePlazaPage(page = 1): Promise<ImagePlazaPage> {
  const baseUrl = getBackendGatewayUrl();
  if (!baseUrl) {
    throw new Error("未配置网关地址，无法读取图片广场");
  }

  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) {
    throw new Error("登录态已失效，请重新登录");
  }

  const safePage = clampImagePlazaPage(page);
  const url = new URL(`${baseUrl}/api/image-plaza`);
  url.searchParams.set("page", String(safePage));

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`图片广场接口返回 ${response.status}：${text || "(空响应)"}`);
    }
    return normalizeImagePlazaResponse((await response.json()) as GatewayImagePlazaResponse);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("图片广场加载超时，请稍后重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function clampImagePlazaPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(IMAGE_PLAZA_MAX_PAGES, Math.max(1, Math.floor(page)));
}

function normalizeImagePlazaResponse(response: GatewayImagePlazaResponse): ImagePlazaPage {
  const maxPages = Math.min(
    IMAGE_PLAZA_MAX_PAGES,
    Math.max(1, response.max_pages || IMAGE_PLAZA_MAX_PAGES)
  );
  return {
    page: Math.min(maxPages, Math.max(1, response.page || 1)),
    pageSize: response.page_size || IMAGE_PLAZA_PAGE_SIZE,
    maxPages,
    totalCount: Math.max(0, response.total_count || 0),
    visibleTotalCount: Math.max(0, response.visible_total_count || 0),
    pageCount: Math.min(maxPages, Math.max(1, response.page_count || 1)),
    items: response.items.map((item) => ({
      id: item.id,
      userId: item.user_id,
      displayName: item.display_name || "未知账号",
      shopName: item.shop_name || "未命名店铺",
      productName: item.product_name,
      assetKind: item.asset_kind,
      platform: item.platform,
      generationLine: item.generation_line,
      imageUrl: item.image_url,
      createdAt: item.created_at,
      elapsedMs: item.elapsed_ms,
    })),
  };
}
