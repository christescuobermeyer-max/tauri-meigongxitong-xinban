import type { GenerationItem } from "../types";

export function getGenerationPreviewUrl(
  item: Pick<GenerationItem, "remoteUrl">
): string | null {
  const remoteUrl = item.remoteUrl?.trim();
  return remoteUrl || null;
}
