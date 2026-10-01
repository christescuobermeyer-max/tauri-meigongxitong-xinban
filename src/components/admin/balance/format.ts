export function formatNumber(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

export function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 5_000) return "刚刚";
  if (delta < 60_000) return `${Math.floor(delta / 1000)} 秒前`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleString("zh-CN");
}
