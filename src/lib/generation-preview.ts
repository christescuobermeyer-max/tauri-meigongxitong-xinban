import type { GenerationItem } from "../types";

export function getGenerationPreviewUrl(
  item: Pick<GenerationItem, "remoteUrl">
): string | null {
  const remoteUrl = item.remoteUrl?.trim();
  return remoteUrl || null;
}

/**
 * 生图已经成功拿到 base64，但 OSS 归档还没完成。
 * 这段时间预览 URL 还没有，UI 应给员工明确提示"正在上传 OSS"，
 * 避免误以为生图失败。
 */
export function isArchivingToOss(
  item: Pick<GenerationItem, "status" | "remoteUrl">
): boolean {
  return item.status === "succeeded" && !item.remoteUrl?.trim();
}
