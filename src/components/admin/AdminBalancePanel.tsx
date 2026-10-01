import { useCallback, useEffect, useRef, useState } from "react";
import { BALANCE_LINES } from "../../lib/balance";
import { IconRefresh } from "../Icons";
import BalanceCard from "./balance/BalanceCard";
import type { BalanceCardHandle } from "./balance/types";

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function AdminBalancePanel() {
  const cardRefs = useRef(new Map<string, BalanceCardHandle>());
  const [refreshingAll, setRefreshingAll] = useState(false);

  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);
    try {
      const tasks = BALANCE_LINES
        .filter((l) => l.supported)
        .map((l) => cardRefs.current.get(l.id)?.refresh())
        .filter((p): p is Promise<void> => !!p);
      await Promise.allSettled(tasks);
    } finally {
      setRefreshingAll(false);
    }
  }, []);

  // 每 5 分钟自动刷新一次，使得余额为 0 的线路能被及时检测到并通知网关暂停。
  // 即使管理员不点"一键刷新"，只要 admin 页面打开着就会持续监控。
  useEffect(() => {
    const timer = window.setInterval(() => void refreshAll(), AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  return (
    <section className="card admin__balance">
      <div className="card__header">
        <div className="card__heading">
          <div className="card__title">余额监控</div>
          <span className="card__hint">
            API Key 线路会自动读取余额；其它线路点击「重新登录」后自动刷新
          </span>
        </div>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => void refreshAll()}
          disabled={refreshingAll}
        >
          <IconRefresh style={{ width: 13, height: 13 }} />
          {refreshingAll ? "刷新中…" : "一键刷新"}
        </button>
      </div>
      <div className="card__body">
        <div className="balance-grid">
          {BALANCE_LINES.map((line) => (
            <BalanceCard
              key={line.id}
              line={line}
              ref={(handle) => {
                if (handle) cardRefs.current.set(line.id, handle);
                else cardRefs.current.delete(line.id);
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
