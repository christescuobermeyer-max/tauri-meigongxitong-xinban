export const PADDING_LEFT = 48;
export const PADDING_RIGHT = 18;
export const PADDING_TOP = 20;
export const PADDING_BOTTOM = 32;

/**
 * 用 Catmull-Rom → 三次贝塞尔，把数据点画成平滑曲线。
 * tension=0.2 视觉柔和但不至于产生过大弯曲。
 */
export function buildSmoothPath(
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
export function clampTooltipX(mouseX: number, containerWidth: number): number {
  const TIP_WIDTH = 180;
  const MARGIN = 12;
  const desired = mouseX + 12;
  if (desired + TIP_WIDTH + MARGIN > containerWidth) {
    return Math.max(MARGIN, mouseX - TIP_WIDTH - 12);
  }
  return desired;
}

/** 让 y 轴最大值向上取一个"好看"的整数，避免出现 7.3、19.1 这种刻度 */
export function niceCeiling(value: number): number {
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
