import { supabase } from "../supabase";
import { ensureTauriInvoke } from "./invoke";
import { callBackendGateway, getBackendGatewayUrl } from "./gateway";
import type { BrandCopy, BrandStoryThreadId, BrandStoryThreadAvailability } from "../../types";

export interface BrandStoryTextRequest {
  store_name: string;
  category: string;
  thread_id: BrandStoryThreadId;
}

/** 调用 Rust 端：根据店铺名/品类生成品牌故事 6 段文案 */
export async function generateBrandStoryText(
  req: BrandStoryTextRequest
): Promise<BrandCopy> {
  if (getBackendGatewayUrl()) {
    return await callBackendGateway<BrandCopy>("/api/brand-story-generate-text", req);
  }
  return await ensureTauriInvoke()<BrandCopy>("brand_story_generate_text", { req });
}

/** 查询品牌故事 4 条线路的可用性（不暴露密钥本身） */
export async function fetchBrandStoryThreadAvailability(): Promise<BrandStoryThreadAvailability> {
  const baseUrl = getBackendGatewayUrl();
  if (baseUrl) {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error("登录态已失效，请重新登录后再试");
    const response = await fetch(`${baseUrl}/api/brand-story-thread-availability`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`获取品牌故事线路可用性失败：${response.status}`);
    return (await response.json()) as BrandStoryThreadAvailability;
  }
  return await ensureTauriInvoke()<BrandStoryThreadAvailability>(
    "brand_story_thread_availability"
  );
}
