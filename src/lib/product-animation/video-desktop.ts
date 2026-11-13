import { convertFileSrc } from "@tauri-apps/api/core";
import { ensureTauriInvoke } from "../desktop/invoke";

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
