import { forwardRef } from "react";
import type { BalanceLineDef } from "../../../lib/balance";
import { IconRefresh } from "../../Icons";
import type { BalanceCardHandle } from "./types";
import { useBalanceCard } from "./useBalanceCard";
import { formatNumber, formatRelative } from "./format";

const BalanceCard = forwardRef<BalanceCardHandle, { line: BalanceLineDef }>(function BalanceCard(
  { line },
  ref,
) {
  const { state, usesApiKeyBalance, refresh, login, openConsole } = useBalanceCard(line, ref);
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
        {!usesApiKeyBalance ? (
          <button
            className="btn btn--primary btn--sm"
            onClick={() => void login()}
            disabled={showLoading || state.consoleOpen}
          >
            {isExpired ? "重新登录" : "更新登录"}
          </button>
        ) : null}
      </div>

      <div className="balance-card__open-row">
        <button
          className="btn btn--ghost btn--sm balance-card__open-btn"
          onClick={() => void openConsole()}
          disabled={
            state.consoleOpen ||
            state.status === "logging_in" ||
            (!usesApiKeyBalance && state.status === "no_session")
          }
          title={
            usesApiKeyBalance
              ? `打开${line.name}后台`
              : state.status === "no_session"
              ? "请先登录"
              : "用已保存的 cookies 打开后台 console，方便充值/查日志"
          }
        >
          {state.consoleOpen
            ? "后台已打开"
            : usesApiKeyBalance
              ? "打开后台"
              : "打开后台（免登录）"}
        </button>
      </div>
    </div>
  );
});


export default BalanceCard;
