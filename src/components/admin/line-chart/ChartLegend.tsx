import type { LineChartSeries } from "./types";

export default function ChartLegend({ series }: { series: LineChartSeries[] }) {
  if (series.length < 2) return null;
  return (
        <div className="chart__legend">
          {series.map((s) => (
            <span key={s.name} className="chart__legend-item">
              <span className="chart__legend-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
  );
}
