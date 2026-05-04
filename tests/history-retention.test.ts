import { deepEqual, equal } from "node:assert/strict";
import {
  HISTORY_RETENTION_DAYS,
  getHistoryRetentionCutoffIso,
  pruneExpiredHistoryEntries,
} from "../src/lib/history-retention.js";
import type { HistoryEntry } from "../src/lib/history.js";

equal(HISTORY_RETENTION_DAYS, 7);

const now = new Date("2026-05-10T12:00:00.000Z");

equal(getHistoryRetentionCutoffIso(now), "2026-05-03T12:00:00.000Z");

const entries: HistoryEntry[] = [
  {
    id: "keep-on-cutoff",
    kind: "avatar",
    title: "头像",
    shopName: "店铺 A",
    remoteUrl: "https://example.com/a.png",
    createdAt: "2026-05-03T12:00:00.000Z",
  },
  {
    id: "expired-before-cutoff",
    kind: "poster",
    title: "海报",
    shopName: "店铺 B",
    remoteUrl: "https://example.com/b.png",
    createdAt: "2026-05-03T11:59:59.000Z",
  },
  {
    id: "fresh",
    kind: "product",
    title: "产品图",
    shopName: "店铺 C",
    remoteUrl: "https://example.com/c.png",
    createdAt: "2026-05-09T08:00:00.000Z",
  },
];

deepEqual(
  pruneExpiredHistoryEntries(entries, now).map((entry) => entry.id),
  ["keep-on-cutoff", "fresh"]
);
