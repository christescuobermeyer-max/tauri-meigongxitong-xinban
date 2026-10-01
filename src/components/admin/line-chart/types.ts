export interface LineChartSeries {
  /** 折线名称，用于图例 */
  name: string;
  /** 颜色 hex */
  color: string;
  /** 数据点，长度必须与 labels 对齐；缺值用 null */
  values: Array<number | null>;
}

export interface LineChartProps {
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

export interface ChartHover {
    index: number;
    /** 数据点在 SVG viewBox 内的 cx 坐标（用于画竖线） */
    cx: number;
    /** tooltip 在容器内的实际像素坐标（跟随鼠标） */
    tipX: number;
    tipY: number;
}
