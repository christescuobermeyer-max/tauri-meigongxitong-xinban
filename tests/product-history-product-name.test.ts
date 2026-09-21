import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const historySource = readFileSync(new URL("../src/lib/history.ts", import.meta.url), "utf8");
const historyDownloadSource = readFileSync(new URL("../src/lib/history-download.ts", import.meta.url), "utf8");
const cloudHistorySource = readFileSync(new URL("../src/lib/cloud-history.ts", import.meta.url), "utf8");
const exportScriptSource = readFileSync(new URL("../scripts/export-user-today-images-by-shop.mjs", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

ok(historySource.includes("productName: normalizeHistoryProductName"), "云端历史映射应保留产品图菜品名");
ok(historyDownloadSource.includes("entry.productName"), "历史产品图下载应优先使用菜品名命名");
ok(cloudHistorySource.includes("product_name: input.assetKind === \"product\""), "前端兜底写库应保存产品图菜品名");
ok(exportScriptSource.includes("product_name"), "按用户日期导出脚本应读取产品图菜品名");
ok(exportScriptSource.includes("row.product_name || row.shop_name"), "导出脚本应按菜品名命名产品图并兼容旧记录");
ok(schemaSource.includes("product_name  text"), "Supabase schema 应包含 product_name 字段");

console.log("product history product name contract: OK");
