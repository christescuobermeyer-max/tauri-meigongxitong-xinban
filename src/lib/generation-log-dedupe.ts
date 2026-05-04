import type { AssetKind } from "../types";

export function buildGenerationLogKey(kind: AssetKind, remoteUrl: string): string {
  return `${kind}::${remoteUrl.trim()}`;
}

export function markGenerationLogRecorded(
  recorded: Set<string>,
  kind: AssetKind,
  remoteUrl: string
): boolean {
  const key = buildGenerationLogKey(kind, remoteUrl);
  if (recorded.has(key)) return false;
  recorded.add(key);
  return true;
}
