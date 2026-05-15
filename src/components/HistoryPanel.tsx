import { useEffect, useState } from "react";
import { downloadHistoryEntry } from "../lib/history-download";
import { copyImageUrlToClipboard } from "../lib/clipboard-image";
import type { HistoryEntry } from "../lib/history";
import {
  getHistoryPageCount,
  getHistoryPageCountFromTotal,
  getPagedHistoryEntries,
} from "../lib/history-pagination";
import type { AssetKind } from "../types";
import { IconCopy, IconDownload } from "./Icons";
import { useToast } from "./Toast";

interface Props {
  entries: HistoryEntry[];
  totalCount?: number;
  page?: number;
  loading?: boolean;
  onPageChange?: (page: number) => void;
}

export default function HistoryPanel({
  entries,
  totalCount,
  page: controlledPage,
  loading = false,
  onPageChange,
}: Props) {
  const toast = useToast();
  const [localPage, setLocalPage] = useState(1);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());
  const [copyingIds, setCopyingIds] = useState<Set<string>>(() => new Set());
  const isControlled = typeof controlledPage === "number" && typeof onPageChange === "function";
  const page = isControlled ? controlledPage : localPage;
  const total = (totalCount != null && totalCount > 0) ? totalCount : entries.length;
  const pageCount = (totalCount != null && totalCount > 0) ? getHistoryPageCountFromTotal(totalCount) : getHistoryPageCount(entries);
  const pageEntries = isControlled ? entries : getPagedHistoryEntries(entries, page);

  useEffect(() => {
    if (isControlled) return;
    setLocalPage((current) => Math.min(current, pageCount));
  }, [isControlled, pageCount]);

  function setPage(nextPage: number) {
    const safePage = Math.min(Math.max(1, nextPage), pageCount);
    if (isControlled) {
      onPageChange?.(safePage);
      return;
    }
    setLocalPage(safePage);
  }

  useEffect(() => {
    if (!isControlled || page <= pageCount) return;
    onPageChange?.(pageCount);
  }, [isControlled, onPageChange, page, pageCount]);

  async function handleDownload(entry: HistoryEntry) {
    if (downloadingIds.has(entry.id)) return;
    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      return next;
    });
    try {
      const saved = await downloadHistoryEntry(entry);
      if (!saved || saved.length === 0) return;
      const message =
        saved.length === 1 ? `已保存至：${saved[0]}` : `已保存 ${saved.length} 个文件`;
      toast.show(message, "success");
    } catch (error: unknown) {
      toast.show(
        `下载失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  }

  async function handleCopy(entry: HistoryEntry) {
    if (copyingIds.has(entry.id)) return;
    setCopyingIds((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      return next;
    });
    try {
      await copyImageUrlToClipboard(entry.previewUrl || entry.remoteUrl);
      toast.show(`${entry.title}图片已复制到剪贴板`, "success");
    } catch (error: unknown) {
      toast.show(
        `复制失败：${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
    } finally {
      setCopyingIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  }

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">历史记录</div>
        <span className="card__hint">展示近 7 天内全部已归档到 OSS 的历史记录</span>
      </div>

      <div className="card__body">
        {loading ? (
          <div className="empty">正在读取云端历史记录…</div>
        ) : total === 0 ? (
          <div className="empty">暂无历史图片</div>
        ) : (
          <>
            <div className="history-pagination">
              <span>共 {total} 张</span>
              <div className="history-pagination__actions">
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </button>
                <span>第 {page} / {pageCount} 页</span>
                <button
                  className="btn btn--ghost btn--sm"
                  disabled
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </button>
              </div>
            </div>
            <div className="history-grid history-grid--compact history-grid--five-columns">
              {pageEntries.map((entry) => {
                const isDownloading = downloadingIds.has(entry.id);
                const isCopying = copyingIds.has(entry.id);
                return (
                  <article key={entry.id} className="history-card history-card--compact">
                    <div className="history-card__preview history-card__preview--contain">
                      <img
                        className="history-card__image history-card__image--contain"
                        src={entry.previewUrl || entry.remoteUrl}
                        alt={`${entry.shopName}-${entry.title}`}
                      />
                    </div>
                    <div className="history-card__meta">
                      <div className="history-card__head">
                        <strong>{entry.title}</strong>
                        <span>{formatCreatedAt(entry.createdAt)}</span>
                      </div>
                      <div className="history-card__line">
                        {getGenerationLineLabel(entry.kind, entry.generationLine)}
                      </div>
                      <div className="history-card__shop">{entry.shopName}</div>
                      <button
                        className="btn btn--ghost btn--sm history-card__download"
                        type="button"
                        disabled={isCopying}
                        onClick={() => handleCopy(entry)}
                      >
                        <IconCopy style={{ width: 13, height: 13 }} />
                        {isCopying ? "复制中…" : "复制"}
                      </button>
                      <button
                        className="btn btn--secondary btn--sm history-card__download"
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownload(entry)}
                      >
                        <IconDownload style={{ width: 13, height: 13 }} />
                        {isDownloading ? "下载中…" : "下载"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getGenerationLineLabel(kind: AssetKind, line?: "line1" | "line2" | "line3" | "line4" | "line5" | null) {
  if (line === "line1") return "线路1";
  if (line === "line2") return "线路2";
  if (line === "line3") return "线路3";
  if (line === "line4") return "线路4";
  if (line === "line5") return "线路5";
  return kind === "picture_wall" ? "专用接口" : "线路1";
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}
