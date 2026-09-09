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

const ASSET_KIND_LABEL = {
  avatar: "头像",
  storefront: "店招",
  poster: "海报",
  product: "产品图",
  p_signboard: "P店招",
  picture_wall: "图片墙",
  detail_page: "详情页",
  brand_story: "品牌故事",
  data_analysis: "数据分析",
  patrol_script: "巡店话术",
};

const CATEGORY_FOR_KIND = {
  avatar: "三件套",
  storefront: "三件套",
  poster: "三件套",
  product: "产品图",
  p_signboard: "其他",
  picture_wall: "其他",
  detail_page: "其他",
  brand_story: "其他",
  data_analysis: "其他",
  patrol_script: "其他",
};

const PLATFORM_LABEL = { meituan: "美团", taobao: "淘宝" };
const LINE_LABEL = {
  line1: "线路1 wlai",
  line2: "线路2 yunwu",
  line3: "线路3 vectorengine",
  line4: "线路4 pockgo",
  line5: "线路5 apimart",
  line6: "线路6 manxiaobai",
};

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

async function runWithConcurrency(items, limit, worker) {
  let next = 0;
  let done = 0;
  const total = items.length;
  const errors = [];
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= total) return;
      try {
        await worker(items[i], i);
      } catch (err) {
        errors.push({ index: i, error: err.message });
      } finally {
        done++;
        if (done % 25 === 0 || done === total) {
          process.stdout.write(`\r  进度 ${done}/${total} (失败 ${errors.length})   `);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => loop()));
  process.stdout.write("\n");
  return errors;
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

