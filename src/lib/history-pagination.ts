import type { HistoryEntry } from "./history";

export const HISTORY_PAGE_SIZE = 15;

export function getHistoryPageCountFromTotal(totalCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / HISTORY_PAGE_SIZE));
}

export function getHistoryPageCount(entries: HistoryEntry[]): number {
  return getHistoryPageCountFromTotal(entries.length);
}

export function getPagedHistoryEntries(entries: HistoryEntry[], page: number): HistoryEntry[] {
  const safePage = Math.min(Math.max(1, page), getHistoryPageCount(entries));
  const start = (safePage - 1) * HISTORY_PAGE_SIZE;
  return entries.slice(start, start + HISTORY_PAGE_SIZE);
}

export function getHistoryQueryRange(page: number, pageSize = HISTORY_PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const from = (safePage - 1) * safePageSize;
  return { from, to: from + safePageSize - 1 };
}
