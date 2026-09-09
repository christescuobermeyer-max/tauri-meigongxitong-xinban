import { useEffect, useState } from "react";
import {
  HEALTH_LABEL,
  displayNameOf,
  fetchGatewayStats,
  formatWaited,
  lineUtilization,
  type GatewayStatsResponse,
  type WaitingTicketSnapshot,
} from "../../lib/gateway-stats";
import { formatLastSeen, formatLatency } from "../../lib/line-health";
import { IconRefresh } from "../Icons";

const POLL_INTERVAL_MS = 5000;

export default function AdminGatewayMonitor() {
  const [stats, setStats] = useState<GatewayStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let firstLoad = stats == null;
    if (firstLoad) setLoading(true);

    fetchGatewayStats()
      .then((next) => {
        if (cancelled) return;
        setStats(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        if (firstLoad) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  function refresh() {
    setTick((n) => n + 1);
  }

  if (loading && !stats) {
    return (
      <section className="card gateway-monitor">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">网关实时监控</div>
            <span className="card__hint">每 5 秒自动刷新</span>
          </div>
        </div>
        <div className="card__body">
          <span className="meta-row">正在加载网关运行状态…</span>
        </div>
      </section>
    );
  }

  if (error && !stats) {
    return (
      <section className="card gateway-monitor">
        <div className="card__header">
          <div className="card__heading">
            <div className="card__title">网关实时监控</div>
            <span className="card__hint">加载失败</span>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={refresh}>
            <IconRefresh style={{ width: 13, height: 13 }} />
            重试
          </button>
        </div>
        <div className="card__body">
          <span className="meta-row" style={{ color: "var(--danger, #d33)" }}>
            {error}
          </span>
        </div>
      </section>
    );
  }

  if (!stats) return null;

  const queue = stats.queue;
  const health = stats.health.lines;
  const names = stats.display_names;
  // line -> 暂停信息（reason + paused_at）。线路表第一列据此显示"已暂停"badge。
  const pausedMap = new Map(
    (stats.paused_lines ?? []).map((p) => [p.line, p] as const)
  );

  // 计算"等候队列里的运营"汇总（按用户聚合）
  const waitingByUser = new Map<string, number>();
  for (const ticket of queue.waiting) {
    waitingByUser.set(ticket.user_id, (waitingByUser.get(ticket.user_id) ?? 0) + 1);
  }

  // 汇集所有出现的用户（在跑 + 排队）
  const allUserIds = new Set<string>([
    ...Object.keys(queue.active_by_user),
    ...waitingByUser.keys(),
  ]);
  const userRows = Array.from(allUserIds)
    .map((id) => ({
      id,
      name: displayNameOf(id, names),
      active: queue.active_by_user[id] ?? 0,
      waiting: waitingByUser.get(id) ?? 0,
    }))
    .sort((a, b) => b.active + b.waiting - (a.active + a.waiting));

  const globalUtilizationPct = queue.global_limit > 0
    ? Math.round((queue.global_active / queue.global_limit) * 100)
    : 0;

  return (
    <section className="card gateway-monitor">
      <div className="card__header">
        <div className="card__heading">
          <div className="card__title">网关实时监控</div>
          <span className="card__hint">
            每 5 秒自动刷新 · 服务器时间 {stats.server_time}
          </span>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={refresh}>
          <IconRefresh style={{ width: 13, height: 13 }} />
          立即刷新
        </button>
      </div>

      <div className="card__body" style={{ display: "grid", gap: 18 }}>
        {/* 1) 全局指标 */}
        <div className="gateway-monitor__grid">
          <StatCard
            label="全局并发"
            value={`${queue.global_active} / ${queue.global_limit}`}
            hint={`利用率 ${globalUtilizationPct}%`}
            tone={globalUtilizationPct >= 90 ? "warn" : "ok"}
          />
          <StatCard
            label="等待队列"
            value={String(queue.waiting.length)}
            hint={queue.waiting.length === 0 ? "无排队" : "有任务在等"}
            tone={queue.waiting.length > 0 ? "warn" : "ok"}
          />
          <StatCard
            label="账号并发上限"
            value={String(queue.user_limit)}
            hint="单账号同时最多在跑"
            tone="ok"
          />
          <StatCard
            label="活跃账号"
            value={String(Object.keys(queue.active_by_user).length)}
            hint="当前在跑生图的账号数"
            tone="ok"
          />
        </div>

        {/* 2) 每线路状态 */}
        <div>
          <div className="section-heading" style={{ fontSize: 14, marginBottom: 8 }}>
            各线路状态
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>线路</th>
                <th>占用 / 上限</th>
                <th>健康</th>
                <th>中位延迟</th>
                <th>最近样本</th>
                <th>失败数</th>
                <th>最近上报</th>
              </tr>
            </thead>
            <tbody>
              {queue.lines.map((line) => {
                const h = health[line.line];
                const util = lineUtilization(line);
                const pct = Math.round(util * 100);
                const paused = pausedMap.get(line.line);
                return (
                  <tr key={line.line} data-paused={paused ? "true" : undefined}>
                    <td>
                      <strong>{line.line}</strong>
                      {paused ? (
                        <span
                          className="badge badge--danger"
                          style={{ marginLeft: 6 }}
                          title={`${paused.reason}\n暂停时间：${paused.paused_at}\n来源：${paused.source}`}
                        >
                          已暂停
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {line.active} / {line.limit}
                      <span className="meta-row" style={{ marginLeft: 4, opacity: 0.7 }}>
                        ({pct}%)
                      </span>
                    </td>
                    <td>{paused ? "—" : h ? HEALTH_LABEL[h.status] ?? h.status : "—"}</td>
                    <td>{h ? formatLatency(h.latency_ms) : "—"}</td>
                    <td>{h ? h.sample_count : 0}</td>
                    <td>{h ? h.failure_count : 0}</td>
                    <td>{h ? formatLastSeen(h.last_at) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 3) 每账号 */}
        <div>
          <div className="section-heading" style={{ fontSize: 14, marginBottom: 8 }}>
            各账号占用情况
          </div>
          {userRows.length === 0 ? (
            <div className="meta-row" style={{ opacity: 0.7 }}>当前没有账号在跑或排队</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>运营</th>
                  <th>正在跑</th>
                  <th>等待中</th>
                  <th>账号 ID（前 8 位）</th>
                </tr>
              </thead>
              <tbody>
                {userRows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.active}</td>
                    <td>{row.waiting}</td>
                    <td>
                      <code style={{ fontSize: 11 }}>{row.id.slice(0, 8)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 4) 等待队列明细 */}
        <div>
          <div className="section-heading" style={{ fontSize: 14, marginBottom: 8 }}>
            排队任务明细 ({queue.waiting.length})
          </div>
          {queue.waiting.length === 0 ? (
            <div className="meta-row" style={{ opacity: 0.7 }}>当前队列为空</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>运营</th>
                  <th>类型</th>
                  <th>尺寸/线路</th>
                  <th>已排除线路 (retry 用)</th>
                  <th>等待时长</th>
                </tr>
              </thead>
              <tbody>
                {queue.waiting.map((ticket: WaitingTicketSnapshot) => (
                  <tr key={ticket.ticket_id}>
                    <td><code style={{ fontSize: 11 }}>{ticket.ticket_id}</code></td>
                    <td>{displayNameOf(ticket.user_id, names)}</td>
                    <td>{ticket.kind === "auto" ? "自动路由" : `指定 ${ticket.detail}`}</td>
                    <td>{ticket.kind === "auto" ? ticket.detail : "—"}</td>
                    <td>
                      {ticket.excluded_lines.length === 0
                        ? "—"
                        : ticket.excluded_lines.join(", ")}
                    </td>
                    <td>{formatWaited(ticket.waited_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {error ? (
          <div
            className="meta-row"
            style={{ color: "var(--warn, #c80)" }}
          >
            上一次刷新失败：{error}（沿用上一次成功数据）
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}

function StatCard({ label, value, hint, tone = "ok" }: StatCardProps) {
  return (
    <div className="stat-card" data-tone={tone}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {hint ? <div className="stat-card__hint">{hint}</div> : null}
    </div>
  );
}
