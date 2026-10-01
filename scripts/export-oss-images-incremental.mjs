import { runWithConcurrency as runExportBatch } from "./export/shared/concurrency.mjs";
import { writeWorkbook } from "./export/incremental/workbook.mjs";
import { ASSET_KIND_LABEL, CATEGORY_FOR_KIND, PLATFORM_LABEL, LINE_LABEL } from "./export/incremental/metadata.mjs";
import { main } from "./export/incremental/main.mjs";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import ExcelJS from "exceljs";

// --- 加载 .env.local（沿用 query-gen-count.mjs 的最小实现） ---
const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[incremental] 缺少 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。");
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








const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
function safeName(name, fallback = "未命名") {
  const cleaned = (name || "").replace(INVALID_CHARS, "_").replace(/\s+/g, " ").trim();
  return cleaned.length ? cleaned.slice(0, 80) : fallback;
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
  return runExportBatch(items, limit, worker, 25);
}

async function fetchAllLogs() {
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/generation_logs`);
    url.searchParams.set(
      "select",
      "id,shop_name,asset_kind,platform,generation_line,oss_url,oss_key,created_at",
    );
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

function toIsoString(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

async function readExistingExcel() {
  const map = new Map(); // oss_url -> existing row snapshot
  let maxSeq = 0;
  if (!fs.existsSync(EXCEL_PATH)) {
    return { map, maxSeq };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const sheet = wb.getWorksheet("全部明细");
  if (!sheet) return { map, maxSeq };

  // Column mapping in the existing sheet:
  // A 序号 / B 店铺名称 / C 分类 / D 图片类型 / E 平台 / F 线路 /
  // G 生成时间 / H OSS 链接 / I 店铺目录内路径 / J 全部图片内路径 / K OSS Key
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const seq = Number(row.getCell(1).value) || 0;
    const shop = row.getCell(2).value ?? "";
    const category = row.getCell(3).value ?? "";
    const kindLabel = row.getCell(4).value ?? "";
    const platformLabel = row.getCell(5).value ?? "";
    const lineLabel = row.getCell(6).value ?? "";
    const createdAt = toIsoString(row.getCell(7).value);
    const ossUrlCell = row.getCell(8).value;
    const ossUrl =
      ossUrlCell && typeof ossUrlCell === "object" && "text" in ossUrlCell
        ? ossUrlCell.text
        : ossUrlCell && typeof ossUrlCell === "object" && "hyperlink" in ossUrlCell
          ? ossUrlCell.hyperlink
          : String(ossUrlCell ?? "");
    const relShopFile = String(row.getCell(9).value ?? "");
    const relAllFile = String(row.getCell(10).value ?? "");
    const ossKey = row.getCell(11).value ?? "";
    if (!ossUrl) return;
    if (seq > maxSeq) maxSeq = seq;
    map.set(ossUrl, {
      seq,
      shop_name: String(shop),
      category: String(category),
      kindLabel: String(kindLabel),
      platformLabel: String(platformLabel),
      lineLabel: String(lineLabel),
      createdAt,
      oss_url: ossUrl,
      relShopFile,
      relAllFile,
      oss_key: String(ossKey),
    });
  });
  return { map, maxSeq };
}

function planNewRecord(row, seq, usedAllNames, usedShopFileNames) {
  const kindLabel = ASSET_KIND_LABEL[row.asset_kind] || row.asset_kind || "未知";
  const category = CATEGORY_FOR_KIND[row.asset_kind] || "其他";
  const platformLabel = PLATFORM_LABEL[row.platform] || row.platform || "";
  const lineLabel = LINE_LABEL[row.generation_line] || row.generation_line || "";
  const shop = safeName(row.shop_name);
  const ext = getExtFromUrl(row.oss_url);
  const seqStr = String(seq).padStart(4, "0");
  const baseName = `${seqStr}-${kindLabel}.${ext}`;

  const shopDir = path.join(SHOP_DATE_ROOT, shop, category);
  let shopFile = path.join(shopDir, baseName);
  const shopKey = shopFile.toLowerCase();
  if (usedShopFileNames.has(shopKey)) {
    shopFile = path.join(shopDir, `${seqStr}-${kindLabel}-${seq}.${ext}`);
  }
  usedShopFileNames.set(shopFile.toLowerCase(), true);

  let allName = `${seqStr}-${shop}-${kindLabel}.${ext}`;
  if (usedAllNames.has(allName.toLowerCase())) {
    allName = `${seqStr}-${shop}-${kindLabel}-${seq}.${ext}`;
  }
  usedAllNames.add(allName.toLowerCase());
  const allFile = path.join(ALL_IMAGES_DATE_DIR, allName);

  return {
    seq,
    shop_name: row.shop_name || "",
    category,
    kindLabel,
    platformLabel,
    lineLabel,
    createdAt: row.created_at,
    oss_url: row.oss_url,
    oss_key: row.oss_key || "",
    shopFile,
    allFile,
    relShopFile: path.relative(ROOT_OUTPUT, shopFile),
    relAllFile: path.relative(ROOT_OUTPUT, allFile),
  };
}



main({ ensureDir, ROOT_OUTPUT, SHOP_ROOT, ALL_IMAGES_DIR, SHOP_DATE_ROOT, ALL_IMAGES_DATE_DIR, EXPORT_DATE_FOLDER, readExistingExcel, fetchAllLogs, path, planNewRecord, runWithConcurrency, fs, downloadFile, writeWorkbook, ExcelJS, EXCEL_PATH }).catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
