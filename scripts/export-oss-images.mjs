import { runWithConcurrency as runExportBatch } from "./export/shared/concurrency.mjs";
import { writeWorkbook } from "./export/all/workbook.mjs";
import { main } from "./export/all/main.mjs";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import ExcelJS from "exceljs";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "[export-oss-images] 缺少 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，请用 .env.local 或 shell 注入再运行。",
  );
  process.exit(1);
}

function beijingDateFolder(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const ROOT_OUTPUT = path.resolve("U:\\数据导出");
const EXPORT_DATE_FOLDER = beijingDateFolder();
const SHOP_ROOT = path.join(ROOT_OUTPUT, "按店铺分类");
const ALL_IMAGES_DIR = path.join(ROOT_OUTPUT, "全部图片");
const SHOP_DATE_ROOT = path.join(SHOP_ROOT, EXPORT_DATE_FOLDER);
const ALL_IMAGES_DATE_DIR = path.join(ALL_IMAGES_DIR, EXPORT_DATE_FOLDER);
const EXCEL_PATH = path.join(ROOT_OUTPUT, "OSS图片汇总.xlsx");

const ASSET_KIND_LABEL = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
  product: "产品图",
  p_signboard: "P店招",
  picture_wall: "图片墙",
  detail_page: "详情页",
};

const CATEGORY_FOR_KIND = {
  avatar: "三件套",
  storefront: "三件套",
  poster: "三件套",
  product: "产品图",
  p_signboard: "其他",
  picture_wall: "其他",
  detail_page: "其他",
};

const PLATFORM_LABEL = { meituan: "美团", taobao: "淘宝" };
const LINE_LABEL = {
  line1: "线路1 wlai",
  line2: "线路2 yunwu",
  line3: "线路3 vectorengine",
  line4: "线路4 pockgo",
  line5: "线路5 apimart",
};

const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
function safeName(name, fallback = "未命名") {
  const cleaned = (name || "").replace(INVALID_CHARS, "_").replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned.slice(0, 80) : fallback;
}

async function fetchAllLogs() {
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/generation_logs`);
    url.searchParams.set("select", "id,shop_name,asset_kind,platform,generation_line,oss_url,oss_key,created_at");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const resp = await fetch(url, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    if (!resp.ok) throw new Error(`Supabase 拉取失败: ${resp.status} ${await resp.text()}`);
    const rows = await resp.json();
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
    console.log(`  已拉取 ${all.length} 条…`);
  }
  return all;
}

function getExtFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return m ? m[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}

async function downloadFile(url, targetPath) {
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await pipeline(resp.body, fs.createWriteStream(targetPath));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function runWithConcurrency(items, limit, worker) {
  return runExportBatch(items, limit, worker, 50);
}



main({ ensureDir, ROOT_OUTPUT, SHOP_ROOT, ALL_IMAGES_DIR, SHOP_DATE_ROOT, ALL_IMAGES_DATE_DIR, EXPORT_DATE_FOLDER, fetchAllLogs, ASSET_KIND_LABEL, CATEGORY_FOR_KIND, PLATFORM_LABEL, LINE_LABEL, safeName, getExtFromUrl, path, runWithConcurrency, fs, downloadFile, writeWorkbook, ExcelJS, EXCEL_PATH }).catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
