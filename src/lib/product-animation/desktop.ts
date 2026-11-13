import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { ensureTauriInvoke } from "../desktop/invoke";
import { join } from "@tauri-apps/api/path";
import { pickDirectoryPath, pickSavePath } from "../desktop/files";
import { validateAnimation, type AnimationFormat, type AnimationResultStyle } from "./policy";
import { animationFileName, uniqueFileNames } from "./file-names";

export interface AnimationResult {
  id: string;
  style: AnimationResultStyle;
  path: string;
  posterPath: string;
  createdAt: string;
  media: { width: number; height: number; durationMs: number; frames: number; bytes: number; format: AnimationFormat };
  /** Video or source image name. */
  title?: string | null;
  /** Set once the animation is stored in OSS through the gateway. */
  uploadedAt?: string | null;
  /** Running number of video animations for this account (视频动图_001). */
  sequence?: number | null;
}
export const animationFileUrl = (path: string) => convertFileSrc(path);
export const hasAnimationDesktop = () => isTauri();
export async function listAnimations(userId: string) {
  return ensureTauriInvoke()<AnimationResult[]>("list_product_animations", { userId });
}
export async function saveAnimation(userId: string, result: AnimationResult) {
  const errors = validateAnimation(result.media);
  if (errors.length) throw new Error(errors.join("；"));
  const extension = result.media.format;
  const path = await pickSavePath(animationFileName(result), [{ name: extension.toUpperCase(), extensions: [extension] }]);
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
  const names = uniqueFileNames(results.map(animationFileName));
  for (const [index, result] of results.entries()) {
    // keepExisting: files already in the folder get " (2)" instead of being overwritten.
    await ensureTauriInvoke()("save_product_animation", { userId, id: result.id, destination: await join(directory, names[index]), keepExisting: true });
  }
  return results.length;
}

/** 删除当前账号保存在本机的全部动图（不影响已另存到其他位置的文件）。 */
export async function clearAnimations(userId: string) {
  return ensureTauriInvoke()<{ removed: number; bytes: number }>("clear_product_animations", { userId });
}
