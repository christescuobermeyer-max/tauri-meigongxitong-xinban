import ChartLegend from "./line-chart/ChartLegend";
import { useId, useMemo, useRef, useState } from "react";
import { PADDING_LEFT, PADDING_RIGHT, PADDING_TOP, PADDING_BOTTOM, buildSmoothPath, niceCeiling } from "./line-chart/geometry";
import ChartTooltip from "./line-chart/ChartTooltip";
import type { ChartHover, LineChartProps } from "./line-chart/types";
export type { LineChartSeries } from "./line-chart/types";

export default function LineChart({
  labels,
  series,
  height = 240,
  title,
  yUnit = "",
}: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<ChartHover | null>(null);
  const gradientPrefix = useId().replace(/[^a-z0-9]/gi, "");

  const dimensions = useMemo(() => {
    const maxValue = Math.max(
      1,
      ...series.flatMap((s) => s.values.filter((v): v is number => v != null))
    );
    return { maxValue: niceCeiling(maxValue) };
  }, [series]);

  const labelCount = labels.length;
  if (labelCount === 0) {
    return (
      <div className="chart-empty">{title ? `${title}：` : ""}暂无数据</div>
    );
  }

  const VB_WIDTH = 1000;
  const innerW = VB_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const innerH = height - PADDING_TOP - PADDING_BOTTOM;
  const stepX = labelCount > 1 ? innerW / (labelCount - 1) : 0;
  const x = (i: number) => PADDING_LEFT + i * stepX;
  const y = (v: number) => PADDING_TOP + innerH - (v / dimensions.maxValue) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(dimensions.maxValue * r));
  const xLabelStep = Math.max(1, Math.ceil(labelCount / 8));

  return (
    <div className="chart" ref={wrapRef}>
      {title ? <div className="chart__title">{title}</div> : null}
      <div className="chart__canvas">
        <svg
          viewBox={`0 0 ${VB_WIDTH} ${height}`}
          className="chart__svg"
          preserveAspectRatio="none"
          onMouseMove={(e) => {
            if (labelCount === 0) return;
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            // 把鼠标的 client 坐标转换到 viewBox 内的 svg 坐标
            const ratio = VB_WIDTH / rect.width;
            const svgX = (e.clientX - rect.left) * ratio;
            // 找最近的数据点 index
            const rawIndex = Math.round((svgX - PADDING_LEFT) / Math.max(stepX, 1));
            const index = Math.max(0, Math.min(labelCount - 1, rawIndex));
            setHover({
              index,
              cx: x(index),
              tipX: e.clientX - rect.left,
              tipY: e.clientY - rect.top,
            });
          }}
          onMouseLeave={() => setHover(null)}
        >
          {/* 渐变定义（每条 series 一个填充渐变） */}
          <defs>
            {series.map((s, i) => {
              const id = `${gradientPrefix}-grad-${i}`;
              return (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={series.length === 1 ? 0.28 : 0.18} />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              );
            })}
          </defs>

          {/* 网格 + y 轴刻度 */}
          {yTicks.map((tick, idx) => {
            const yy = y(tick);
            return (
              <g key={idx}>
                <line
                  x1={PADDING_LEFT}
                  x2={VB_WIDTH - PADDING_RIGHT}
                  y1={yy}
                  y2={yy}
                  className="chart__grid"
                />
                <text
                  x={PADDING_LEFT - 8}
                  y={yy + 4}
                  textAnchor="end"
                  className="chart__y-label"
                >
                  {tick}{yUnit}
                </text>
              </g>
            );
          })}

          {/* x 轴底线 */}
          <line
            x1={PADDING_LEFT}
            x2={VB_WIDTH - PADDING_RIGHT}
            y1={PADDING_TOP + innerH}
            y2={PADDING_TOP + innerH}
            className="chart__axis"
          />

          {/* x 轴标签 */}
          {labels.map((label, i) => {
            if (i % xLabelStep !== 0 && i !== labelCount - 1) return null;
            return (
              <text
                key={i}
                x={x(i)}
                y={height - 10}
                textAnchor="middle"
                className="chart__x-label"
              >
                {label}
              </text>
            );
          })}

          {/* 每条 series：先画填充 area，再画平滑曲线，最后画点 */}
          {series.map((s, sIdx) => {
            const pts: Array<{ i: number; v: number; cx: number; cy: number }> = [];
            for (let i = 0; i < labelCount; i++) {
              const v = s.values[i];
              if (v == null) continue;
              pts.push({ i, v, cx: x(i), cy: y(v) });
            }
            if (pts.length === 0) return null;

            const linePath = buildSmoothPath(pts);
            const baseline = PADDING_TOP + innerH;
            const areaPath =
              linePath +
              ` L${pts[pts.length - 1].cx.toFixed(2)},${baseline}` +
              ` L${pts[0].cx.toFixed(2)},${baseline} Z`;
            const gradId = `${gradientPrefix}-grad-${sIdx}`;

            return (
              <g key={sIdx}>
                {/* 渐变填充 */}
                <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
                {/* 折线主体 */}
                <path
                  d={linePath}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="chart__line"
                />
                {/* 数据点（非 hover 状态：小圆点；hover 列的点：放大 + 描边光环） */}
                {pts.map((p) => {
                  const isHover = hover?.index === p.i;
                  return (
                    <g key={p.i}>
                      {isHover ? (
                        <circle
                          cx={p.cx}
                          cy={p.cy}
                          r="8"
                          fill={s.color}
                          opacity="0.18"
                        />
                      ) : null}
                      <circle
                        cx={p.cx}
                        cy={p.cy}
                        r={isHover ? 4.2 : 2.8}
                        fill="#fff"
                        stroke={s.color}
                        strokeWidth={isHover ? 2.2 : 1.6}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* hover 竖线 */}
          {hover ? (
            <line
              x1={hover.cx}
              x2={hover.cx}
              y1={PADDING_TOP}
              y2={PADDING_TOP + innerH}
              className="chart__hover-line"
            />
          ) : null}
        </svg>

        {hover ? <ChartTooltip hover={hover} labels={labels} series={series} yUnit={yUnit} containerWidth={wrapRef.current?.clientWidth ?? 800} /> : null}
      </div>

      <ChartLegend series={series} />
    </div>
  );
}
