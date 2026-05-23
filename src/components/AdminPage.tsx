import { useEffect, useState } from "react";
import {
  ALL_ACCOUNTS_ID,
  buildAllAccountsSummary,
  fetchAccountDailyStats,
  fetchAccountGenerationLogs,
  listAccountSummaries,
  setAccountActive,
  type AccountSummary,
} from "../lib/admin";
import type { AssetKindLabel } from "../lib/admin-log-filters";
import { supabase, type DailyStatRow, type GenerationLogRow } from "../lib/supabase";
import AdminAccountsTable from "./admin/AdminAccountsTable";
import AdminDailyTrendCharts from "./admin/AdminDailyTrendCharts";
import AdminGatewayMonitor from "./admin/AdminGatewayMonitor";
import AdminGenerationDetail from "./admin/AdminGenerationDetail";
import NewAccountDialog from "./NewAccountDialog";
import { useToast } from "./Toast";
import { IconRefresh, IconSparkles } from "./Icons";

type AdminTab = "gateway" | "accounts" | "trends";

export default function AdminPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>(ALL_ACCOUNTS_ID);
  const [logs, setLogs] = useState<GenerationLogRow[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStatRow[]>([]);
  const [filter, setFilter] = useState<AssetKindLabel>("全部");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("gateway");

  useEffect(() => {
    void refresh();
    void supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const list = await listAccountSummaries();
      setAccounts(list);
      setSelectedId((current) =>
        current === ALL_ACCOUNTS_ID || list.some((account) => account.id === current)
          ? current
          : ALL_ACCOUNTS_ID
      );
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const isAllAccounts = selectedId === ALL_ACCOUNTS_ID;
        const [nextLogs, nextStats] = await Promise.all([
          fetchAccountGenerationLogs(selectedId, {
            limit: isAllAccounts ? (selectedDate ? 5000 : 500) : selectedDate ? 500 : 100,
            statDay: selectedDate,
          }),
          fetchAccountDailyStats(selectedId, 14),
        ]);
        if (cancelled) return;
        setLogs(nextLogs);
        setDailyStats(nextStats);
      } catch (error: unknown) {
        if (!cancelled) toast.show(error instanceof Error ? error.message : String(error), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedDate, toast]);

  const allAccountsSummary = buildAllAccountsSummary(accounts);
  const accountRows = accounts.length > 0 ? [allAccountsSummary, ...accounts] : [];
  const selected =
    selectedId === ALL_ACCOUNTS_ID
      ? allAccountsSummary
      : accounts.find((account) => account.id === selectedId) ?? null;
  const accountNameById = Object.fromEntries(
    accounts.map((account) => [account.id, account.display_name])
  );

  function handleSelectAccount(id: string) {
    setSelectedId(id);
    setSelectedDate(null);
  }

  async function handleToggleActive(account: AccountSummary) {
    const willDisable = account.is_active;
    const action = willDisable ? "停用" : "启用";
    const confirmText = willDisable
      ? `确定要停用「${account.display_name}」吗？\n\n停用后该账号将无法登录，已登录的设备会在 1 分钟内被自动登出。`
      : `确定要重新启用「${account.display_name}」吗？`;
    if (!window.confirm(confirmText)) return;

    setTogglingId(account.id);
    try {
      await setAccountActive(account.id, !willDisable);
      toast.show(`${action}成功`, "success");
      await refresh();
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="admin">
      <div className="admin__head">
        <div>
          <h2 className="section-heading" style={{ margin: 0 }}>账号管理</h2>
          <span className="meta-row">
            <span>共 <strong>{accounts.length}</strong> 个账号</span>
            <span>累计生图 <strong>{allAccountsSummary.total_count}</strong> 张</span>
            <span>今日生图 <strong>{allAccountsSummary.today_count}</strong> 张</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => void refresh()} disabled={loading}>
            <IconRefresh style={{ width: 13, height: 13 }} />
            刷新
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setShowCreate(true)}>
            <IconSparkles style={{ width: 13, height: 13 }} />
            新增账号
          </button>
        </div>
      </div>

      <div className="admin__tab-switch" role="tablist" aria-label="后台管理板块切换">
        {(
          [
            { id: "gateway", label: "网关实时监控" },
            { id: "accounts", label: "账号生图明细" },
            { id: "trends", label: "每日生图趋势" },
          ] as Array<{ id: AdminTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-active={activeTab === tab.id}
            className="admin__tab-switch-item"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: activeTab === "gateway" ? "block" : "none" }}>
        <AdminGatewayMonitor />
      </div>

      <div
        className="admin__layout"
        style={{ display: activeTab === "accounts" ? "grid" : "none" }}
      >
        <AdminAccountsTable
          accounts={accountRows}
          loading={loading}
          selectedId={selectedId}
          onSelect={handleSelectAccount}
          currentUserId={currentUserId}
          togglingId={togglingId}
          onToggleActive={handleToggleActive}
        />
        <AdminGenerationDetail
          selected={selected}
          logs={logs}
          dailyStats={dailyStats}
          filter={filter}
          selectedDate={selectedDate}
          accountNameById={accountNameById}
          onFilterChange={setFilter}
          onDateChange={setSelectedDate}
        />
      </div>

      <div style={{ display: activeTab === "trends" ? "block" : "none" }}>
        <AdminDailyTrendCharts accounts={accounts} days={30} />
      </div>

      {showCreate ? (
        <NewAccountDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => void refresh()}
        />
      ) : null}
    </div>
  );
}
