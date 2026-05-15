import { getBackendGatewayUrl } from "./tauri";
import { supabase } from "./supabase";
import type { GenerationLine } from "../types";

export type LineHealthStatus = "green" | "yellow" | "red" | "unknown";

export interface LineHealthEntry {
  status: LineHealthStatus;
  latency_ms: number | null;
  sample_count: number;
  failure_count: number;
  last_at: string | null;
  last_success: boolean | null;
}

export interface LineHealthResponse {
  lines: Record<string, LineHealthEntry>;
}

const LINE_HEALTH_REQUEST_TIMEOUT_MS = 8000;

const EMPTY_ENTRY: LineHealthEntry = {
  status: "unknown",
  latency_ms: null,
  sample_count: 0,
  failure_count: 0,
  last_at: null,
  last_success: null,
};

const LINES: GenerationLine[] = ["line1", "line2", "line3", "line4", "line5"];

export function emptyLineHealthMap(): Record<GenerationLine, LineHealthEntry> {
  return Object.fromEntries(LINES.map((line) => [line, EMPTY_ENTRY])) as Record<
    GenerationLine,
    LineHealthEntry
  >;
}

export async function fetchLineHealth(): Promise<Record<GenerationLine, LineHealthEntry>> {
  const baseUrl = getBackendGatewayUrl();
  if (!baseUrl) {
    return emptyLineHealthMap();
  }
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) {
    return emptyLineHealthMap();
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    LINE_HEALTH_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch(`${baseUrl}/api/line-health`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`line-health 返回状态 ${response.status}`);
    }
    const parsed = (await response.json()) as LineHealthResponse;
    return mergeWithDefaults(parsed);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function mergeWithDefaults(
  parsed: LineHealthResponse,
): Record<GenerationLine, LineHealthEntry> {
  const out = emptyLineHealthMap();
  if (parsed && typeof parsed === "object" && parsed.lines) {
    for (const line of LINES) {
      const entry = parsed.lines[line];
      if (entry) out[line] = entry;
    }
  }
  return out;
}

export function formatLatency(latencyMs: number | null): string {
  if (latencyMs == null) return "—";
  if (latencyMs < 1000) return `${latencyMs}ms`;
  const secs = latencyMs / 1000;
  return secs < 10 ? `${secs.toFixed(1)}s` : `${Math.round(secs)}s`;
}

export function formatLastSeen(lastAt: string | null, now: Date = new Date()): string {
  if (!lastAt) return "暂无样本";
  const ts = Date.parse(lastAt);
  if (Number.isNaN(ts)) return "—";
  const diffSec = Math.max(0, Math.round((now.getTime() - ts) / 1000));
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.round(diffMin / 60);
  return `${diffHour} 小时前`;
}
