import { useEffect, useState } from "react";
import type { HistoryEntry } from "../lib/history";
import type { AssetKind } from "../types";
import { getHistoryPageCount, getPagedHistoryEntries } from "../lib/history-pagination";

interface Props {
  entries: HistoryEntry[];
}

export default function HistoryPanel({ entries }: Props) {
  const [page, setPage] = useState(1);
  const pageCount = getHistoryPageCount(entries);
  const pageEntries = getPagedHistoryEntries(entries, page);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">历史记录</div>
        <span className="card__hint">展示近 7 天内全部已归档到 OSS 的历史记录</span>
      </div>

      <div className="card__body">
        {entries.length === 0 ? (
          <div className="empty">暂无历史图片</div>
        ) : (
          <>
            <div className="history-pagination">
              <span>共 {entries.length} 张</span>
              <div className="history-pagination__actions">
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </button>
                <span>第 {page} / {pageCount} 页</span>
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
            <div className="history-grid history-grid--compact">
              {pageEntries.map((entry) => (
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
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getGenerationLineLabel(kind: AssetKind, line?: "line1" | "line2" | null) {
  if (line === "line1") return "线路1";
  if (line === "line2") return "线路2";
  return kind === "picture_wall" ? "专用接口" : "线路1";
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}
