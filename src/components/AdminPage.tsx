import { useEffect, useState } from "react";
import {
  fetchAccountDailyStats,
  fetchAccountGenerationLogs,
  listAccountSummaries,
  type AccountSummary,
} from "../lib/admin";
import type { AssetKindLabel } from "../lib/admin-log-filters";
import type { DailyStatRow, GenerationLogRow } from "../lib/supabase";
import AdminAccountsTable from "./admin/AdminAccountsTable";
import AdminGenerationDetail from "./admin/AdminGenerationDetail";
import NewAccountDialog from "./NewAccountDialog";
import { useToast } from "./Toast";
import { IconRefresh, IconSparkles } from "./Icons";

export default function AdminPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<GenerationLogRow[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStatRow[]>([]);
  const [filter, setFilter] = useState<AssetKindLabel>("全部");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const list = await listAccountSummaries();
      setAccounts(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    } catch (error: unknown) {
      toast.show(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedId) {
      setLogs([]);
      setDailyStats([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [nextLogs, nextStats] = await Promise.all([
          fetchAccountGenerationLogs(selectedId, {
            limit: selectedDate ? 500 : 100,
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

  const selected = accounts.find((account) => account.id === selectedId) ?? null;

  function handleSelectAccount(id: string) {
    setSelectedId(id);
    setSelectedDate(null);
  }

  return (
    <div className="admin">
      <div className="admin__head">
        <div>
          <h2 className="section-heading" style={{ margin: 0 }}>账号管理</h2>
          <span className="meta-row">
            <span>共 <strong>{accounts.length}</strong> 个账号</span>
            <span>累计生图 <strong>{accounts.reduce((sum, item) => sum + item.total_count, 0)}</strong> 张</span>
            <span>今日生图 <strong>{accounts.reduce((sum, item) => sum + item.today_count, 0)}</strong> 张</span>
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

      <div className="admin__layout">
        <AdminAccountsTable
          accounts={accounts}
          loading={loading}
          selectedId={selectedId}
          onSelect={handleSelectAccount}
        />
        <AdminGenerationDetail
          selected={selected}
          logs={logs}
          dailyStats={dailyStats}
          filter={filter}
          selectedDate={selectedDate}
          onFilterChange={setFilter}
          onDateChange={setSelectedDate}
        />
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
