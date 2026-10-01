import { clampTooltipX } from "./geometry";
import type { ChartHover, LineChartSeries } from "./types";

interface Props { hover: ChartHover; labels: string[]; series: LineChartSeries[]; yUnit: string; containerWidth: number; }
export default function ChartTooltip({ hover, labels, series, yUnit, containerWidth }: Props) {
  return (
          <div
            className="chart__tooltip"
            style={{
              left: clampTooltipX(hover.tipX, containerWidth),
              top: Math.max(8, hover.tipY - 12),
            }}
          >
            <div className="chart__tooltip-title">{labels[hover.index]}</div>
            {series
              .map((s) => ({ s, v: s.values[hover.index] }))
              .filter((row) => row.v != null && row.v !== 0)
              .sort((a, b) => (b.v as number) - (a.v as number))
              .map(({ s, v }) => (
                <div key={s.name} className="chart__tooltip-row">
                  <span className="chart__tooltip-dot" style={{ background: s.color }} />
                  <span className="chart__tooltip-name">{s.name}</span>
                  <span className="chart__tooltip-value">{v}{yUnit}</span>
                </div>
              ))}
            {series.every((s) => {
              const v = s.values[hover.index];
              return v == null || v === 0;
            }) ? (
              <div className="chart__tooltip-row chart__tooltip-row--empty">
                <span className="chart__tooltip-name">当天无生图</span>
              </div>
            ) : null}
          </div>
  );
}
