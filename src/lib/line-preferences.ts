import type { GenerationLine } from "../types";

const VALID_LINES: ReadonlySet<GenerationLine> = new Set<GenerationLine>([
  "line1",
  "line2",
  "line3",
  "line4",
  "line5",
]);

const KEY_PREFIX = "csgh-line-preference:";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveLocalStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function buildKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function isGenerationLine(value: unknown): value is GenerationLine {
  return typeof value === "string" && VALID_LINES.has(value as GenerationLine);
}

export function loadLinePreference(
  userId: string,
  storage: StorageLike | null = resolveLocalStorage()
): GenerationLine | null {
  if (!userId || !storage) return null;
  try {
    const raw = storage.getItem(buildKey(userId));
    if (!raw) return null;
    return isGenerationLine(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveLinePreference(
  userId: string,
  line: GenerationLine,
  storage: StorageLike | null = resolveLocalStorage()
) {
  if (!userId || !storage) return;
  if (!isGenerationLine(line)) return;
  try {
    storage.setItem(buildKey(userId), line);
  } catch {
    /* ignore */
  }
}
