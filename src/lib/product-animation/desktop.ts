import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { ensureTauriInvoke } from "../desktop/invoke";
import { join } from "@tauri-apps/api/path";
import { pickDirectoryPath, pickSavePath } from "../desktop/files";
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

/** 选一次文件夹，把多张动图依次保存进去；返回保存数量，取消选择时返回 0。 */
export async function saveAllAnimations(userId: string, results: AnimationResult[]): Promise<number> {
  for (const result of results) {
    const errors = validateAnimation(result.media);
    if (errors.length) throw new Error(errors.join("；"));
  }
  const directory = await pickDirectoryPath("选择动图保存文件夹");
  if (!directory) return 0;
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  for (const [index, result] of results.entries()) {
    const name = ANIMATION_STYLES.find((style) => style.id === result.style)?.title || "动图";
    const file = `菜品动图_${String(index + 1).padStart(2, "0")}_${name}_${result.media.width}x${result.media.height}_${stamp}.${result.media.format}`;
    await ensureTauriInvoke()("save_product_animation", { userId, id: result.id, destination: await join(directory, file) });
  }
  return results.length;
}
