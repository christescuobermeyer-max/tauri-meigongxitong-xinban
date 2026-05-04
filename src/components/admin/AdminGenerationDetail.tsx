import {
  ASSET_LABEL,
  type AssetKindLabel,
  filterGenerationLogs,
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

const FILTERS: AssetKindLabel[] = ["全部", "头像", "店招", "海报", "产品图", "P门头", "图片墙"];

export default function AdminGenerationDetail({
  selected,
  logs,
  dailyStats,
  filter,
  selectedDate,
  onFilterChange,
  onDateChange,
}: Props) {
  const filteredLogs = filterGenerationLogs(logs, { assetLabel: filter, statDay: selectedDate });

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
            <DateSelector
              dailyStats={dailyStats}
              selectedDate={selectedDate}
              onDateChange={onDateChange}
            />
            <LogList logs={filteredLogs} />
          </>
        )}
      </div>
    </section>
  );
}

function DateSelector({
  dailyStats,
  selectedDate,
  onDateChange,
}: {
  dailyStats: DailyStatRow[];
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
}) {
  return (
    <div className="admin__daily-strip">
      <button
        className="admin__daily-cell admin__daily-cell--button"
        data-active={selectedDate === null}
        onClick={() => onDateChange(null)}
      >
        <span className="admin__daily-day">全部日期</span>
        <strong>{dailyStats.reduce((sum, row) => sum + row.total_count, 0)}</strong>
        <span className="admin__daily-mix">最近 14 天</span>
      </button>
      {dailyStats.length === 0 ? (
        <div className="empty empty--inline">最近 14 天内无生图记录</div>
      ) : (
        dailyStats.map((day) => (
          <button
            key={day.stat_day}
            className="admin__daily-cell admin__daily-cell--button"
            data-active={selectedDate === day.stat_day}
            onClick={() => onDateChange(day.stat_day)}
          >
            <span className="admin__daily-day">{shortDay(day.stat_day)}</span>
            <strong>{day.total_count}</strong>
            <span className="admin__daily-mix">
              {day.avatar_count}头/{day.storefront_count}招/{day.poster_count}报/{day.product_count}产/{day.p_signboard_count}门/{day.picture_wall_count}墙
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function LogList({ logs }: { logs: GenerationLogRow[] }) {
  if (logs.length === 0) return <div className="empty empty--inline">无生图记录</div>;
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
              <span className="badge" data-tone={log.generation_line === "line2" ? "warning" : "success"}>
                {getGenerationLineLabel(log.asset_kind, log.generation_line)}
              </span>
              <span className="admin__log-time">{formatDate(log.created_at)}</span>
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

function getGenerationLineLabel(
  kind: GenerationLogRow["asset_kind"],
  line: GenerationLogRow["generation_line"]
) {
  if (line === "line1") return "线路1";
  if (line === "line2") return "线路2";
  return kind === "picture_wall" ? "专用接口" : "线路1";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function shortDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
