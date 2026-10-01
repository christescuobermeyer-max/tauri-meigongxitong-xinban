import { runWithConcurrency as runExportBatch } from "./export/shared/concurrency.mjs";
import { main } from "./export/operator/main.mjs";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import ExcelJS from "exceljs";

const envPath = path.resolve(".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

if (!process.env.SUPABASE_DB_URL) {
  console.error("缺少 SUPABASE_DB_URL");
  process.exit(1);
}

const ROOT_OUTPUT = path.resolve("U:\\数据导出");
const SHOP_ROOT = path.join(ROOT_OUTPUT, "按店铺分类");
const OPERATOR_ROOT = path.join(ROOT_OUTPUT, "按运营分类");
const EXCEL_PATH = path.join(ROOT_OUTPUT, "OSS图片汇总.xlsx");
const ATTRIBUTION_CACHE_PATH = path.join(ROOT_OUTPUT, ".operator-attribution.json");
const DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;

const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
function safeName(name, fallback = "未命名") {
  const cleaned = (name || "").replace(INVALID_CHARS, "_").replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned.slice(0, 80) : fallback;
}

function urlPath(u) {
  try { return new URL(u).pathname; } catch { return String(u || ""); }
}

/**
 * 加载 oss_url_path → operator 的持久化缓存。
 * Supabase generation_logs 只保留 7 天，旧记录的 user_id 会被清理，
 * 但既然之前已经归属过、并复制到了 按运营分类/，就应该一直记住归属。
 */
function loadAttributionCache() {
  if (!fs.existsSync(ATTRIBUTION_CACHE_PATH)) return new Map();
  try {
    const raw = fs.readFileSync(ATTRIBUTION_CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed.attributions ?? parsed));
  } catch (err) {
    console.warn(`  ⚠ 缓存文件解析失败（${err.message}），按空缓存处理`);
    return new Map();
  }
}

function saveAttributionCache(cacheMap) {
  const obj = {
    version: 1,
    updatedAt: new Date().toISOString(),
    attributions: Object.fromEntries(cacheMap),
  };
  fs.writeFileSync(ATTRIBUTION_CACHE_PATH, JSON.stringify(obj, null, 2), "utf-8");
}

function relShopFileDateFolder(relShopFile) {
  const parts = String(relShopFile || "").split(/[\\/]+/);
  return parts[0] === "按店铺分类" && DATE_FOLDER_RE.test(parts[1]) ? parts[1] : "";
}

function addOperatorDirAttribution(result, operator, operatorDir, dateFolder = "") {
  walkFiles(operatorDir, (filePath) => {
    const rel = path.relative(operatorDir, filePath); // "<店铺>\<分类>\<basename>"
    const shopRel = dateFolder
      ? path.join("按店铺分类", dateFolder, rel)
      : path.join("按店铺分类", rel);
    result.set(shopRel, operator);
  });
}

/**
 * 从磁盘上 按运营分类/<运营>/<店铺>/<分类>/<basename> 反推归属，
 * 用于第一次启用缓存时的 bootstrap（兼容老的存量数据）。
 * 返回 Map: relShopFile → operator
 *   relShopFile 形如 "按店铺分类\\<店铺>\\<分类>\\<basename>"，与 Excel 列对齐。
 * 新增日期目录后也兼容：
 *   "按运营分类\\<日期>\\<运营>\\<店铺>\\<分类>\\<basename>"
 *   → "按店铺分类\\<日期>\\<店铺>\\<分类>\\<basename>"
 */
function bootstrapFromOperatorDir() {
  const result = new Map();
  if (!fs.existsSync(OPERATOR_ROOT)) return result;
  for (const entry of fs.readdirSync(OPERATOR_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryDir = path.join(OPERATOR_ROOT, entry.name);
    if (DATE_FOLDER_RE.test(entry.name)) {
      for (const opEntry of fs.readdirSync(entryDir, { withFileTypes: true })) {
        if (!opEntry.isDirectory()) continue;
        addOperatorDirAttribution(result, opEntry.name, path.join(entryDir, opEntry.name), entry.name);
      }
      continue;
    }
    addOperatorDirAttribution(result, entry.name, entryDir);
  }
  return result;
}

function walkFiles(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, cb);
    else if (entry.isFile()) cb(full);
  }
}

function runWithConcurrency(items, limit, worker) {
  return runExportBatch(items, limit, worker, 50);
}



main({ loadAttributionCache, bootstrapFromOperatorDir, postgres, urlPath, fs, EXCEL_PATH, ExcelJS, saveAttributionCache, ATTRIBUTION_CACHE_PATH, safeName, path, ROOT_OUTPUT, relShopFileDateFolder, OPERATOR_ROOT, runWithConcurrency }).catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
