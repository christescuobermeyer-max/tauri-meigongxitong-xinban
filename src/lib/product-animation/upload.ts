import { callBackendGateway } from "../desktop/gateway";
import { ensureTauriInvoke } from "../desktop/invoke";
import type { AnimationResult } from "./desktop";

/** Name shown for an animation: file or video name without its extension. */
export const animationTitle = (name: string) => name.replace(/\.(png|jpe?g|webp|mp4|mov|m4v|mkv|webm|avi)$/i, "").trim().slice(0, 60);

/**
 * Stores a finished local animation in OSS through the gateway (which validates it again),
 * then marks the local record as uploaded. Returns the updated record.
 */
export async function uploadAnimation(userId: string, result: AnimationResult): Promise<AnimationResult> {
  const payload = await ensureTauriInvoke()<{ data: string; poster: string }>("read_animation_upload", { userId, id: result.id });
  await callBackendGateway("/api/animation-uploads", { id: result.id, style: result.style, title: result.title ?? "", ...payload }, { timeoutMs: 90_000 });
  return ensureTauriInvoke()<AnimationResult>("mark_animation_uploaded", { userId, id: result.id });
}
