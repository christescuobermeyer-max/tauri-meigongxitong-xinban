import { HEALTH_LABEL, lineUtilization, type GatewayStatsResponse } from "../../../lib/gateway-stats";
import { formatLastSeen, formatLatency } from "../../../lib/line-health";

export default function LineStatusTable({ stats }: { stats: GatewayStatsResponse }) {
  const queue = stats.queue;
  const health = stats.health.lines;
  const pausedMap = new Map((stats.paused_lines ?? []).map((line) => [line.line, line] as const));
  return (
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
  );
}
