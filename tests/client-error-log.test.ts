import { equal } from "node:assert/strict";
import {
  appendClientErrorLog,
  type ClientErrorLogEntry,
} from "../src/lib/client-error-log.js";

const seed = Array.from({ length: 20 }, (_, index) => ({
  id: `old-${index}`,
  source: "window-error",
  message: `旧错误 ${index}`,
  createdAt: `2026-05-02T17:${String(index).padStart(2, "0")}:00.000Z`,
})) satisfies ClientErrorLogEntry[];

const next = appendClientErrorLog(seed, {
  id: "newest",
  source: "error-boundary",
  message: "最新错误",
  createdAt: "2026-05-02T18:00:00.000Z",
});

equal(next.length, 20);
equal(next[0].id, "newest");
equal(next.at(-1)?.id, "old-18");
