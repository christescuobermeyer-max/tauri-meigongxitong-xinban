import { convertFileSrc } from "@tauri-apps/api/core";
import { ensureTauriInvoke } from "../desktop/invoke";
import { parseDouyinVideo, type VideoInfo } from "../desktop/video";
import { detectPlatform } from "../../components/video-signboard/helpers";
import { shareTitle } from "./video";
import type { VideoPlatform } from "../../components/video-signboard/types";

export const VIDEO_FILE_EXTENSIONS = ["mp4", "mov", "m4v", "mkv", "webm", "avi"];

/** Opens the system picker; returns the chosen video path, or null when cancelled. */
export async function pickAnimationVideo(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ multiple: false, title: "选择菜品视频", filters: [{ name: "视频文件", extensions: VIDEO_FILE_EXTENSIONS }] });
  return (Array.isArray(selected) ? selected[0] : selected) || null;
}

/** Playable URL of the original file. */
export async function animationVideoUrl(path: string) {
  return convertFileSrc(await ensureTauriInvoke()<string>("allow_animation_video", { path }));
}

/** H.264 copy for codecs the webview cannot play (e.g. some HEVC phone clips). */
export async function transcodeAnimationVideo(path: string) {
  return convertFileSrc(await ensureTauriInvoke()<string>("prepare_local_video_preview", { inputPath: path }));
}

/** Same parsing and download as the video signboard: share text → local MP4 path. */
export async function fetchShareVideo(shareText: string): Promise<{ path: string; title: string; platform: VideoPlatform }> {
  const platform = detectPlatform(shareText);
  if (!platform) throw new Error("仅支持小红书或抖音分享链接");
  const info = platform === "douyin" ? await parseDouyinVideo(shareText) : await ensureTauriInvoke()<VideoInfo>("parse_xiaohongshu", { shareText });
  const args: { url: string; platform: VideoPlatform; headers?: Record<string, string> } = { url: info.videoUrl, platform: info.platform };
  if (info.headers) args.headers = info.headers;
  const path = await ensureTauriInvoke()<string>("download_video", args);
  return { path, title: info.title?.trim() || shareTitle(shareText), platform };
}
