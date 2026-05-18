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
      elapsedMs: item.elapsedMs ?? null,
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

  const threePieceSlot1 = useThreePieceWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const threePieceSlot2 = useThreePieceWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const threePieceSlot3 = useThreePieceWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const threePieceSlot4 = useThreePieceWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const threePieceSlot5 = useThreePieceWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const threePieceSlots = [threePieceSlot1, threePieceSlot2, threePieceSlot3, threePieceSlot4, threePieceSlot5] as const;

  const productImageSlot1 = useProductImageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const productImageSlot2 = useProductImageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const productImageSlot3 = useProductImageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const productImageSlot4 = useProductImageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const productImageSlot5 = useProductImageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const productImageSlots = [productImageSlot1, productImageSlot2, productImageSlot3, productImageSlot4, productImageSlot5] as const;

  const productBatchSlot1 = useProductBatchWorkspace({
    initialGenerationLine: generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });
  const productBatchSlot2 = useProductBatchWorkspace({
    initialGenerationLine: generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });
  const productBatchSlot3 = useProductBatchWorkspace({
    initialGenerationLine: generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });
  const productBatchSlot4 = useProductBatchWorkspace({
    initialGenerationLine: generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });
  const productBatchSlot5 = useProductBatchWorkspace({
    initialGenerationLine: generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });
  const productBatchSlots = [
    productBatchSlot1,
    productBatchSlot2,
    productBatchSlot3,
    productBatchSlot4,
    productBatchSlot5,
  ] as const;

  const packageImage = usePackageImageWorkspace({
    generationLine,
    onToast: toast.show,
    onRecordHistory: recordHistory,
  });

  const pictureWallSlot1 = usePictureWallWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const pictureWallSlot2 = usePictureWallWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const pictureWallSlot3 = usePictureWallWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const pictureWallSlot4 = usePictureWallWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const pictureWallSlot5 = usePictureWallWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const pictureWallSlots = [pictureWallSlot1, pictureWallSlot2, pictureWallSlot3, pictureWallSlot4, pictureWallSlot5] as const;

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

  const detailPageSlot1 = useDetailPageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const detailPageSlot2 = useDetailPageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const detailPageSlot3 = useDetailPageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const detailPageSlot4 = useDetailPageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const detailPageSlot5 = useDetailPageWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const detailPageSlots = [detailPageSlot1, detailPageSlot2, detailPageSlot3, detailPageSlot4, detailPageSlot5] as const;

  const brandStorySlot1 = useBrandStoryWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const brandStorySlot2 = useBrandStoryWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const brandStorySlot3 = useBrandStoryWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const brandStorySlot4 = useBrandStoryWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const brandStorySlot5 = useBrandStoryWorkspace({ initialGenerationLine: generationLine, onToast: toast.show, onRecordHistory: recordHistory });
  const brandStorySlots = [brandStorySlot1, brandStorySlot2, brandStorySlot3, brandStorySlot4, brandStorySlot5] as const;

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
    threePieceSlots.some((slot) => slot.busy) ||
    productImageSlots.some((slot) => slot.busy) ||
    productBatchSlots.some((slot) => slot.busy) ||
    packageImage.busy ||
    pictureWallSlots.some((slot) => slot.busy) ||
    pSignboard.busy ||
    imageEdit.busy ||
    detailPageSlots.some((slot) => slot.busy) ||
    brandStorySlots.some((slot) => slot.busy) ||
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
    threePieceSlots,
    productImageSlots,
    productBatchSlots,
    packageImage,
    pictureWallSlots,
    pSignboard,
    imageEdit,
    detailPageSlots,
    brandStorySlots,
    dataAnalysis,
    patrolScript,
  };
}

export type GenerationWorkspace = ReturnType<typeof useGenerationWorkspace>;
