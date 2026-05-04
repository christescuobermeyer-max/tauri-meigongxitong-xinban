import { deepEqual, equal } from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

interface GenerationLogRow {
  id: string;
  user_id: string;
  shop_name: string;
  asset_kind: "avatar" | "storefront" | "poster" | "product" | "p_signboard" | "picture_wall";
  platform: "meituan" | "taobao";
  oss_url: string;
  oss_key: string | null;
  generation_line: "line1" | "line2" | null;
  created_at: string;
}

const source = readFileSync(new URL("../src/lib/admin-log-filters.ts", import.meta.url), "utf8")
  .replace('import type { GenerationLogRow } from "./supabase";', "");
const adminSource = readFileSync(new URL("../src/lib/admin.ts", import.meta.url), "utf8");
const adminDetailSource = readFileSync(
  new URL("../src/components/admin/AdminGenerationDetail.tsx", import.meta.url),
  "utf8"
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const module = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
);
const { filterGenerationLogs, getShanghaiDateRange } = module as {
  filterGenerationLogs: (
    logs: GenerationLogRow[],
    filter: { assetLabel: string; statDay?: string | null }
  ) => GenerationLogRow[];
  getShanghaiDateRange: (statDay: string) => { startIso: string; endIso: string };
};

const logs: GenerationLogRow[] = [
  {
    id: "before",
    user_id: "u1",
    shop_name: "前一天",
    asset_kind: "poster",
    platform: "meituan",
    oss_url: "https://example.com/before.png",
    oss_key: null,
    generation_line: "line1",
    created_at: "2026-05-02T15:59:59.999Z",
  },
  {
    id: "target",
    user_id: "u1",
    shop_name: "目标日期",
    asset_kind: "product",
    platform: "taobao",
    oss_url: "https://example.com/target.png",
    oss_key: null,
    generation_line: "line2",
    created_at: "2026-05-02T16:00:00.000Z",
  },
  {
    id: "after",
    user_id: "u1",
    shop_name: "后一天",
    asset_kind: "product",
    platform: "meituan",
    oss_url: "https://example.com/after.png",
    oss_key: null,
    generation_line: null,
    created_at: "2026-05-03T16:00:00.000Z",
  },
];

deepEqual(getShanghaiDateRange("2026-05-03"), {
  startIso: "2026-05-02T16:00:00.000Z",
  endIso: "2026-05-03T16:00:00.000Z",
});

deepEqual(
  filterGenerationLogs(logs, { assetLabel: "全部", statDay: "2026-05-03" }).map((row) => row.id),
  ["target"]
);

deepEqual(
  filterGenerationLogs(logs, { assetLabel: "产品图", statDay: "2026-05-03" }).map((row) => row.id),
  ["target"]
);

equal(filterGenerationLogs(logs, { assetLabel: "海报", statDay: "2026-05-03" }).length, 0);
equal(module.ASSET_LABEL.p_signboard, "P门头");
equal(module.ASSET_LABEL.picture_wall, "图片墙");
equal(module.GENERATION_LINE_LABEL.line1, "线路1");
equal(module.GENERATION_LINE_LABEL.line2, "线路2");
equal(adminSource.includes('gte("created_at", range.startIso)'), true);
equal(adminSource.includes('lt("created_at", range.endIso)'), true);
equal(adminDetailSource.includes("getGenerationLineLabel(log.asset_kind, log.generation_line)"), true);
equal(adminDetailSource.includes('kind === "picture_wall"'), true);
