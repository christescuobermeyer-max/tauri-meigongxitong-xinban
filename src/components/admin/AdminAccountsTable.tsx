import type { AccountSummary } from "../../lib/admin";
import { IconUser } from "../Icons";

interface Props {
  accounts: AccountSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function AdminAccountsTable({ accounts, loading, selectedId, onSelect }: Props) {
  return (
    <section className="card admin__accounts">
      <div className="card__header">
        <div className="card__title">账号列表</div>
        <span className="card__hint">点击查看明细</span>
      </div>
      <div className="card__body" style={{ padding: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>账号</th>
              <th>角色</th>
              <th>登录次数</th>
              <th>最后登录</th>
              <th>累计生图</th>
              <th>今日</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-table__empty">
                  {loading ? "加载中…" : "暂无账号"}
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr
                  key={account.id}
                  data-active={account.id === selectedId}
                  onClick={() => onSelect(account.id)}
                >
                  <td>
                    <div className="admin-table__user">
                      <IconUser style={{ width: 14, height: 14, color: "var(--fg-subtle)" }} />
                      <div>
                        <strong>{account.display_name}</strong>
                        <span className="admin-table__sub">
                          {account.id.slice(0, 8)}…{account.is_active ? "" : " · 已停用"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge" data-tone={account.role === "admin" ? "warn" : "info"}>
                      {account.role === "admin" ? "管理员" : "普通"}
                    </span>
                  </td>
                  <td>{account.login_count}</td>
                  <td className="admin-table__time">{formatDate(account.last_login_at)}</td>
                  <td><strong>{account.total_count}</strong></td>
                  <td>{account.today_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}
