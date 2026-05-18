import { useState } from "react";
import {
  ASSET_LABEL,
} from "../../lib/admin-log-filters";
import type { GenerationLogRow } from "../../lib/supabase";

const PAGE_SIZE = 30;

interface Props {
  logs: GenerationLogRow[];
  page: number;
  totalPages: number;
  total: number;
  showAccountName: boolean;
  accountNameById: Record<string, string>;
  onPageChange: (page: number) => void;
}

export default function AdminGenerationLogList({
  logs,
  page,
  totalPages,
  total,
  showAccountName,
  accountNameById,
  onPageChange,
}: Props) {
  return (
    <>
      <LogList
        logs={logs}
        showAccountName={showAccountName}
        accountNameById={accountNameById}
      />
      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}

export function getAdminGenerationPageSize() {
  return PAGE_SIZE;
}

function LogList({
  logs,
  showAccountName,
  accountNameById,
}: {
  logs: GenerationLogRow[];
  showAccountName: boolean;
  accountNameById: Record<string, string>;
}) {
  const [preview, setPreview] = useState<{ url: string; x: number; y: number } | null>(null);

  if (logs.length === 0) return <div className="empty empty--inline">该筛选条件下无生图记录</div>;
  return (
    <div className="admin__logs">
      {preview && (
        <img
          className="admin__log-thumb-preview"
          src={preview.url}
          alt=""
          style={{ left: preview.x, top: preview.y }}
        />
      )}
      {logs.map((log) => (
        <article key={log.id} className="admin__log">
          <div
            className="admin__log-thumb admin__log-thumb--contain"
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPreview({ url: log.oss_url, x: r.right + 8, y: r.top + r.height / 2 });
            }}
            onMouseMove={(e) => {
              setPreview((p) => p ? { ...p, x: e.clientX + 16, y: e.clientY } : p);
            }}
            onMouseLeave={() => setPreview(null)}
          >
            <img
              className="admin__log-thumb-image admin__log-thumb-image--contain"
              src={log.oss_url}
              alt={log.shop_name}
              loading="lazy"
            />
          </div>
          <div className="admin__log-meta">
            <div className="admin__log-head">
              {showAccountName ? (
                <span className="badge" title={log.user_id}>
                  {accountNameById[log.user_id] ?? "未知账号"}
                </span>
              ) : null}
              <span className="badge" data-tone="info">{ASSET_LABEL[log.asset_kind] ?? log.asset_kind}</span>
              <span className="badge">{log.platform === "meituan" ? "美团" : "淘宝闪购"}</span>
              <span className="badge" data-tone={getGenerationLineTone(log.generation_line)}>
                {getGenerationLineLabel(log.asset_kind, log.generation_line)}
              </span>
            </div>
            <div className="admin__log-shop">{log.shop_name}</div>
            <div className="admin__log-finished">
              <span className="admin__log-finished-label">完成时间</span>
              <span className="admin__log-finished-value">{formatFullDateTime(log.created_at)}</span>
            </div>
            <a className="admin__log-url" href={log.oss_url} target="_blank" rel="noreferrer">
              {log.oss_url}
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="admin__pagination">
      <span className="admin__pagination-info">
        共 {total} 条 · 第 {page} / {totalPages} 页
      </span>
      <div className="admin__pagination-actions">
        <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹ 上一页
        </button>
        <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          下一页 ›
        </button>
      </div>
    </div>
  );
}

function getGenerationLineTone(line: GenerationLogRow["generation_line"]) {
  if (line === "line2") return "success";
  if (line === "line3") return "info";
  if (line === "line4") return "warning";
  if (line === "line5") return "info";
  return "success";
}

export function getGenerationLineLabel(
  kind: GenerationLogRow["asset_kind"],
  line: GenerationLogRow["generation_line"]
) {
  if (line === "line1") return "线路1";
  if (line === "line2") return "线路2";
  if (line === "line3") return "线路3";
  if (line === "line4") return "线路4";
  if (line === "line5") return "线路5";
  return kind === "picture_wall" ? "专用接口" : "线路1";
}

function formatFullDateTime(iso: string): string {
  if (!iso) return "未知";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}
