import { useCallback, useEffect, useRef, useState } from "react";
import {
  BALANCE_LINES,
  fetchBalance,
  triggerBalanceLogin,
  type BalanceFetchResult,
  type BalanceLineDef,
} from "../../lib/balance";
import { IconRefresh } from "../Icons";

type CardStatus = "idle" | "loading" | "ok" | "expired" | "no_session" | "error" | "logging_in";

interface CardState {
  status: CardStatus;
  /** 上次成功的数据 */
  data?: { balance: number; historyUsed: number; unit: string; displayName?: string };
  /** 最近一次拉取时间（前端记录的） */
  lastFetchedAt?: number;
  /** 错误描述（前端显示） */
  errorMessage?: string;
}

const INITIAL: CardState = { status: "idle" };

export default function AdminBalancePanel() {
  return (
    <section className="card admin__balance">
      <div className="card__header">
        <div className="card__heading">
          <div className="card__title">余额监控</div>
          <span className="card__hint">
            点击「重新登录」可弹出浏览器登录窗口；登录成功后回到此处自动刷新余额
          </span>
        </div>
      </div>
      <div className="card__body">
        <div className="balance-grid">
          {BALANCE_LINES.map((line) => (
            <BalanceCard key={line.id} line={line} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BalanceCard({ line }: { line: BalanceLineDef }) {
  const [state, setState] = useState<CardState>(INITIAL);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyResult = useCallback((result: BalanceFetchResult) => {
    if (!mountedRef.current) return;
    if (result.ok) {
      setState({
        status: "ok",
        data: {
          balance: result.balance,
          historyUsed: result.history_used,
          unit: result.unit,
          displayName: result.displayName,
        },
        lastFetchedAt: Date.now(),
      });
      return;
    }
    if (result.reason === "expired") {
      setState({ status: "expired", lastFetchedAt: Date.now(),
                 errorMessage: result.detail || "登录态已失效，请重新登录" });
      return;
    }
    if (result.reason === "no_session") {
      setState({ status: "no_session", lastFetchedAt: Date.now() });
      return;
    }
    setState({ status: "error", lastFetchedAt: Date.now(),
               errorMessage: result.detail || result.reason || "未知错误" });
  }, []);

  const refresh = useCallback(async () => {
    if (!line.supported) return;
    setState((prev) => ({ ...prev, status: "loading" }));
    try {
      const result = await fetchBalance(line.id);
      applyResult(result);
    } catch (e) {
      if (!mountedRef.current) return;
      setState({ status: "error", errorMessage: e instanceof Error ? e.message : String(e),
                 lastFetchedAt: Date.now() });
    }
  }, [applyResult, line.id, line.supported]);

  const login = useCallback(async () => {
    if (!line.supported) return;
    setState((prev) => ({ ...prev, status: "logging_in" }));
    try {
      await triggerBalanceLogin(line.id);
      // 登录完毕立即拉一次余额
      await refresh();
    } catch (e) {
      if (!mountedRef.current) return;
      setState({ status: "error", errorMessage: e instanceof Error ? e.message : String(e),
                 lastFetchedAt: Date.now() });
    }
  }, [line.id, line.supported, refresh]);

  // 首次挂载自动拉一次（仅支持的线路）
  useEffect(() => {
    if (line.supported) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]);

  if (!line.supported) {
    return (
      <div className="balance-card balance-card--placeholder">
        <div className="balance-card__head">
          <div className="balance-card__name">{line.name}</div>
          <span className="balance-card__badge balance-card__badge--muted">未接入</span>
        </div>
        <div className="balance-card__placeholder-body">即将支持，敬请期待</div>
      </div>
    );
  }

  const showLoading = state.status === "loading" || state.status === "logging_in";
  const isExpired = state.status === "expired" || state.status === "no_session";

  return (
    <div className="balance-card" data-status={state.status}>
      <div className="balance-card__head">
        <div>
          <div className="balance-card__name">{line.name}</div>
          {state.data?.displayName ? (
            <div className="balance-card__sub">账号：{state.data.displayName}</div>
          ) : null}
        </div>
        {state.status === "ok" && (
          <span className="balance-card__badge balance-card__badge--ok">正常</span>
        )}
        {isExpired && (
          <span className="balance-card__badge balance-card__badge--warn">登录已过期</span>
        )}
        {state.status === "error" && (
          <span className="balance-card__badge balance-card__badge--danger">异常</span>
        )}
      </div>

      <div className="balance-card__body">
        {showLoading ? (
          <div className="balance-card__loading">
            {state.status === "logging_in"
              ? "已打开浏览器，请在弹出的窗口中完成登录…"
              : "加载中…"}
          </div>
        ) : isExpired ? (
          <div className="balance-card__expired">
            <div className="balance-card__expired-text">
              {state.status === "no_session"
                ? "尚未登录此线路，点击下方按钮开始登录"
                : (state.errorMessage || "登录态已失效")}
            </div>
          </div>
        ) : state.status === "error" ? (
          <div className="balance-card__error">
            <pre>{state.errorMessage}</pre>
          </div>
        ) : state.data ? (
          <>
            <div className="balance-card__amount">
              <span className="balance-card__amount-unit">{state.data.unit}</span>
              <span className="balance-card__amount-value">
                {formatNumber(state.data.balance)}
              </span>
            </div>
            <dl className="balance-card__meta">
              <dt>历史消耗</dt>
              <dd>
                {state.data.unit}
                {formatNumber(state.data.historyUsed)}
              </dd>
              <dt>更新时间</dt>
              <dd>{state.lastFetchedAt ? formatRelative(state.lastFetchedAt) : "—"}</dd>
            </dl>
          </>
        ) : null}
      </div>

      <div className="balance-card__actions">
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => void refresh()}
          disabled={showLoading || isExpired}
        >
          <IconRefresh style={{ width: 13, height: 13 }} />
          刷新
        </button>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => void login()}
          disabled={showLoading}
        >
          {isExpired ? "重新登录" : "更新登录"}
        </button>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 5_000) return "刚刚";
  if (delta < 60_000) return `${Math.floor(delta / 1000)} 秒前`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleString("zh-CN");
}
