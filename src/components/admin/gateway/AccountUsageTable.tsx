import { displayNameOf, type GatewayStatsResponse } from "../../../lib/gateway-stats";

export default function AccountUsageTable({ stats }: { stats: GatewayStatsResponse }) {
  const queue = stats.queue;
  const names = stats.display_names;
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

  return (
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
  );
}
