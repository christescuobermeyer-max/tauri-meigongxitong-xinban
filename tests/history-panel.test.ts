import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

interface HistoryEntry {
  id: string;
  kind: string;
  title: string;
  shopName: string;
  remoteUrl: string;
  previewUrl?: string;
  generationLine?: "line1" | "line2" | "line3" | "line4" | "line5";
  createdAt: string;
}

const paginationSource = readFileSync(
  new URL("../src/lib/history-pagination.ts", import.meta.url),
  "utf8"
).replace('import type { HistoryEntry } from "./history";', "");
const paginationTranspiled = ts.transpileModule(paginationSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const paginationModule = await import(
  `data:text/javascript;base64,${Buffer.from(paginationTranspiled).toString("base64")}`
);

const entries: HistoryEntry[] = Array.from({ length: 16 }, (_, index) => ({
  id: `entry-${index + 1}`,
  kind: "poster",
  title: "海报",
  shopName: `半山小厨 ${index + 1}`,
  remoteUrl: `https://example.com/poster-${index + 1}.png`,
  previewUrl: `https://example.com/poster-preview-${index + 1}.png`,
  generationLine: index % 2 === 0 ? "line1" : "line2",
  createdAt: `2026-05-03T10:${String(index).padStart(2, "0")}:00.000Z`,
}));

const {
  getHistoryPageCount,
  getPagedHistoryEntries,
  HISTORY_PAGE_SIZE,
} = paginationModule as {
  getHistoryPageCount: (entries: HistoryEntry[]) => number;
  getPagedHistoryEntries: (entries: HistoryEntry[], page: number) => HistoryEntry[];
  HISTORY_PAGE_SIZE: number;
};
const pageOne = getPagedHistoryEntries(entries, 1);
const pageTwo = getPagedHistoryEntries(entries, 2);
const panelSource = readFileSync(new URL("../src/components/HistoryPanel.tsx", import.meta.url), "utf8");

equal(HISTORY_PAGE_SIZE, 15);
equal(getHistoryPageCount(entries), 2);
equal(pageOne.length, 15);
equal(pageOne.at(-1)?.id, "entry-15");
equal(pageTwo.length, 1);
equal(pageTwo[0].id, "entry-16");
equal(panelSource.includes("getPagedHistoryEntries"), true);
equal(panelSource.includes("history-grid--five-columns"), true);
equal(panelSource.includes("第 {page} / {pageCount} 页"), true);
equal(panelSource.includes("共 {total} 张"), true);
equal(panelSource.includes("totalCount"), true);
equal(panelSource.includes("onPageChange"), true);
equal(panelSource.includes("getGenerationLineLabel"), true);
equal(panelSource.includes("getGenerationLineLabel(entry.kind, entry.generationLine)"), true);
equal(panelSource.includes('kind === "picture_wall"'), true);
