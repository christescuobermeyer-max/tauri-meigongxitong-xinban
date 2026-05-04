import type { HistoryEntry } from "./history";

export const HISTORY_PAGE_SIZE = 12;

export function getHistoryPageCount(entries: HistoryEntry[]): number {
  return Math.max(1, Math.ceil(entries.length / HISTORY_PAGE_SIZE));
}

export function getPagedHistoryEntries(entries: HistoryEntry[], page: number): HistoryEntry[] {
  const safePage = Math.min(Math.max(1, page), getHistoryPageCount(entries));
  const start = (safePage - 1) * HISTORY_PAGE_SIZE;
  return entries.slice(start, start + HISTORY_PAGE_SIZE);
}
