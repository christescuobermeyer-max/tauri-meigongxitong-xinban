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

const ROOT_OUTPUT = path.resolve("数据导出");
const SHOP_ROOT = path.join(ROOT_OUTPUT, "按店铺分类");
const ALL_IMAGES_DIR = path.join(ROOT_OUTPUT, "全部图片");
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
        if (done % 50 === 0 || done === total) {
          process.stdout.write(`\r  进度 ${done}/${total} (失败 ${errors.length})   `);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => loop()));
  process.stdout.write("\n");
  return errors;
}

async function main() {
  ensureDir(ROOT_OUTPUT);
  ensureDir(SHOP_ROOT);
  ensureDir(ALL_IMAGES_DIR);

  console.log("[1/4] 从 Supabase 拉取 generation_logs…");
  const rows = await fetchAllLogs();
  console.log(`  共 ${rows.length} 条记录\n`);

  console.log("[2/4] 规划文件命名与目标路径…");
  const usedAllNames = new Set();
  const usedShopFileNames = new Map();

  const records = rows.map((row, idx) => {
    const kindLabel = ASSET_KIND_LABEL[row.asset_kind] || row.asset_kind;
    const category = CATEGORY_FOR_KIND[row.asset_kind] || "其他";
    const platformLabel = PLATFORM_LABEL[row.platform] || row.platform;
    const lineLabel = LINE_LABEL[row.generation_line] || row.generation_line || "";
    const shop = safeName(row.shop_name);
    const ext = getExtFromUrl(row.oss_url);
    const seq = String(idx + 1).padStart(4, "0");
    const baseName = `${seq}-${kindLabel}.${ext}`;

    const shopDir = path.join(SHOP_ROOT, shop, category);
    let shopFile = path.join(shopDir, baseName);
    const shopKey = shopFile.toLowerCase();
    if (usedShopFileNames.has(shopKey)) {
      shopFile = path.join(shopDir, `${seq}-${kindLabel}-${idx}.${ext}`);
    }
    usedShopFileNames.set(shopFile.toLowerCase(), true);

    let allName = `${seq}-${shop}-${kindLabel}.${ext}`;
    if (usedAllNames.has(allName.toLowerCase())) {
      allName = `${seq}-${shop}-${kindLabel}-${idx}.${ext}`;
    }
    usedAllNames.add(allName.toLowerCase());
    const allFile = path.join(ALL_IMAGES_DIR, allName);

    return {
      ...row,
      kindLabel,
      category,
      platformLabel,
      lineLabel,
      shopSafe: shop,
      shopFile,
      allFile,
      relShopFile: path.relative(ROOT_OUTPUT, shopFile),
      relAllFile: path.relative(ROOT_OUTPUT, allFile),
    };
  });
  console.log(`  目标路径就绪 (${records.length} 项)\n`);

  console.log("[3/4] 下载图片到本地（并发 12）…");
  const errors = await runWithConcurrency(records, 12, async (rec) => {
    if (!fs.existsSync(rec.shopFile)) {
      await downloadFile(rec.oss_url, rec.shopFile);
    }
    if (!fs.existsSync(rec.allFile)) {
      await fs.promises.mkdir(path.dirname(rec.allFile), { recursive: true });
      await fs.promises.copyFile(rec.shopFile, rec.allFile);
    }
  });
  console.log(`  下载完成，失败 ${errors.length} 条\n`);

  console.log("[4/4] 生成 Excel…");
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
  records.forEach((rec, i) => {
    detail.addRow({
      seq: i + 1,
      shop: rec.shop_name,
      category: rec.category,
      kindLabel: rec.kindLabel,
      platformLabel: rec.platformLabel,
      lineLabel: rec.lineLabel,
      createdAt: rec.created_at,
      oss_url: rec.oss_url,
      relShopFile: rec.relShopFile,
      relAllFile: rec.relAllFile,
      oss_key: rec.oss_key || "",
    });
  });
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];
  detail.autoFilter = { from: "A1", to: "K1" };

  const byShop = new Map();
  for (const rec of records) {
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
    { header: "产品图", key: "产品图_count", width: 10 },
    { header: "P店招", key: "P店招", width: 8 },
    { header: "图片墙", key: "图片墙", width: 8 },
    { header: "详情页", key: "详情页", width: 8 },
  ];
  const shopRows = [...byShop.values()].sort((a, b) => b.total - a.total);
  shopRows.forEach((r) => {
    shopSheet.addRow({
      shop: r.shop,
      total: r.total,
      三件套: r.三件套 || 0,
      产品图: r.产品图 || 0,
      其他: r.其他 || 0,
      头像: r.头像 || 0,
      店招: r.店招 || 0,
      海报: r.海报 || 0,
      产品图_count: r.产品图 || 0,
      P店招: r.P店招 || 0,
      图片墙: r.图片墙 || 0,
      详情页: r.详情页 || 0,
    });
  });
  shopSheet.getRow(1).font = { bold: true };
  shopSheet.views = [{ state: "frozen", ySplit: 1 }];

  const kindSheet = wb.addWorksheet("按类型统计");
  kindSheet.columns = [
    { header: "图片类型", key: "kind", width: 16 },
    { header: "分类", key: "category", width: 12 },
    { header: "数量", key: "count", width: 12 },
  ];
  const byKind = new Map();
  for (const rec of records) {
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
  summary.addRow({ item: "记录总数", value: records.length });
  summary.addRow({ item: "店铺数量", value: byShop.size });
  summary.addRow({ item: "三件套总数", value: records.filter((r) => r.category === "三件套").length });
  summary.addRow({ item: "产品图总数", value: records.filter((r) => r.category === "产品图").length });
  summary.addRow({ item: "其他类型总数", value: records.filter((r) => r.category === "其他").length });
  summary.addRow({ item: "下载失败数量", value: errors.length });
  summary.addRow({ item: "导出生成时间", value: new Date().toISOString() });
  summary.getRow(1).font = { bold: true };

  if (errors.length > 0) {
    const errSheet = wb.addWorksheet("下载失败");
    errSheet.columns = [
      { header: "记录索引", key: "index", width: 10 },
      { header: "错误信息", key: "error", width: 60 },
      { header: "店铺", key: "shop", width: 24 },
      { header: "类型", key: "kindLabel", width: 12 },
      { header: "OSS 链接", key: "oss_url", width: 80 },
    ];
    errors.forEach((e) => {
      const rec = records[e.index];
      errSheet.addRow({
        index: e.index,
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
  console.log(`  店铺目录:    ${SHOP_ROOT}`);
  console.log(`  全部图片:    ${ALL_IMAGES_DIR}`);
  console.log(`  汇总表格:    ${EXCEL_PATH}`);
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
