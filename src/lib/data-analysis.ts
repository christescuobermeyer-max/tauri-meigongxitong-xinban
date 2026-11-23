export const DATA_ANALYSIS_EXPORT_SIZE = { w: 1536, h: 1024 } as const;
export const DATA_ANALYSIS_ASSET_KIND = "data_analysis" as const;
export const DATA_ANALYSIS_PLATFORM = "meituan" as const;
export const DATA_ANALYSIS_COPY_TEXT =
  "老板，这张图整理了店铺近30天的流量数据，可以一起看看曝光、进店和下单三个阶段的表现。图中的转化率按已核对的人数计算，缺少数据的地方用横线标注。";

export const TRAFFIC_FIELDS = [
  { key: "exposure", label: "曝光人数", color: "#245DCC" },
  { key: "visits", label: "进店人数", color: "#158071" },
  { key: "orders", label: "下单人数", color: "#B2551C" },
] as const;

export type TrafficMetrics = Record<(typeof TRAFFIC_FIELDS)[number]["key"], string>;
export const EMPTY_TRAFFIC_METRICS: TrafficMetrics = { exposure: "", visits: "", orders: "" };

export function parseTrafficCount(input: string): number | null {
  const value = input.normalize("NFKC").trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) return null;
  const count = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(count) ? count : null;
}

export function extractTrafficMetrics(text: string): TrafficMetrics {
  const lines = text.normalize("NFKC").split(/\r?\n/).map((line) => line.replace(/\s/g, ""));
  const source = lines.join("\n");
  const headings = [...source.matchAll(/曝光\s*人数|(?:进店|访问)\s*人数|(?:下单|成交)\s*人数/g)];
  const values = { exposure: new Set<number>(), visits: new Set<number>(), orders: new Set<number>() };
  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length;
    const segment = source.slice(start, headings[index + 1]?.index);
    // 只读取同一行或紧接的数值行，排除小数、万位缩写、次数及歧义值。
    const [sameLine, nextLine] = segment.split("\n");
    const row = /^[：:]*$/.test(sameLine) && /^\d/.test(nextLine ?? "") ? nextLine : sameLine;
    const key = heading[0].startsWith("曝光") ? "exposure" : /进店|访问/.test(heading[0]) ? "visits" : "orders";
    for (const match of row.matchAll(/(?<![\d.,+-])([\d,]+)\s*人(?!数)/g)) {
      const count = parseTrafficCount(match[1]);
      if (count !== null) values[key].add(count);
    }
  });
  const result = { ...EMPTY_TRAFFIC_METRICS };
  for (const { key } of TRAFFIC_FIELDS) {
    if (values[key].size === 1) result[key] = String([...values[key]][0]);
  }
  return result;
}

export function formatTrafficRate(value: number | null, base: number | null): string {
  return value === null || base === null || base === 0 || value > base
    ? "—" : `${(100 * value / base).toFixed(1)}%`;
}
