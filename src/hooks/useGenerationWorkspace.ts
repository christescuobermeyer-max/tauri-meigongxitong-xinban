import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import useBrandStoryWorkspace from "./useBrandStoryWorkspace";
import useDataAnalysisWorkspace from "./useDataAnalysisWorkspace";
import useDetailPageWorkspace from "./useDetailPageWorkspace";
import useImageEditWorkspace from "./useImageEditWorkspace";
import usePackageImageWorkspace from "./usePackageImageWorkspace";
import usePSignboardWorkspace from "./usePSignboardWorkspace";
import usePatrolScriptWorkspace from "./usePatrolScriptWorkspace";
import usePictureWallWorkspace from "./usePictureWallWorkspace";
import useProductBatchWorkspace from "./useProductBatchWorkspace";
import useProductImageWorkspace from "./useProductImageWorkspace";
import useThreePieceWorkspace from "./useThreePieceWorkspace";
import {
  cleanupExpiredGenerationLogs,
  fetchGenerationLogsPage,
  fetchTodayCount,
  fetchTotalCount,
  recordGenerationLog,
} from "../lib/cloud-history";
import { HISTORY_PAGE_SIZE } from "../lib/history-pagination";
import { markGenerationLogRecorded } from "../lib/generation-log-dedupe";
import {
  appendHistoryEntry,
  buildHistoryEntriesFromGenerationLogs,
  getHistoryTitle,
  loadHistoryEntries,
  saveHistoryEntries,
  type HistoryEntry,
} from "../lib/history";
import { loadLinePreference, saveLinePreference } from "../lib/line-preferences";
import { isSupabaseConfigured } from "../lib/supabase";
import type {
  AssetKind,
  GenerationItem,
  GenerationLine,
  Platform,
} from "../types";

export type WorkspaceTab =
  | "avatarStorefront"
  | "productImage"
  | "productBatch"
  | "packageImage"
  | "pictureWall"
  | "pSignboard"
  | "imageEdit"
  | "detailPage"
  | "brandStory"
  | "dataAnalysis"
  | "patrolScript"
  | "history"
  | "admin";

interface WorkspaceOptions {
  userId: string;
}

export default function useGenerationWorkspace({ userId }: WorkspaceOptions) {
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>("avatarStorefront");
  const [todayCount, setTodayCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [generationLine, setGenerationLine] = useState<GenerationLine>(
    () => loadLinePreference(userId) ?? "line5"
  );

  useEffect(() => {
    saveLinePreference(userId, generationLine);
  }, [userId, generationLine]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const startedAt = useRef<number | null>(null);
  const recordedGenerationLogs = useRef<Set<string>>(new Set());

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
      return () => {
        cancelled = true;
      };
    }

    setHistoryEntries([]);
    setHistoryPage(1);
    setHistoryTotalCount(0);
    setTodayCount(0);
    setTotalCount(0);
    setHistoryLoading(true);
    void (async () => {
      await cleanupExpiredGenerationLogs();
      const [count, total, pageResult] = await Promise.all([
        fetchTodayCount(userId),
        fetchTotalCount(userId),
        fetchGenerationLogsPage(userId, 1, HISTORY_PAGE_SIZE),
      ]);
      if (cancelled) return;
      setTodayCount(count);
      setTotalCount(total);
      setHistoryPage(pageResult.page);
      setHistoryTotalCount(pageResult.totalCount);
      setHistoryEntries(buildHistoryEntriesFromGenerationLogs(pageResult.logs));
      setHistoryLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  function recordHistory(
    kind: AssetKind,
    item: GenerationItem,
    shopNameSnapshot: string,
    platformSnapshot: Platform
  ) {
    if (item.status !== "succeeded") return;

    const remoteUrl = item.remoteUrl;
    if (!remoteUrl) return;
    if (!markGenerationLogRecorded(recordedGenerationLogs.current, kind, remoteUrl)) return;
    const recordedLine = item.generationLine ?? generationLine;
    const trimmedShopName = shopNameSnapshot.trim() || "未命名店铺";
    const previewUrl = remoteUrl;

    const localEntry = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      title: getHistoryTitle(kind),
      shopName: trimmedShopName,
      remoteUrl,
      platform: platformSnapshot,
      generationLine: recordedLine,
      previewUrl,
      createdAt: new Date().toISOString(),
    };

    if (!isSupabaseConfigured) {
      setHistoryEntries((prev) => appendHistoryEntry(prev, localEntry));
      setHistoryTotalCount((count) => count + 1);
      return;
    }

    void recordGenerationLog({
      userId,
      shopName: shopNameSnapshot,
      assetKind: kind,
      platform: platformSnapshot,
      ossUrl: remoteUrl,
      generationLine: recordedLine,
    }).then(async (recorded) => {
      if (!recorded) {
        toast.show("云端生图记录写入失败，请刷新历史记录或联系管理员检查数据库配置", "error");
        return;
      }
      setTodayCount((n) => n + 1);
      setTotalCount((n) => n + 1);
      setHistoryTotalCount((count) => count + 1);
      if (tab === "history") await refreshCloudHistoryPage(historyPage);
      await cleanupExpiredGenerationLogs();
    });
  }

  const threePiece = useThreePieceWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const productImage = useProductImageWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const productBatch = useProductBatchWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const packageImage = usePackageImageWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const pictureWall = usePictureWallWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const pSignboard = usePSignboardWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const imageEdit = useImageEditWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const detailPage = useDetailPageWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const brandStory = useBrandStoryWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const dataAnalysis = useDataAnalysisWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const patrolScript = usePatrolScriptWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

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

  const busy =
    threePiece.busy ||
    productImage.busy ||
    productBatch.busy ||
    packageImage.busy ||
    pictureWall.busy ||
    pSignboard.busy ||
    imageEdit.busy ||
    detailPage.busy ||
    brandStory.busy ||
    dataAnalysis.busy ||
    patrolScript.busy;

  useEffect(() => {
    if (!busy) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    if (startedAt.current === null) startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 200);
    return () => clearInterval(timer);
  }, [busy]);

  return {
    tab,
    setTab,
    generationLine,
    setGenerationLine,
    todayCount,
    totalCount,
    busy,
    elapsed,
    historyEntries,
    historyPage,
    historyTotalCount,
    historyLoading,
    historyUsesCloud: isSupabaseConfigured,
    setHistoryPage,
    threePiece,
    productImage,
    productBatch,
    packageImage,
    pictureWall,
    pSignboard,
    imageEdit,
    detailPage,
    brandStory,
    dataAnalysis,
    patrolScript,
  };
}

export type GenerationWorkspace = ReturnType<typeof useGenerationWorkspace>;
