export const HISTORY_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function getHistoryRetentionCutoffDate(now = new Date()): Date {
  return new Date(now.getTime() - HISTORY_RETENTION_DAYS * DAY_MS);
}

export function getHistoryRetentionCutoffIso(now = new Date()): string {
  return getHistoryRetentionCutoffDate(now).toISOString();
}

export function isHistoryExpired(createdAt: string, now = new Date()): boolean {
  const createdAtDate = new Date(createdAt);
  if (Number.isNaN(createdAtDate.getTime())) return false;
  return createdAtDate < getHistoryRetentionCutoffDate(now);
}

export function pruneExpiredHistoryEntries<T extends { createdAt: string }>(
  entries: T[],
  now = new Date()
): T[] {
  return entries.filter((entry) => !isHistoryExpired(entry.createdAt, now));
}
