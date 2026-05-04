import { deepEqual, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/history.ts", import.meta.url), "utf8")
  .replace('import type { GenerationLogRow } from "./supabase";', "")
  .replace('import { pruneExpiredHistoryEntries } from "./history-retention.js";', "const pruneExpiredHistoryEntries = (entries) => entries;")
  .replace('import type { AssetKind } from "../types";', "");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);

const { appendHistoryEntry, buildHistoryEntriesFromGenerationLogs } = module as {
  appendHistoryEntry: (entries: unknown[], entry: Record<string, unknown>) => Array<Record<string, unknown>>;
  buildHistoryEntriesFromGenerationLogs: (logs: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
};

const localEntries = appendHistoryEntry([], {
  id: "local-old",
  kind: "storefront",
  title: "店招",
  shopName: "测试店",
  remoteUrl: "https://oss.example.com/generated/test-p-signboard-1.png",
  generationLine: "line2",
  createdAt: "2026-05-03T10:00:00.000Z",
});

equal(localEntries[0].kind, "p_signboard");
equal(localEntries[0].title, "P门头");
equal(localEntries[0].generationLine, "line2");

const mapped = buildHistoryEntriesFromGenerationLogs([
  {
    id: "cloud-old",
    asset_kind: "product",
    shop_name: "测试店",
    oss_url: "https://oss.example.com/generated/test-picture-wall-a.png",
    generation_line: "line1",
    created_at: "2026-05-03T10:00:00.000Z",
  },
]);

deepEqual(
  mapped.map((item) => [item.kind, item.title, item.generationLine]),
  [["picture_wall", "图片墙", "line1"]]
);

const legacyProductEntries = buildHistoryEntriesFromGenerationLogs([
  {
    id: "legacy-product",
    asset_kind: "product",
    shop_name: "测试产品店",
    oss_url: "https://oss.example.com/generated/product-a.png",
    generation_line: null,
    created_at: "2026-05-03T10:00:00.000Z",
  },
]);

deepEqual(
  legacyProductEntries.map((item) => [item.kind, item.title, item.generationLine]),
  [["product", "产品图", "line1"]]
);

const legacyPictureWallEntries = buildHistoryEntriesFromGenerationLogs([
  {
    id: "legacy-picture-wall",
    asset_kind: "picture_wall",
    shop_name: "测试图片墙店",
    oss_url: "https://oss.example.com/generated/picture-wall-a.png",
    generation_line: null,
    created_at: "2026-05-03T10:00:00.000Z",
  },
]);

deepEqual(
  legacyPictureWallEntries.map((item) => [item.kind, item.title, item.generationLine]),
  [["picture_wall", "图片墙", null]]
);
