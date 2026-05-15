import useLineHealth from "../hooks/useLineHealth";
import {
  formatLastSeen,
  formatLatency,
  type LineHealthEntry,
  type LineHealthStatus,
} from "../lib/line-health";
import type { GenerationLine } from "../types";

const LINE_META: Array<{ id: GenerationLine; label: string; engine: string }> = [
  { id: "line1", label: "线路1", engine: "yunwu" },
  { id: "line2", label: "线路2", engine: "yunwu" },
  { id: "line3", label: "线路3", engine: "vectorengine" },
  { id: "line4", label: "线路4", engine: "pockgo" },
  { id: "line5", label: "线路5", engine: "APIMart" },
];

const STATUS_LABEL: Record<LineHealthStatus, string> = {
  green: "正常",
  yellow: "偏慢",
  red: "异常",
  unknown: "暂无数据",
};

export default function LineHealthBar() {
  const { enabled, loading, lines, lastError } = useLineHealth();
  if (!enabled) return null;

  return (
    <section
      className="line-health-bar"
      aria-label="生图线路实时状态（每 60 秒刷新）"
    >
      <header className="line-health-bar__header">
        <span className="line-health-bar__title">线路状态</span>
        <span className="line-health-bar__hint">
          {loading
            ? "正在拉取最新样本…"
            : lastError
              ? `读取失败：${lastError}`
              : "每 60 秒自动刷新 · 基于真实生图请求耗时"}
        </span>
      </header>
      <div className="line-health-bar__grid">
        {LINE_META.map((line) => (
          <LineHealthChip key={line.id} meta={line} entry={lines[line.id]} />
        ))}
      </div>
    </section>
  );
}

interface ChipProps {
  meta: { id: GenerationLine; label: string; engine: string };
  entry: LineHealthEntry;
}

function LineHealthChip({ meta, entry }: ChipProps) {
  const tone: LineHealthStatus = entry.status;
  const latencyText =
    entry.status === "unknown"
      ? "暂无数据"
      : entry.last_success === false && entry.sample_count === 1
        ? "失败"
        : formatLatency(entry.latency_ms);
  const lastSeen = formatLastSeen(entry.last_at);

  return (
    <div className="line-health-chip" data-tone={tone}>
      <div className="line-health-chip__row line-health-chip__row--head">
        <span className="line-health-chip__dot" />
        <span className="line-health-chip__label">{meta.label}</span>
        <span className="line-health-chip__engine">{meta.engine}</span>
      </div>
      <div className="line-health-chip__row line-health-chip__row--body">
        <span className="line-health-chip__latency">{latencyText}</span>
        <span className="line-health-chip__status">{STATUS_LABEL[tone]}</span>
      </div>
      <div className="line-health-chip__row line-health-chip__row--foot">
        <span className="line-health-chip__last-at">{lastSeen}</span>
        {entry.sample_count > 0 && (
          <span className="line-health-chip__samples">
            最近 {entry.sample_count} 次{entry.failure_count > 0 ? ` · 失败 ${entry.failure_count}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
