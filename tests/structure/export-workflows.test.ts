import { deepEqual, equal, ok } from "node:assert/strict";
import { main } from "../../scripts/export/incremental/main.mjs";
import { createDataTasks } from "../../scripts/export/user-day/data.mjs";

let writes = 0;
const existing = {
  seq: 1, shop_name: "测试店", category: "产品图", kindLabel: "产品图", platformLabel: "美团",
  lineLabel: "线路5", createdAt: "2026-09-30", oss_url: "https://image.example/existing.jpg",
  oss_key: "existing.jpg", relShopFile: "", relAllFile: "",
};
let merged: unknown[] = [];
await main({
  ensureDir: () => undefined,
  ROOT_OUTPUT: "fake-export", SHOP_ROOT: "fake-export/shops", ALL_IMAGES_DIR: "fake-export/all",
  SHOP_DATE_ROOT: "fake-export/shops/date", ALL_IMAGES_DATE_DIR: "fake-export/all/date",
  EXPORT_DATE_FOLDER: "2026-09-30",
  EXCEL_PATH: "fake-export/summary.xlsx",
  readExistingExcel: async () => ({ map: new Map([[existing.oss_url, existing]]), maxSeq: 1 }),
  fetchAllLogs: async () => [],
  runWithConcurrency: async () => [],
  writeWorkbook: async (context: { allMerged: unknown[] }) => { writes++; merged = context.allMerged; },
});
equal(writes, 1, "保留原有重新生成汇总表的流程");
deepEqual(merged, [existing], "增量为空时仍保留既有导出记录");

const originalFetch = globalThis.fetch;
const requests: { url: URL; headers: Headers }[] = [];
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  requests.push({ url, headers: new Headers(init?.headers) });
  return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
};
try {
  const tasks = createDataTasks({ SUPABASE_URL: "https://database.example", SERVICE_ROLE_KEY: "fake-key", USER_NAME: "测试运营" });
  const url = tasks.buildQueryUrl("generation_logs", { created_at: ["gte.start", "lt.end"] });
  deepEqual(url.searchParams.getAll("created_at"), ["gte.start", "lt.end"]);
  deepEqual(await tasks.findProfiles(), []);
  equal(requests.length, 2, "精确查询为空时保留名称模糊查询回退");
  ok(requests[0].url.pathname.endsWith("/profiles"));
  equal(requests[0].headers.get("Authorization"), "Bearer fake-key");
} finally {
  globalThis.fetch = originalFetch;
}
