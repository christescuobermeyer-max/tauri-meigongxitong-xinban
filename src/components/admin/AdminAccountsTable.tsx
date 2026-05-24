import type { AccountSummary } from "../../lib/admin";
import { IconUser } from "../Icons";

interface Props {
  accounts: AccountSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string | null;
  togglingId: string | null;
  onToggleActive: (account: AccountSummary) => void;
  deletingId: string | null;
  onDelete: (account: AccountSummary) => void;
}

export default function AdminAccountsTable({
  accounts,
  loading,
  selectedId,
  onSelect,
  currentUserId,
  togglingId,
  onToggleActive,
  deletingId,
  onDelete,
}: Props) {
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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-table__empty">
                  {loading ? "加载中…" : "暂无账号"}
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr
                  key={account.id}
                  data-active={account.id === selectedId}
                  data-all={account.is_all ? "true" : undefined}
                  onClick={() => onSelect(account.id)}
                >
                  <td>
                    <div className="admin-table__user">
                      <IconUser style={{ width: 14, height: 14, color: "var(--fg-subtle)" }} />
                      <div>
                        <strong>{account.display_name}</strong>
                        <span className="admin-table__sub">
                          {account.is_all
                            ? "所有账户 · 汇总视图"
                            : `${account.id.slice(0, 8)}…${account.is_active ? "" : " · 已停用"}`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className="badge"
                      data-tone={account.is_all ? "info" : account.role === "admin" ? "warn" : "info"}
                    >
                      {account.is_all ? "全部" : account.role === "admin" ? "管理员" : "普通"}
                    </span>
                  </td>
                  <td>{account.is_all ? "—" : account.login_count}</td>
                  <td className="admin-table__time">
                    {account.is_all ? "—" : formatDate(account.last_login_at)}
                  </td>
                  <td><strong>{account.total_count}</strong></td>
                  <td>{account.today_count}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {account.is_all ? (
                      "—"
                    ) : account.role === "admin" ? (
                      <span className="meta-row" style={{ opacity: 0.6 }}>管理员</span>
                    ) : account.id === currentUserId ? (
                      <span className="meta-row" style={{ opacity: 0.6 }}>当前账号</span>
                    ) : (
                      <div className="admin-table__ops">
                        <div
                          className="admin-status-tabs"
                          role="group"
                          aria-label={`切换「${account.display_name}」启用状态`}
                          data-busy={togglingId === account.id ? "true" : undefined}
                        >
                          <button
                            type="button"
                            className="admin-status-tabs__item"
                            data-tone="active"
                            data-selected={account.is_active ? "true" : "false"}
                            disabled={togglingId === account.id || account.is_active}
                            onClick={() => {
                              if (account.is_active) return;
                              onToggleActive(account);
                            }}
                          >
                            启用
                          </button>
                          <button
                            type="button"
                            className="admin-status-tabs__item"
                            data-tone="inactive"
                            data-selected={!account.is_active ? "true" : "false"}
                            disabled={togglingId === account.id || !account.is_active}
                            onClick={() => {
                              if (!account.is_active) return;
                              onToggleActive(account);
                            }}
                          >
                            停用
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm admin-table__delete"
                          data-tone="danger"
                          disabled={deletingId === account.id}
                          onClick={() => onDelete(account)}
                        >
                          {deletingId === account.id ? "删除中…" : "删除"}
                        </button>
                      </div>
                    )}
                  </td>
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
