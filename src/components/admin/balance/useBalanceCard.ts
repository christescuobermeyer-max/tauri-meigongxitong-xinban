import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ForwardedRef } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { fetchBalance, openBalanceConsole, pauseLine, resumeLine, triggerBalanceLogin, type BalanceFetchResult, type BalanceLineDef } from "../../../lib/balance";
import type { BalanceCardHandle, CardState } from "./types";
const INITIAL: CardState = { status: "idle" };

export function useBalanceCard(line: BalanceLineDef, ref: ForwardedRef<BalanceCardHandle>) {
  const [state, setState] = useState<CardState>(INITIAL);
  const usesApiKeyBalance = line.balanceMode === "api_key";
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
      // 余额检测 → 网关同步：== 0 触发暂停；> 0 触发恢复（幂等，多个管理员同时开 app 也无害）
      // 网络失败时静默吞掉 — 下一轮 5min 自动刷新会再试。
      if (result.balance <= 0) {
        void pauseLine(line.id, `余额为 ${result.balance.toFixed(2)} ${result.unit}`).catch(
          (e) => console.warn(`[balance] pauseLine ${line.id} failed:`, e)
        );
      } else {
        void resumeLine(line.id).catch(
          (e) => console.warn(`[balance] resumeLine ${line.id} failed:`, e)
        );
      }
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
  }, [line.id]);

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

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

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

  const openConsole = useCallback(async () => {
    if (!line.supported) return;
    setState((prev) => ({ ...prev, consoleOpen: true }));
    try {
      if (usesApiKeyBalance) {
        await openExternal(line.consoleUrl);
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, consoleOpen: false }));
        }
        return;
      }
      await openBalanceConsole(line.id);
      // 后台关闭后顺手刷一次余额（如果用户在窗口里被动登录过，session 已被回写）
      if (mountedRef.current) await refresh();
    } catch (e) {
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        consoleOpen: false,
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
        lastFetchedAt: Date.now(),
      }));
      return;
    }
    if (mountedRef.current) {
      setState((prev) => ({ ...prev, consoleOpen: false }));
    }
  }, [line.consoleUrl, line.id, line.supported, refresh, usesApiKeyBalance]);

  // 首次挂载自动拉一次（仅支持的线路）
  useEffect(() => {
    if (line.supported) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]);

  return { state, usesApiKeyBalance, refresh, login, openConsole };
}
