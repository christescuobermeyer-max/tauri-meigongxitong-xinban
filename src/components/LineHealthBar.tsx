import useLineHealth from "../hooks/useLineHealth";
import {
  formatLastSeen,
  formatLatency,
  type LineHealthEntry,
  type LineHealthStatus,
} from "../lib/line-health";
import type { GenerationLine } from "../types";

const LINE_META: Array<{ id: GenerationLine; label: string }> = [
  { id: "line1", label: "线路1" },
  { id: "line2", label: "线路2" },
  { id: "line3", label: "线路3" },
  { id: "line4", label: "线路4" },
  { id: "line5", label: "线路5" },
  { id: "line6", label: "线路6" },
];

export default function LineHealthBar() {
  const { enabled, lines } = useLineHealth();
  if (!enabled) return null;

  return (
    <section className="line-health-bar" aria-label="生图线路实时状态">
      <div className="line-health-bar__title">线路状态</div>
      <ul className="line-health-list">
        {LINE_META.map((line) => (
          <LineHealthRow key={line.id} meta={line} entry={lines[line.id]} />
        ))}
      </ul>
    </section>
  );
}

interface RowProps {
  meta: { id: GenerationLine; label: string };
  entry: LineHealthEntry;
}

function LineHealthRow({ meta, entry }: RowProps) {
  const tone: LineHealthStatus = entry.status;
  const latencyText =
    tone === "unknown"
      ? "—"
      : entry.last_success === false && entry.sample_count === 1
        ? "超时"
        : formatLatency(entry.latency_ms);
  const lastSeen = tone === "unknown" ? null : formatLastSeen(entry.last_at);

  return (
    <li className="line-health-row" data-tone={tone} data-line={meta.id}>
      <span className="line-health-row__dot" aria-hidden="true" />
      <span className="line-health-row__label">{meta.label}</span>
      <span className="line-health-row__value">
        <span className="line-health-row__latency">{latencyText}</span>
        {lastSeen && <span className="line-health-row__last">{lastSeen}</span>}
      </span>
    </li>
  );
}
