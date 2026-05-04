import type { PictureWallEntry } from "../lib/picture-wall";
import type { PictureWallDownloadProgress } from "../lib/picture-wall-download";
import { IconAlert, IconCheck, IconDownload, IconImage, IconRefresh } from "./Icons";
import GenerationStatusBadge from "./GenerationStatusBadge";

interface Props {
  entries: PictureWallEntry[];
  shopName: string;
  completedCount: number;
  downloadStatus: (PictureWallDownloadProgress & { active: boolean }) | null;
  busy: boolean;
  onDownload: () => void;
  onRetry: (sourceImageId: string) => void;
}

export default function PictureWallResults({
  entries,
  shopName,
  completedCount,
  downloadStatus,
  busy,
  onDownload,
  onRetry,
}: Props) {
  const canDownload = completedCount > 0 && !busy && !downloadStatus?.active;
  return (
    <section className="card">
      <div className="card__header">
        <div className="card__heading">
          <div className="card__title">生成结果</div>
          <span className="card__hint">
            店铺 {shopName || "—"} · 已完成 {completedCount} / {entries.length || 3}
          </span>
        </div>
        <button className="btn btn--secondary btn--sm" disabled={!canDownload} onClick={onDownload}>
          <IconDownload style={{ width: 13, height: 13 }} />
          {downloadStatus?.active ? "下载中…" : `下载图片 (${completedCount})`}
        </button>
      </div>
      <div className="card__body">
        {downloadStatus ? (
          <div className="picture-wall-download-status" data-active={downloadStatus.active}>
            {downloadStatus.active ? <div className="spinner" /> : <IconCheck style={{ width: 16, height: 16 }} />}
            <div>
              <strong>{downloadStatus.active ? "正在下载图片" : "图片下载完成"}</strong>
              <span>
                {downloadStatus.message} · {downloadStatus.savedCount}/{downloadStatus.totalCount} 个文件
              </span>
            </div>
          </div>
        ) : null}
        {entries.length === 0 ? (
          <div className="picture-wall-empty">
            <IconImage style={{ width: 22, height: 22 }} />
            <strong>上传 3 张产品图后即可生成图片墙</strong>
            <span>生成后可批量下载高清原图 + 240×330 版本</span>
          </div>
        ) : (
          <div className="picture-wall-grid">
            {entries.map((entry, index) => (
              <PictureWallTile
                key={entry.sourceImageId}
                entry={entry}
                index={index}
                busy={busy}
                onRetry={onRetry}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PictureWallTile({
  entry,
  index,
  busy,
  onRetry,
}: {
  entry: PictureWallEntry;
  index: number;
  busy: boolean;
  onRetry: (sourceImageId: string) => void;
}) {
  const status = entry.item.status;
  const errorMessage = getPictureWallErrorMessage(entry.item.errorMessage);
  return (
    <article className="picture-wall-tile" data-status={status}>
      <div className="picture-wall-tile__head">
        <span className="picture-wall-tile__index">第 {index + 1} 张</span>
        <span className="picture-wall-tile__badge">
          <GenerationStatusBadge status={status} elapsedMs={entry.item.elapsedMs} />
        </span>
      </div>
      {status === "failed" ? (
        <div className="picture-wall-tile__meta picture-wall-tile__meta--failed">
          <div className="picture-wall-state picture-wall-state--error picture-wall-state--compact">
            <IconAlert style={{ width: 20, height: 20 }} />
            <strong>生成失败</strong>
            <span className="picture-wall-state__message" title={errorMessage.full}>
              {errorMessage.short}
            </span>
          </div>
          <button
            className="btn btn--secondary btn--sm picture-wall-tile__retry"
            disabled={busy}
            onClick={() => onRetry(entry.sourceImageId)}
            type="button"
          >
            <IconRefresh style={{ width: 13, height: 13 }} />
            重试
          </button>
        </div>
      ) : null}
      <div className="picture-wall-tile__preview" data-busy={busy && status === "running"}>
        {entry.item.rawDataUrl ? (
          <img src={entry.item.rawDataUrl} alt={`图片墙结果 ${index + 1}`} />
        ) : status === "failed" ? (
          <div className="picture-wall-state picture-wall-state--error">
            <IconAlert style={{ width: 20, height: 20 }} />
            <strong>生成失败</strong>
            <span className="picture-wall-state__message">点击上方重试重新生成</span>
          </div>
        ) : status === "running" ? (
          <div className="picture-wall-state">
            <div className="spinner spinner--lg" />
            <strong>正在生成第 {index + 1} 张…</strong>
            <span>请耐心等待</span>
          </div>
        ) : (
          <div className="picture-wall-state">
            {status === "succeeded" ? <IconCheck /> : <IconImage />}
            <strong>{status === "queued" ? "等待生成" : "未生成"}</strong>
            <span>{entry.sourceName}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function getPictureWallErrorMessage(message?: string) {
  const full = message?.trim() || "点击重试重新生成";
  const short = full.length > 90 ? `${full.slice(0, 90)}…` : full;
  return { full, short };
}
