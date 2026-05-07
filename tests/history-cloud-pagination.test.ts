import { deepEqual, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HISTORY_PAGE_SIZE,
  getHistoryPageCountFromTotal,
  getHistoryQueryRange,
} from "../src/lib/history-pagination.js";

equal(HISTORY_PAGE_SIZE, 15);

equal(getHistoryPageCountFromTotal(0), 1);
equal(getHistoryPageCountFromTotal(1), 1);
equal(getHistoryPageCountFromTotal(15), 1);
equal(getHistoryPageCountFromTotal(16), 2);

deepEqual(getHistoryQueryRange(1, HISTORY_PAGE_SIZE), { from: 0, to: 14 });
deepEqual(getHistoryQueryRange(2, HISTORY_PAGE_SIZE), { from: 15, to: 29 });
deepEqual(getHistoryQueryRange(0, HISTORY_PAGE_SIZE), { from: 0, to: 14 });
deepEqual(getHistoryQueryRange(3, 10), { from: 20, to: 29 });

const cloudHistorySource = readFileSync(new URL("../src/lib/cloud-history.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url), "utf8");
const historyPanelSource = readFileSync(new URL("../src/components/HistoryPanel.tsx", import.meta.url), "utf8");

equal(cloudHistorySource.includes("fetchGenerationLogsPage"), true);
equal(cloudHistorySource.includes(".select(\"*\", { count: \"exact\" })"), true);
equal(cloudHistorySource.includes(".range(range.from, range.to)"), true);
equal(workspaceSource.includes("historyTotalCount"), true);
equal(workspaceSource.includes("historyLoading"), true);
equal(workspaceSource.includes("fetchGenerationLogsPage(userId"), true);
equal(historyPanelSource.includes("onPageChange"), true);
equal(historyPanelSource.includes("loading"), true);
