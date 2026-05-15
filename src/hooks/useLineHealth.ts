import { useEffect, useRef, useState } from "react";
import {
  emptyLineHealthMap,
  fetchLineHealth,
  type LineHealthEntry,
} from "../lib/line-health";
import { getBackendGatewayUrl } from "../lib/tauri";
import type { GenerationLine } from "../types";

const POLL_INTERVAL_MS = 60_000;

export interface LineHealthState {
  enabled: boolean;
  loading: boolean;
  lines: Record<GenerationLine, LineHealthEntry>;
  lastError: string | null;
  refresh: () => void;
}

export default function useLineHealth(): LineHealthState {
  const enabled = Boolean(getBackendGatewayUrl());
  const [lines, setLines] = useState<Record<GenerationLine, LineHealthEntry>>(() =>
    emptyLineHealthMap(),
  );
  const [loading, setLoading] = useState(enabled);
  const [lastError, setLastError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    fetchLineHealth()
      .then((next) => {
        if (cancelled || !mountedRef.current) return;
        setLines(next);
        setLastError(null);
      })
      .catch((error: unknown) => {
        if (cancelled || !mountedRef.current) return;
        setLastError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (cancelled || !mountedRef.current) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      setTick((n) => n + 1);
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled]);

  return {
    enabled,
    loading,
    lines,
    lastError,
    refresh: () => setTick((n) => n + 1),
  };
}
