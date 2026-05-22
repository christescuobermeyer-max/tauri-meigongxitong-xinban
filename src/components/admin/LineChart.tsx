import { useId, useMemo, useRef, useState } from "react";

export interface LineChartSeries {
  /** 折线名称，用于图例 */
  name: string;
  /** 颜色 hex */
  color: string;
  /** 数据点，长度必须与 labels 对齐；缺值用 null */
  values: Array<number | null>;
}

interface LineChartProps {
  /** X 轴标签（按顺序对齐每个 series.values） */
  labels: string[];
  /** 一条或多条折线 */
  series: LineChartSeries[];
  /** SVG 视口高度（不含图例），默认 240 */
  height?: number;
  /** 上方标题（可选） */
  title?: string;
  /** 是否在 y 轴标签后加单位（如"张"） */
  yUnit?: string;
}

const PADDING_LEFT = 48;
const PADDING_RIGHT = 18;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 32;

export default function LineChart({
  labels,
  series,
  height = 240,
  title,
  yUnit = "",
}: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    index: number;
    /** 数据点在 SVG viewBox 内的 cx 坐标（用于画竖线） */
    cx: number;
    /** tooltip 在容器内的实际像素坐标（跟随鼠标） */
    tipX: number;
    tipY: number;
  } | null>(null);
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

        {/* hover tooltip 跟随鼠标 */}
        {hover && (
          <div
            className="chart__tooltip"
            style={{
              left: clampTooltipX(hover.tipX, wrapRef.current?.clientWidth ?? 800),
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
        )}
      </div>

      {series.length >= 2 && (
        <div className="chart__legend">
          {series.map((s) => (
            <span key={s.name} className="chart__legend-item">
              <span className="chart__legend-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 用 Catmull-Rom → 三次贝塞尔，把数据点画成平滑曲线。
 * tension=0.2 视觉柔和但不至于产生过大弯曲。
 */
function buildSmoothPath(
  pts: Array<{ cx: number; cy: number }>,
  tension = 0.2
): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].cx},${pts[0].cy}`;
  if (pts.length === 2) {
    return `M${pts[0].cx},${pts[0].cy} L${pts[1].cx},${pts[1].cy}`;
  }
  let d = `M${pts[0].cx.toFixed(2)},${pts[0].cy.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.cx + (p2.cx - p0.cx) * tension;
    const cp1y = p1.cy + (p2.cy - p0.cy) * tension;
    const cp2x = p2.cx - (p3.cx - p1.cx) * tension;
    const cp2y = p2.cy - (p3.cy - p1.cy) * tension;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.cx.toFixed(2)},${p2.cy.toFixed(2)}`;
  }
  return d;
}

/** tooltip 横向边界控制：让它在鼠标右上方出现，靠近右边时反转到左侧 */
function clampTooltipX(mouseX: number, containerWidth: number): number {
  const TIP_WIDTH = 180;
  const MARGIN = 12;
  const desired = mouseX + 12;
  if (desired + TIP_WIDTH + MARGIN > containerWidth) {
    return Math.max(MARGIN, mouseX - TIP_WIDTH - 12);
  }
  return desired;
}

/** 让 y 轴最大值向上取一个"好看"的整数，避免出现 7.3、19.1 这种刻度 */
function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 20) return 20;
  if (value <= 50) return 50;
  if (value <= 100) return 100;
  if (value <= 200) return 200;
  if (value <= 500) return 500;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / magnitude) * magnitude;
}
