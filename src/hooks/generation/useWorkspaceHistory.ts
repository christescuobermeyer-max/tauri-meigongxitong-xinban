import { useEffect, useState } from "react";
import { fetchGenerationLogsPage, fetchGlobalTotalCount, fetchTodayCount, fetchTotalCount } from "../../lib/cloud-history";
import { HISTORY_PAGE_SIZE } from "../../lib/history-pagination";
import { buildHistoryEntriesFromGenerationLogs, loadHistoryEntries, saveHistoryEntries, type HistoryEntry } from "../../lib/history";
import { isSupabaseConfigured } from "../../lib/supabase";
import type { GenerationLine } from "../../types";
import type { WorkspaceTab } from "../../lib/workspace-catalog";
import { useWorkspaceHistoryRecorder } from "./useWorkspaceHistoryRecorder";

interface Options {
  userId: string;
  tab: WorkspaceTab;
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
}

export function useWorkspaceHistory({ userId, tab, generationLine, onToast }: Options) {
  const [todayCount, setTodayCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [globalTotalCount, setGlobalTotalCount] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    if (isSupabaseConfigured) return;
    saveHistoryEntries(historyEntries);
  }, [historyEntries]);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured) {
      const localEntries = loadHistoryEntries();
      setHistoryEntries(localEntries);
      setHistoryTotalCount(localEntries.length);
      setHistoryPage(1);
      setTodayCount(0);
      setTotalCount(0);
      setGlobalTotalCount(0);
      return () => {
        cancelled = true;
      };
    }

    setHistoryEntries([]);
    setHistoryPage(1);
    setHistoryTotalCount(0);
    setTodayCount(0);
    setTotalCount(0);
    setGlobalTotalCount(0);
    setHistoryLoading(true);
    void (async () => {
      const [count, total, globalTotal, pageResult] = await Promise.all([
        fetchTodayCount(userId),
        fetchTotalCount(userId),
        fetchGlobalTotalCount(),
        fetchGenerationLogsPage(userId, 1, HISTORY_PAGE_SIZE),
      ]);
      if (cancelled) return;
      setTodayCount(count);
      setTotalCount(total);
      setGlobalTotalCount(globalTotal);
      setHistoryPage(pageResult.page);
      setHistoryTotalCount(pageResult.totalCount);
      setHistoryEntries(buildHistoryEntriesFromGenerationLogs(pageResult.logs));
      setHistoryLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (tab !== "history" || !isSupabaseConfigured) return;
    let cancelled = false;
    void (async () => {
      setHistoryLoading(true);
      const pageResult = await fetchGenerationLogsPage(userId, historyPage, HISTORY_PAGE_SIZE);
      if (!cancelled) {
        setHistoryPage(pageResult.page);
        setHistoryTotalCount(pageResult.totalCount);
        setHistoryEntries(buildHistoryEntriesFromGenerationLogs(pageResult.logs));
        setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, userId, historyPage]);

  async function refreshCloudHistoryPage(page: number) {
    if (!isSupabaseConfigured) return;
    setHistoryLoading(true);
    const pageResult = await fetchGenerationLogsPage(userId, page, HISTORY_PAGE_SIZE);
    setHistoryPage(pageResult.page);
    setHistoryTotalCount(pageResult.totalCount);
    setHistoryEntries(buildHistoryEntriesFromGenerationLogs(pageResult.logs));
    setHistoryLoading(false);
  }

  const recordHistory = useWorkspaceHistoryRecorder({
    userId, tab, generationLine, onToast, historyPage, setHistoryEntries, setHistoryTotalCount,
    setTodayCount, setTotalCount, setGlobalTotalCount, refreshCloudHistoryPage,
  });
  return { todayCount, totalCount, globalTotalCount, historyEntries, historyPage, historyTotalCount,
    historyLoading, historyUsesCloud: isSupabaseConfigured, setHistoryPage, recordHistory };
}
