import { ensureTauriInvoke } from "./invoke";
import { callBackendGateway, getBackendGatewayUrl } from "./gateway";

export interface VideoInfo {
  videoUrl: string;
  title: string;
  author: string;
  platform: "douyin" | "xiaohongshu";
  headers?: Record<string, string>;
}

export async function parseDouyinVideo(shareText: string): Promise<VideoInfo> {
  if (getBackendGatewayUrl()) {
    return await callBackendGateway<VideoInfo>(
      "/api/video/parse-douyin",
      { share_text: shareText },
      { timeoutMs: 60_000 }
    );
  }
  return await ensureTauriInvoke()<VideoInfo>("parse_douyin", { shareText });
}
