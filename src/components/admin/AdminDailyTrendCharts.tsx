import { useEffect, useMemo, useState } from "react";
import { fetchAllDailyStatsRaw } from "../../lib/admin";
import type { AccountSummary } from "../../lib/admin";
import type { DailyStatRow } from "../../lib/supabase";
import LineChart, { type LineChartSeries } from "./LineChart";

interface Props {
  accounts: AccountSummary[];
  /** 拉取最近 N 天的趋势，默认 30 */
  days?: number;
}

// 给每个运营分配的固定色板（10 种，按出现顺序循环）
// 避开了主图的橙色（#f26122），相邻色之间保持足够色相距离
const PALETTE = [
  "#3b82f6", // 蓝
  "#10b981", // 绿
  "#a855f7", // 紫
  "#f59e0b", // 琥珀
  "#ef4444", // 红
  "#06b6d4", // 青
  "#ec4899", // 粉
  "#6366f1", // 靛
  "#84cc16", // 黄绿
  "#0ea5e9", // 天蓝
];

export default function AdminDailyTrendCharts({ accounts, days = 30 }: Props) {
  const [rows, setRows] = useState<DailyStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAllDailyStatsRaw(days)
      .then((next) => {
        if (cancelled) return;
        setRows(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const { labels, totalSeries, perUserSeries } = useMemo(() => {
    const accountNameById = new Map(accounts.map((a) => [a.id, a.display_name]));
    const dayList = buildShanghaiDayList(days);
    const totalsByDay = new Map<string, number>(dayList.map((d) => [d, 0]));
    // user_id → day → count
    const perUser = new Map<string, Map<string, number>>();
    for (const row of rows) {
      if (!totalsByDay.has(row.stat_day)) continue; // 超出 days 范围跳过
      totalsByDay.set(row.stat_day, (totalsByDay.get(row.stat_day) ?? 0) + row.total_count);
      let userMap = perUser.get(row.user_id);
      if (!userMap) {
        userMap = new Map();
        perUser.set(row.user_id, userMap);
      }
      userMap.set(row.stat_day, (userMap.get(row.stat_day) ?? 0) + row.total_count);
    }

    const labels = dayList.map(formatShortDate);
    const totalSeries: LineChartSeries[] = [
      {
        name: "每日总生图",
        color: "#f26122",
        values: dayList.map((d) => totalsByDay.get(d) ?? 0),
      },
    ];

    // 按总生图量降序排，方便图例可读；管理员账号过滤掉（一般无产出且会干扰图）
    const userIds = [...perUser.entries()]
      .map(([uid, m]) => ({
        uid,
        sum: [...m.values()].reduce((a, b) => a + b, 0),
      }))
      .filter((u) => {
        const account = accounts.find((a) => a.id === u.uid);
        return !account || account.role !== "admin";
      })
      .filter((u) => u.sum > 0)
      .sort((a, b) => b.sum - a.sum);

    const perUserSeries: LineChartSeries[] = userIds.map((u, idx) => ({
      name: accountNameById.get(u.uid) ?? u.uid.slice(0, 8),
      color: PALETTE[idx % PALETTE.length],
      values: dayList.map((d) => perUser.get(u.uid)?.get(d) ?? 0),
    }));

    return { labels, totalSeries, perUserSeries };
  }, [rows, accounts, days]);

  if (loading) {
    return (
      <section className="card admin__trends">
        <div className="card__header">
          <div className="card__title">每日生图趋势（近 {days} 天）</div>
          <span className="card__hint">加载中…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card admin__trends">
        <div className="card__header">
          <div className="card__title">每日生图趋势（近 {days} 天）</div>
          <span className="card__hint" style={{ color: "var(--danger, #d33)" }}>
            {error}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="card admin__trends">
      <div className="card__header">
        <div className="card__heading">
          <div className="card__title">每日生图趋势（近 {days} 天）</div>
          <span className="card__hint">数据源：daily_generation_stats（上海时区）</span>
        </div>
      </div>
      <div className="card__body" style={{ display: "grid", gap: 24 }}>
        <LineChart
          title="每日总生图数"
          labels={labels}
          series={totalSeries}
          height={220}
          yUnit="张"
        />
        <LineChart
          title="每位运营每日生图"
          labels={labels}
          series={perUserSeries}
          height={320}
          yUnit="张"
        />
      </div>
    </section>
  );
}

/**
 * 生成最近 N 天的上海时区日期 ISO 字符串（YYYY-MM-DD），按时间升序。
 * 与 daily_generation_stats.stat_day 对齐。
 */
function buildShanghaiDayList(days: number): string[] {
  const now = new Date();
  const shanghaiNowMs = now.getTime() + 8 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = Math.floor(shanghaiNowMs / dayMs) * dayMs;
  const list: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayStart - i * dayMs);
    list.push(formatIso(d));
  }
  return list;
}

function formatIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}
