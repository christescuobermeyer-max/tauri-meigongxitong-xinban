import { DATA_ANALYSIS_EXPORT_SIZE, TRAFFIC_FIELDS, formatTrafficRate, parseTrafficCount, type TrafficMetrics } from "./data-analysis";

export function renderDataAnalysisImage(storeName: string, metrics: TrafficMetrics) {
  const canvas = document.createElement("canvas");
  const { w, h } = DATA_ANALYSIS_EXPORT_SIZE;
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建分析图画布");
  const ctx = context;

  const rows = TRAFFIC_FIELDS.map((field) => ({ ...field, count: parseTrafficCount(metrics[field.key]) }));
  if (!rows.some((row) => row.count !== null)) throw new Error("请至少确认一项有效人数");
  const [exposure, visits, orders] = rows.map((row) => row.count);
  const max = Math.max(1, ...rows.map((row) => row.count ?? 0));
  const font = '"Microsoft YaHei", "PingFang SC", sans-serif';
  function text(value: string, x: number, y: number, size: number, color: string, weight = 500, maxWidth?: number) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, maxWidth);
  }
  function card(x: number, y: number, width: number, height: number, color = "#ffffff") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 24);
    ctx.fill();
  }

  ctx.fillStyle = "#EDF3FB";
  ctx.fillRect(0, 0, w, h);
  card(64, 56, 1408, 204, "#122848");
  text("30天流量数据分析", 112, 133, 52, "#ffffff", 700);
  text(storeName.trim(), 112, 207, 36, "#D5E5FF", 600, 1308);

  rows.forEach(({ label, color, count }, index) => {
    const x = 64 + 480 * index;
    card(x, 286, 448, 160);
    text(label, x + 32, 339, 28, color, 700);
    text(count === null ? "—" : `${count.toLocaleString("zh-CN")} 人`, x + 32, 409, 52, "#122848", 700, 384);
  });

  card(64, 476, 920, 446);
  text("流量阶段对比", 110, 546, 36, "#122848", 700);
  rows.forEach(({ label, color, count }, index) => {
    const y = 610 + 104 * index;
    text(label, 110, y, 26, "#314967", 600);
    card(110, y + 21, 794, 20, "#E7EEF8");
    if (count !== null && count > 0) card(110, y + 21, Math.max(3, 794 * count / max), 20, color);
  });

  card(1012, 476, 460, 446);
  text("阶段转化", 1056, 546, 36, "#122848", 700);
  text("进店人数 ÷ 曝光人数", 1056, 614, 25, "#314967");
  text(formatTrafficRate(visits, exposure), 1056, 686, 58, "#245DCC", 700);
  text("下单人数 ÷ 进店人数", 1056, 769, 25, "#314967");
  text(formatTrafficRate(orders, visits), 1056, 841, 58, "#158071", 700);
  text("数据来源：店铺截图核对值     ·     “—”表示缺少数据或无法计算", 66, 979, 24, "#314967");

  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, base64: dataUrl.slice("data:image/png;base64,".length) };
}
