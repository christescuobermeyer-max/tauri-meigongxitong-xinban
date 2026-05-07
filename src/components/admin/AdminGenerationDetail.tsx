import { useEffect, useState } from "react";
import {
  ASSET_LABEL,
  filterGenerationLogs,
  type AssetKindLabel,
} from "../../lib/admin-log-filters";
import type { AccountSummary } from "../../lib/admin";
import type { DailyStatRow, GenerationLogRow } from "../../lib/supabase";

interface Props {
  selected: AccountSummary | null;
  logs: GenerationLogRow[];
  dailyStats: DailyStatRow[];
  filter: AssetKindLabel;
  selectedDate: string | null;
  onFilterChange: (filter: AssetKindLabel) => void;
  onDateChange: (date: string | null) => void;
}

const FILTERS: AssetKindLabel[] = ["全部", "头像", "店招", "海报", "产品图", "P门头", "图片墙", "详情页"];
const PAGE_SIZE = 30;

export default function AdminGenerationDetail({
  selected,
  logs,
  dailyStats,
  filter,
  selectedDate,
  onFilterChange,
  onDateChange,
}: Props) {
  const [page, setPage] = useState(1);

  const filteredLogs = filterGenerationLogs(logs, { assetLabel: filter, statDay: selectedDate });
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageLogs = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filter, selectedDate, selected?.id]);

  const selectedDayStat = selectedDate
    ? dailyStats.find((d) => d.stat_day === selectedDate)
    : null;

  const todayStr = toShanghaiDateString(new Date());
  const maxDate = todayStr;

  let minDate = todayStr;
  if (dailyStats.length > 0) {
    const sorted = [...dailyStats].sort((a, b) => a.stat_day.localeCompare(b.stat_day));
    const earliest = sorted[0].stat_day;
    minDate = earliest < todayStr ? earliest : todayStr;
  }

  return (
    <section className="card admin__detail">
      <div className="card__header">
        <div className="card__title">
          {selected ? `${selected.display_name} · 生图明细` : "生图明细"}
        </div>
        <div className="admin__filters">
          {FILTERS.map((label) => (
            <button
              key={label}
              className="btn btn--ghost btn--sm"
              data-active={filter === label}
              onClick={() => onFilterChange(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="card__body">
        {!selected ? (
          <div className="empty">从左侧选择一个账号查看其生图记录</div>
        ) : (
          <>
            <div className="admin__date-filter">
              <div className="admin__date-field">
                <label className="admin__date-label" htmlFor="admin-date-picker">
                  筛选日期
                </label>
                <div className="admin__date-row">
                  <input
                    id="admin-date-picker"
                    className="admin__date-input"
                    type="date"
                    value={selectedDate ?? ""}
                    min={minDate}
                    max={maxDate}
                    onChange={(e) => onDateChange(e.target.value || null)}
                  />
                  {selectedDate && (
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => onDateChange(null)}
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>
              {selectedDate && selectedDayStat ? (
                <div className="admin__date-summary">
                  <span className="admin__date-summary-day">{formatDateLabel(selectedDate)}</span>
                  <span className="admin__date-summary-count">
                    共 <strong>{selectedDayStat.total_count}</strong> 张
                  </span>
                  <span className="admin__date-summary-breakdown">
                    {selectedDayStat.avatar_count}头 ·{" "}
                    {selectedDayStat.storefront_count}招 ·{" "}
                    {selectedDayStat.poster_count}报 ·{" "}
                    {selectedDayStat.product_count}产 ·{" "}
                    {selectedDayStat.p_signboard_count}门 ·{" "}
                    {selectedDayStat.picture_wall_count}墙 ·{" "}
                    {selectedDayStat.detail_page_count}详
                  </span>
                </div>
              ) : selectedDate ? (
                <div className="admin__date-summary admin__date-summary--empty">
                  <span className="admin__date-summary-day">{formatDateLabel(selectedDate)}</span>
                  <span className="admin__date-summary-count">当天无生图记录</span>
                </div>
              ) : (
                <div className="admin__date-summary">
                  <span className="admin__date-summary-day">全部日期</span>
                  <span className="admin__date-summary-count">
                    共 <strong>{dailyStats.reduce((sum, d) => sum + d.total_count, 0)}</strong> 张
                  </span>
                  <span className="admin__date-summary-breakdown">
                    最近 {dailyStats.length} 天
                  </span>
                </div>
              )}
            </div>
            <LogList logs={pageLogs} />
            {filteredLogs.length > PAGE_SIZE && (
              <Pagination
                page={safePage}
                totalPages={totalPages}
                total={filteredLogs.length}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function LogList({ logs }: { logs: GenerationLogRow[] }) {
  if (logs.length === 0) return <div className="empty empty--inline">该筛选条件下无生图记录</div>;
  return (
    <div className="admin__logs">
      {logs.map((log) => (
        <article key={log.id} className="admin__log">
          <div className="admin__log-thumb admin__log-thumb--contain">
            <img
              className="admin__log-thumb-image admin__log-thumb-image--contain"
              src={log.oss_url}
              alt={log.shop_name}
              loading="lazy"
            />
          </div>
          <div className="admin__log-meta">
            <div className="admin__log-head">
              <span className="badge" data-tone="info">{ASSET_LABEL[log.asset_kind] ?? log.asset_kind}</span>
              <span className="badge">{log.platform === "meituan" ? "美团" : "淘宝闪购"}</span>
              <span
                className="badge"
                data-tone={
                  log.generation_line === "line2"
                    ? "success"
                    : log.generation_line === "line3"
                      ? "info"
                      : log.generation_line === "line4"
                        ? "warning"
                        : log.generation_line === "line5"
                          ? "info"
                          : "success"
                }
              >
                {getGenerationLineLabel(log.asset_kind, log.generation_line)}
              </span>
              <span className="admin__log-time">{formatDateTime(log.created_at)}</span>
            </div>
            <div className="admin__log-shop">{log.shop_name}</div>
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
        <button
          className="btn btn--ghost btn--sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹ 上一页
        </button>
        <button
          className="btn btn--ghost btn--sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页 ›
        </button>
      </div>
    </div>
  );
}

function getGenerationLineLabel(
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

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso + "T00:00:00+08:00");
  if (Number.isNaN(date.getTime())) return iso;
  const week = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 周${week[date.getDay()]}`;
}

function toShanghaiDateString(date: Date): string {
  const shanghaiMs = date.getTime() + 8 * 60 * 60 * 1000;
  const d = new Date(shanghaiMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