async function main() {
  ensureDir(ROOT_OUTPUT);
  ensureDir(SHOP_ROOT);
  ensureDir(ALL_IMAGES_DIR);
  ensureDir(SHOP_DATE_ROOT);
  ensureDir(ALL_IMAGES_DATE_DIR);
  console.log(`导出根目录: ${ROOT_OUTPUT}`);
  console.log(`本次新增图片日期目录: ${EXPORT_DATE_FOLDER}\n`);

  console.log("[1/5] 读取既有 Excel 已导出记录…");
  const { map: existingByUrl, maxSeq } = await readExistingExcel();
  console.log(`  已记录 ${existingByUrl.size} 条，maxSeq=${maxSeq}\n`);

  console.log("[2/5] 从 Supabase 拉取全部 generation_logs…");
  const rows = await fetchAllLogs();
  console.log(`  云端共 ${rows.length} 条记录\n`);

  console.log("[3/5] 计算新增记录…");
  const newRowsRaw = rows.filter((r) => r.oss_url && !existingByUrl.has(r.oss_url));
  // 已经按 created_at DESC 排序（来自 fetchAllLogs），保持批次内 DESC 编号
  newRowsRaw.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  console.log(`  新增 ${newRowsRaw.length} 条（将从 seq ${maxSeq + 1} 开始）\n`);

  const usedAllNames = new Set();
  const usedShopFileNames = new Map();
  // 把既有占用也登记进去，避免新文件名碰撞
  for (const rec of existingByUrl.values()) {
    if (rec.relShopFile) usedShopFileNames.set(path.join(ROOT_OUTPUT, rec.relShopFile).toLowerCase(), true);
    if (rec.relAllFile) usedAllNames.add(path.basename(rec.relAllFile).toLowerCase());
  }

  const newRecords = newRowsRaw.map((row, i) =>
    planNewRecord(row, maxSeq + 1 + i, usedAllNames, usedShopFileNames),
  );

  console.log(`[4/5] 下载新图片（并发 12）…`);
  const errors = await runWithConcurrency(newRecords, 12, async (rec) => {
    if (!fs.existsSync(rec.shopFile)) {
      await downloadFile(rec.oss_url, rec.shopFile);
    }
    if (!fs.existsSync(rec.allFile)) {
      await fs.promises.mkdir(path.dirname(rec.allFile), { recursive: true });
      await fs.promises.copyFile(rec.shopFile, rec.allFile);
    }
  });
  console.log(`  下载完成，失败 ${errors.length} 条\n`);

  console.log("[5/5] 重建 Excel（旧+新合并）…");
  // 合并：旧记录直接复用；新记录按 seq 添加。最终按 seq ASC 排序。
  const allMerged = [];
  for (const rec of existingByUrl.values()) {
    allMerged.push({
      seq: rec.seq,
      shop_name: rec.shop_name,
      category: rec.category,
      kindLabel: rec.kindLabel,
      platformLabel: rec.platformLabel,
      lineLabel: rec.lineLabel,
      createdAt: rec.createdAt,
      oss_url: rec.oss_url,
      relShopFile: rec.relShopFile,
      relAllFile: rec.relAllFile,
      oss_key: rec.oss_key,
    });
  }
  for (const rec of newRecords) {
    allMerged.push({
      seq: rec.seq,
      shop_name: rec.shop_name,
      category: rec.category,
      kindLabel: rec.kindLabel,
      platformLabel: rec.platformLabel,
      lineLabel: rec.lineLabel,
      createdAt: rec.createdAt,
      oss_url: rec.oss_url,
      relShopFile: rec.relShopFile,
      relAllFile: rec.relAllFile,
      oss_key: rec.oss_key,
    });
  }
  allMerged.sort((a, b) => a.seq - b.seq);

  const wb = new ExcelJS.Workbook();
  wb.creator = "csgh-image-studio";
  wb.created = new Date();

  const detail = wb.addWorksheet("全部明细");
  detail.columns = [
    { header: "序号", key: "seq", width: 8 },
    { header: "店铺名称", key: "shop", width: 30 },
    { header: "分类", key: "category", width: 10 },
    { header: "图片类型", key: "kindLabel", width: 10 },
    { header: "平台", key: "platformLabel", width: 8 },
    { header: "线路", key: "lineLabel", width: 18 },
    { header: "生成时间", key: "createdAt", width: 22 },
    { header: "OSS 链接", key: "oss_url", width: 80 },
    { header: "店铺目录内路径", key: "relShopFile", width: 60 },
    { header: "全部图片内路径", key: "relAllFile", width: 50 },
    { header: "OSS Key", key: "oss_key", width: 50 },
  ];
  allMerged.forEach((rec) => {
    detail.addRow({
      seq: rec.seq,
      shop: rec.shop_name,
      category: rec.category,
      kindLabel: rec.kindLabel,
      platformLabel: rec.platformLabel,
      lineLabel: rec.lineLabel,
      createdAt: rec.createdAt,
      oss_url: rec.oss_url,
      relShopFile: rec.relShopFile,
      relAllFile: rec.relAllFile,
      oss_key: rec.oss_key,
    });
  });
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];
  detail.autoFilter = { from: "A1", to: "K1" };

  const byShop = new Map();
  for (const rec of allMerged) {
    const key = rec.shop_name || "(无店铺名)";
    if (!byShop.has(key)) {
      byShop.set(key, {
        shop: key,
        total: 0,
        三件套: 0,
        产品图: 0,
        其他: 0,
        头像: 0,
        店招: 0,
        海报: 0,
        P店招: 0,
        图片墙: 0,
        详情页: 0,
        品牌故事: 0,
        数据分析: 0,
        巡店话术: 0,
      });
    }
    const row = byShop.get(key);
    row.total += 1;
    row[rec.category] = (row[rec.category] || 0) + 1;
    row[rec.kindLabel] = (row[rec.kindLabel] || 0) + 1;
  }

  const shopSheet = wb.addWorksheet("按店铺统计");
  shopSheet.columns = [
    { header: "店铺名称", key: "shop", width: 32 },
    { header: "图片总数", key: "total", width: 10 },
    { header: "三件套", key: "三件套", width: 10 },
    { header: "产品图", key: "产品图", width: 10 },
    { header: "其他", key: "其他", width: 10 },
    { header: "头像", key: "头像", width: 8 },
    { header: "店招", key: "店招", width: 8 },
    { header: "海报", key: "海报", width: 8 },
    { header: "P店招", key: "P店招", width: 8 },
    { header: "图片墙", key: "图片墙", width: 8 },
    { header: "详情页", key: "详情页", width: 8 },
    { header: "品牌故事", key: "品牌故事", width: 10 },
    { header: "数据分析", key: "数据分析", width: 10 },
    { header: "巡店话术", key: "巡店话术", width: 10 },
  ];
  const shopRows = [...byShop.values()].sort((a, b) => b.total - a.total);
  shopRows.forEach((r) => shopSheet.addRow(r));
  shopSheet.getRow(1).font = { bold: true };
  shopSheet.views = [{ state: "frozen", ySplit: 1 }];

  const kindSheet = wb.addWorksheet("按类型统计");
  kindSheet.columns = [
    { header: "图片类型", key: "kind", width: 16 },
    { header: "分类", key: "category", width: 12 },
    { header: "数量", key: "count", width: 12 },
  ];
  const byKind = new Map();
  for (const rec of allMerged) {
    const k = rec.kindLabel;
    if (!byKind.has(k)) byKind.set(k, { kind: k, category: rec.category, count: 0 });
    byKind.get(k).count += 1;
  }
  [...byKind.values()].sort((a, b) => b.count - a.count).forEach((r) => kindSheet.addRow(r));
  kindSheet.getRow(1).font = { bold: true };

  const summary = wb.addWorksheet("总览");
  summary.columns = [
    { header: "项目", key: "item", width: 28 },
    { header: "数值", key: "value", width: 30 },
  ];
  summary.addRow({ item: "记录总数", value: allMerged.length });
  summary.addRow({ item: "店铺数量", value: byShop.size });
  summary.addRow({ item: "三件套总数", value: allMerged.filter((r) => r.category === "三件套").length });
  summary.addRow({ item: "产品图总数", value: allMerged.filter((r) => r.category === "产品图").length });
  summary.addRow({ item: "其他类型总数", value: allMerged.filter((r) => r.category === "其他").length });
  summary.addRow({ item: "本次新增数量", value: newRecords.length });
  summary.addRow({ item: "本次下载失败数量", value: errors.length });
  summary.addRow({ item: "导出生成时间", value: new Date().toISOString() });
  summary.getRow(1).font = { bold: true };

  if (errors.length > 0) {
    const errSheet = wb.addWorksheet("下载失败");
    errSheet.columns = [
      { header: "新增内索引", key: "index", width: 12 },
      { header: "序号", key: "seq", width: 10 },
      { header: "错误信息", key: "error", width: 60 },
      { header: "店铺", key: "shop", width: 24 },
      { header: "类型", key: "kindLabel", width: 12 },
      { header: "OSS 链接", key: "oss_url", width: 80 },
    ];
    errors.forEach((e) => {
      const rec = newRecords[e.index];
      errSheet.addRow({
        index: e.index,
        seq: rec?.seq ?? "",
        error: e.error,
        shop: rec?.shop_name || "",
        kindLabel: rec?.kindLabel || "",
        oss_url: rec?.oss_url || "",
      });
    });
    errSheet.getRow(1).font = { bold: true };
  }

  await wb.xlsx.writeFile(EXCEL_PATH);
  console.log(`  Excel 已生成: ${EXCEL_PATH}\n`);

  console.log("完成 ✓");
  console.log(`  本次新增:    ${newRecords.length} 条（seq ${maxSeq + 1} ~ ${maxSeq + newRecords.length}）`);
  console.log(`  下载失败:    ${errors.length} 条`);
  console.log(`  店铺目录:    ${SHOP_ROOT}`);
  console.log(`  全部图片:    ${ALL_IMAGES_DIR}`);
  console.log(`  本次日期目录: ${EXPORT_DATE_FOLDER}`);
  console.log(`  汇总表格:    ${EXCEL_PATH}`);
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
