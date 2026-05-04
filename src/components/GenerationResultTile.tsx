import type { GenerationItem } from "../types";
import { IconAlert, IconDownload, IconImage, IconRefresh } from "./Icons";
import GenerationStatusBadge from "./GenerationStatusBadge";

interface Props {
  title: string;
  sub: string;
  item: GenerationItem;
  exportSize: string;
  idleMessage: string;
  compact?: boolean;
  onRetry: () => void;
  onDownload: () => void;
}

export default function GenerationResultTile({
  title,
  sub,
  item,
  exportSize,
  idleMessage,
  compact = false,
  onRetry,
  onDownload,
}: Props) {
  const busy = item.status === "running" || item.status === "queued";
  const busyTitle = item.status === "queued" ? "等待生成中…" : "正在生成中…";
  const busyHint =
    item.status === "queued"
      ? compact
        ? "前序图片完成后会自动开始"
        : "前面的图片生成完成后会自动开始"
      : compact
        ? "通常需要1-5分钟"
        : "系统单次最长可能需要1-5分钟，请耐心等待";

  return (
    <div
      className="result"
      data-status={item.status}
      data-layout={compact ? "compact" : "default"}
    >
      <div className="result__head">
        <div className="result__title">
          <span className="result__title-text">{title}</span>
          <span className="result__sub">{sub}</span>
        </div>
        <div className="result__actions">
          <GenerationStatusBadge status={item.status} elapsedMs={item.elapsedMs} />
          <button
            className="btn btn--ghost btn--sm"
            onClick={onRetry}
            disabled={busy}
            title="重新生成"
          >
            <IconRefresh style={{ width: 13, height: 13 }} />
            重试
          </button>
          <button
            className="btn btn--secondary btn--sm"
            onClick={onDownload}
            disabled={item.status !== "succeeded"}
            title={`下载 (${exportSize})`}
          >
            <IconDownload style={{ width: 13, height: 13 }} />
            下载
          </button>
        </div>
      </div>
      <div className="result__body">
        <div className="result__preview" data-busy={busy}>
          {item.rawDataUrl ? (
            <img src={item.rawDataUrl} alt={title} />
          ) : item.status === "failed" ? (
            <div className="result__placeholder result__placeholder--error">
              <IconAlert style={{ width: 18, height: 18 }} />
              <strong>{item.errorMessage || "生成失败"}</strong>
              <span style={{ color: "var(--fg-subtle)" }}>
                可点击右上角「重试」再次生成
              </span>
            </div>
          ) : busy ? (
            <div className="result__placeholder">
              <div className="spinner spinner--lg" />
              <strong>{busyTitle}</strong>
              <span>{busyHint}</span>
            </div>
          ) : (
            <div className="result__placeholder">
              <IconImage style={{ width: 22, height: 22, color: "var(--fg-faint)" }} />
              <span>{idleMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
