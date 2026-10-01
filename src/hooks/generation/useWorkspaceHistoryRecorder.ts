import { useRef, type Dispatch, type SetStateAction } from "react";
import { recordGenerationLog } from "../../lib/cloud-history";
import { markGenerationLogRecorded } from "../../lib/generation-log-dedupe";
import { appendHistoryEntry, getHistoryTitle, type HistoryEntry } from "../../lib/history";
import { isSupabaseConfigured } from "../../lib/supabase";
import type { AssetKind, GenerationItem, GenerationLine, Platform } from "../../types";
import type { WorkspaceTab } from "../../lib/workspace-catalog";

interface Options {
  userId: string;
  tab: WorkspaceTab;
  generationLine: GenerationLine;
  onToast: (message: string, tone: "error" | "info" | "success") => void;
  historyPage: number;
  setHistoryEntries: Dispatch<SetStateAction<HistoryEntry[]>>;
  setHistoryTotalCount: Dispatch<SetStateAction<number>>;
  setTodayCount: Dispatch<SetStateAction<number>>;
  setTotalCount: Dispatch<SetStateAction<number>>;
  setGlobalTotalCount: Dispatch<SetStateAction<number>>;
  refreshCloudHistoryPage: (page: number) => Promise<void>;
}

export function useWorkspaceHistoryRecorder({ userId, tab, generationLine, onToast, historyPage,
  setHistoryEntries, setHistoryTotalCount, setTodayCount, setTotalCount, setGlobalTotalCount,
  refreshCloudHistoryPage }: Options) {
  const recordedGenerationLogs = useRef<Set<string>>(new Set());
  function recordHistory(
    kind: AssetKind,
    item: GenerationItem,
    shopNameSnapshot: string,
    platformSnapshot: Platform
  ) {
    if (item.status !== "succeeded") return;

    const remoteUrl = item.remoteUrl;
    if (!remoteUrl) {
      // 归档到 OSS 失败：图已生成可下载，但本次不计入云端历史/今日统计/累计。
      // workspace-session 等调用方已经在归档失败时 toast 过技术原因；
      // 这里只补一条对员工可读的"统计未更新"提示，避免静默丢数。
      onToast(
        `${getHistoryTitle(kind)}已生成，可直接下载，但本次未计入云端历史/今日统计`,
        "info"
      );
      return;
    }
    if (!markGenerationLogRecorded(recordedGenerationLogs.current, kind, remoteUrl)) return;
    const recordedLine = normalizeRecordableGenerationLine(item.generationLine) ?? generationLine;
    const trimmedShopName = shopNameSnapshot.trim() || "未命名店铺";
    const productNameForHistory = kind === "product" ? item.productName?.trim() || undefined : undefined;
    const previewUrl = remoteUrl;

    const localEntry = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      title: getHistoryTitle(kind),
      shopName: trimmedShopName,
      remoteUrl,
      platform: platformSnapshot,
      generationLine: recordedLine,
      productName: productNameForHistory,
      previewUrl,
      createdAt: new Date().toISOString(),
    };

    if (!isSupabaseConfigured) {
      setHistoryEntries((prev) => appendHistoryEntry(prev, localEntry));
      setHistoryTotalCount((count) => count + 1);
      return;
    }

    if (item.historyRecorded && !item.historyError) {
      setTodayCount((n) => n + 1);
      setTotalCount((n) => n + 1);
      setGlobalTotalCount((n) => n + 1);
      setHistoryTotalCount((count) => count + 1);
      setHistoryEntries((prev) => appendHistoryEntry(prev, localEntry));
      if (tab === "history") void refreshCloudHistoryPage(historyPage);
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
      productName: productNameForHistory,
    }).then(async (recorded) => {
      if (!recorded) {
        onToast("云端生图记录写入失败，请刷新历史记录或联系管理员检查数据库配置", "error");
        return;
      }
      setTodayCount((n) => n + 1);
      setTotalCount((n) => n + 1);
      setGlobalTotalCount((n) => n + 1);
      setHistoryTotalCount((count) => count + 1);
      if (tab === "history") await refreshCloudHistoryPage(historyPage);
    });
  }

  return recordHistory;
}

function normalizeRecordableGenerationLine(line: GenerationItem["generationLine"]): GenerationLine | null {
  if (line === "line2" || line === "line3" || line === "line4" || line === "line5" || line === "line6" || line === "line7") {
    return line;
  }
  return null;
}
