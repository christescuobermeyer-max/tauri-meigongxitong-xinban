import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { ensureTauriInvoke } from "../desktop/invoke";
import { pickSavePath } from "../desktop/files";
import { ANIMATION_STYLES, validateAnimation, type AnimationFormat, type AnimationStyle } from "./policy";

export interface AnimationResult {
  id: string;
  style: AnimationStyle;
  path: string;
  posterPath: string;
  createdAt: string;
  media: { width: number; height: number; durationMs: number; frames: number; bytes: number; format: AnimationFormat };
}
export const animationFileUrl = (path: string) => convertFileSrc(path);
export const hasAnimationDesktop = () => isTauri();
export async function listAnimations(userId: string) {
  return ensureTauriInvoke()<AnimationResult[]>("list_product_animations", { userId });
}
export async function saveAnimation(userId: string, result: AnimationResult) {
  const errors = validateAnimation(result.media);
  if (errors.length) throw new Error(errors.join("；"));
  const name = ANIMATION_STYLES.find((style) => style.id === result.style)?.title || "动图";
  const extension = result.media.format;
  const path = await pickSavePath(`菜品_${name}_${result.media.width}x${result.media.height}.${extension}`, [{ name: extension.toUpperCase(), extensions: [extension] }]);
  if (path) await ensureTauriInvoke()("save_product_animation", { userId, id: result.id, destination: path });
}
