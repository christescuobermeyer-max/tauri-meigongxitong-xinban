import type { AnimationRatio } from "./policy";

/** Crop rectangle in source video pixels. */
export interface VideoCrop { x: number; y: number; width: number; height: number }

export const MIN_VIDEO_SECONDS = 2;
const ratioValue = (ratio: AnimationRatio) => ratio === "4:3" ? 4 / 3 : 16 / 9;

/** Keeps a clip of `clipMs` inside the video; returns the start in whole milliseconds. */
export function clampClipStart(startMs: number, clipMs: number, durationMs: number) {
  return Math.round(Math.min(Math.max(0, startMs), Math.max(0, durationMs - clipMs)));
}

/** Clip lengths (ms) the video is long enough for. */
export function availableClipLengths(durationMs: number) {
  return [2000, 3000, 4000, 5000].filter((clip) => clip <= durationMs);
}

/** Largest centred crop with the platform ratio. */
export function initialCrop(videoWidth: number, videoHeight: number, ratio: AnimationRatio): VideoCrop {
  const r = ratioValue(ratio);
  const width = Math.floor(Math.min(videoWidth, videoHeight * r));
  const height = Math.floor(width / r);
  return { x: Math.floor((videoWidth - width) / 2), y: Math.floor((videoHeight - height) / 2), width, height };
}

/** Moves the crop by a source-pixel offset, keeping it fully inside the video. */
export function moveCrop(crop: VideoCrop, dx: number, dy: number, videoWidth: number, videoHeight: number): VideoCrop {
  return {
    ...crop,
    x: Math.round(Math.min(Math.max(0, crop.x + dx), videoWidth - crop.width)),
    y: Math.round(Math.min(Math.max(0, crop.y + dy), videoHeight - crop.height)),
  };
}

/** Resizes from the top-left anchor, keeping the ratio, a usable minimum and the video bounds. */
export function resizeCrop(crop: VideoCrop, width: number, videoWidth: number, videoHeight: number, ratio: AnimationRatio): VideoCrop {
  const r = ratioValue(ratio);
  const largest = Math.min(videoWidth - crop.x, (videoHeight - crop.y) * r);
  const smallest = Math.min(largest, Math.max(160, initialCrop(videoWidth, videoHeight, ratio).width * 0.25));
  const next = Math.floor(Math.min(Math.max(width, smallest), largest));
  return { ...crop, width: next, height: Math.floor(next / r) };
}

export function formatClipTime(ms: number) {
  const seconds = ms / 1000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

/** Readable name from share text: what comes before the link, minus Douyin's "7.99 复制打开抖音，看看【…】" lead-in. */
export function shareTitle(shareText: string) {
  const beforeLink = shareText.split(/https?:\/\//)[0]
    .replace(/^\s*[\d.]+\s*/, "")
    .replace(/复制打开抖音[，,]?\s*看看【[^】]*】/, "")
    .replace(/\s+/g, " ")
    .trim();
  return beforeLink.slice(0, 30) || "分享视频";
}
