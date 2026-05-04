export interface ClientErrorLogEntry {
  id: string;
  source: "window-error" | "unhandled-rejection" | "error-boundary";
  message: string;
  createdAt: string;
}

const STORAGE_KEY = "csgh-client-error-log";
const MAX_ERROR_LOGS = 20;

export function appendClientErrorLog(
  entries: ClientErrorLogEntry[],
  entry: ClientErrorLogEntry
): ClientErrorLogEntry[] {
  return [entry, ...entries].slice(0, MAX_ERROR_LOGS);
}

export function loadClientErrorLogs(): ClientErrorLogEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isClientErrorLogEntry).slice(0, MAX_ERROR_LOGS);
  } catch {
    return [];
  }
}

export function saveClientErrorLogs(entries: ClientErrorLogEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ERROR_LOGS)));
}

export function recordClientError(
  source: ClientErrorLogEntry["source"],
  message: string
) {
  const entries = loadClientErrorLogs();
  const next = appendClientErrorLog(entries, {
    id: `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    message,
    createdAt: new Date().toISOString(),
  });
  saveClientErrorLogs(next);
}

function isClientErrorLogEntry(value: unknown): value is ClientErrorLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.source === "string" &&
    typeof entry.message === "string" &&
    typeof entry.createdAt === "string"
  );
}
