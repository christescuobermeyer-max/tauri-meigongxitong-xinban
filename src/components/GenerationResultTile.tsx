import { useState } from "react";
import type { GenerationItem } from "../types";
import { getGenerationPreviewUrl } from "../lib/generation-preview";
import { IconAlert, IconDownload, IconImage, IconRefresh } from "./Icons";
import GenerationStatusBadge from "./GenerationStatusBadge";
import RetryConfirmDialog from "./RetryConfirmDialog";

interface Props {
  title: string;
  sub: string;
  item: GenerationItem;
  exportSize: string;
  idleMessage: string;
  compact?: boolean;
  onRetry: () => void;
  onDownload: () => void;
  downloadOptions?: Array<{
    label: string;
    meta: string;
    title?: string;
    onClick: () => void;
  }>;
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
  downloadOptions = [],
}: Props) {
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const busy = item.status === "running" || item.status === "queued";
  const canDownload = item.status === "succeeded";
  const hasDownloadOptions = downloadOptions.length > 0;
  const previewUrl = getGenerationPreviewUrl(item);
  const isAutoRetrying = item.status === "running" && item.attempt === 2;
  const busyTitle = item.status === "queued"
    ? "等待生成中…"
    : isAutoRetrying
      ? "第一次失败，正在第二次重试…"
      : "正在生成中…";
  const busyHint =
    item.status === "queued"
      ? compact
        ? "前序图片完成后会自动开始"
        : "前面的图片生成完成后会自动开始"
      : isAutoRetrying
        ? "系统已自动重试一次，请继续等待本次结果"
      : compact
        ? "通常需要1-5分钟"
        : "系统单次最长可能需要1-5分钟，请耐心等待";

  function handleConfirmRetry() {
    setRetryConfirmOpen(false);
    onRetry();
  }

  function handleDownloadClick() {
    if (hasDownloadOptions) {
      setDownloadMenuOpen((open) => !open);
      return;
    }
    onDownload();
  }

  function handleOptionClick(action: () => void) {
    setDownloadMenuOpen(false);
    action();
  }

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
          <GenerationStatusBadge status={item.status} elapsedMs={item.elapsedMs} attempt={item.attempt} />
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setRetryConfirmOpen(true)}
            disabled={busy}
            title="重新生成"
            type="button"
          >
            <IconRefresh style={{ width: 13, height: 13 }} />
            重试
          </button>
          <div className="result-download-menu" data-open={downloadMenuOpen}>
            <button
              className="btn btn--secondary btn--sm"
              onClick={handleDownloadClick}
              disabled={!canDownload}
              title={`下载 (${exportSize})`}
              type="button"
              aria-haspopup={hasDownloadOptions ? "menu" : undefined}
              aria-expanded={hasDownloadOptions ? downloadMenuOpen : undefined}
            >
              <IconDownload style={{ width: 13, height: 13 }} />
              下载
            </button>
            {hasDownloadOptions && downloadMenuOpen ? (
              <div className="result-download-menu__panel" role="menu" aria-label={`${title}下载尺寸`}>
                {downloadOptions.map((option) => (
                  <button
                    key={option.label}
                    className="result-download-menu__item"
                    type="button"
                    role="menuitem"
                    title={option.title}
                    onClick={() => handleOptionClick(option.onClick)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.meta}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="result__body">
        <div className="result__preview" data-busy={busy}>
          {previewUrl ? (
            <img src={previewUrl} alt={title} />
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
      <RetryConfirmDialog
        open={retryConfirmOpen}
        title={`重新生成「${title}」`}
        onCancel={() => setRetryConfirmOpen(false)}
        onConfirm={handleConfirmRetry}
      />
    </div>
  );
}
