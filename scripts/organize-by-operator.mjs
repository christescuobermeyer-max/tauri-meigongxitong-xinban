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

async function runWithConcurrency(items, limit, worker) {
  let next = 0;
  let done = 0;
  const total = items.length;
  const errors = [];
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= total) return;
      try { await worker(items[i], i); }
      catch (err) { errors.push({ index: i, error: err.message }); }
      finally {
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
  console.log("[1/6] 加载本地持久化归属缓存 + 扫盘 bootstrap…");
  const cache = loadAttributionCache();
  console.log(`  缓存里已有 ${cache.size} 条归属`);
  const diskAttribution = bootstrapFromOperatorDir();
  console.log(`  从 按运营分类/ 扫到 ${diskAttribution.size} 个已分类文件\n`);

  console.log("[2/6] 查询 Supabase 当前还能查到的归属…");
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 4 });
  let dbRows;
  try {
    dbRows = await sql`
      select l.oss_url, coalesce(p.display_name, '(未知运营)') as operator
      from public.generation_logs l
      left join public.profiles p on p.id = l.user_id
    `;
  } finally {
    await sql.end();
  }
  const pathToOp = new Map();
  for (const r of dbRows) pathToOp.set(urlPath(r.oss_url), r.operator);
  console.log(`  云端 ${dbRows.length} 条，去重 pathname ${pathToOp.size} 条\n`);

  console.log("[3/6] 读 Excel 全部明细…");
  if (!fs.existsSync(EXCEL_PATH)) { console.error("找不到 Excel"); process.exit(1); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const sheet = wb.getWorksheet("全部明细");
  if (!sheet) { console.error("找不到 全部明细 sheet"); process.exit(1); }

  const records = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const seq = Number(row.getCell(1).value) || 0;
    const shop = String(row.getCell(2).value ?? "");
    const category = String(row.getCell(3).value ?? "");
    const kindLabel = String(row.getCell(4).value ?? "");
    const platformLabel = String(row.getCell(5).value ?? "");
    const lineLabel = String(row.getCell(6).value ?? "");
    const createdAtVal = row.getCell(7).value;
    const createdAt = createdAtVal instanceof Date ? createdAtVal.toISOString() : String(createdAtVal ?? "");
    const ossUrlCell = row.getCell(8).value;
    const oss_url =
      ossUrlCell && typeof ossUrlCell === "object" && "text" in ossUrlCell
        ? ossUrlCell.text
        : ossUrlCell && typeof ossUrlCell === "object" && "hyperlink" in ossUrlCell
          ? ossUrlCell.hyperlink
          : String(ossUrlCell ?? "");
    const relShopFile = String(row.getCell(9).value ?? "");
    if (!oss_url || !relShopFile) return;
    records.push({ seq, shop, category, kindLabel, platformLabel, lineLabel, createdAt, oss_url, relShopFile });
  });
  console.log(`  Excel 共 ${records.length} 行\n`);

  console.log("[4/6] 解析归属：Supabase > 缓存 > 磁盘 bootstrap …");
  // 三级回退：Supabase 当前归属 > 持久化缓存 > 磁盘扫描（首次启用兼容老数据）
  let fromSupabase = 0, fromCache = 0, fromDisk = 0;
  const attrib = records
    .map((r) => {
      const ossPath = urlPath(r.oss_url);
      let operator = pathToOp.get(ossPath);
      let source = "supabase";
      if (operator) {
        fromSupabase += 1;
      } else if (cache.has(ossPath)) {
        operator = cache.get(ossPath);
        source = "cache";
        fromCache += 1;
      } else if (diskAttribution.has(r.relShopFile)) {
        operator = diskAttribution.get(r.relShopFile);
        source = "disk";
        fromDisk += 1;
      }
      // 更新缓存（无论来源都写入，磁盘 bootstrap 出来的归属也写进缓存）
      if (operator) cache.set(ossPath, operator);
      return { ...r, operator, source };
    })
    .filter((r) => r.operator);

  console.log(`  可归属 ${attrib.length} / ${records.length} 条`);
  console.log(`    来自 Supabase: ${fromSupabase}（最新，永远优先）`);
  console.log(`    来自本地缓存: ${fromCache}（DB 已清理但缓存留底）`);
  console.log(`    来自磁盘 bootstrap: ${fromDisk}（首次启用缓存时从既有目录反推）`);
  const missing = records.length - attrib.length;
  console.log(`  无归属 ${missing} 条（DB 已清理且缓存/磁盘也无）\n`);

  saveAttributionCache(cache);
  console.log(`  归属缓存已写回: ${ATTRIBUTION_CACHE_PATH}\n`);

  console.log("[5/6] 复制新归属文件到 按运营分类/…");
  const copyPlans = attrib.map((r) => {
    const operatorSafe = safeName(r.operator);
    const src = path.join(ROOT_OUTPUT, r.relShopFile);
    const baseName = path.basename(r.relShopFile);
    const dateFolder = relShopFileDateFolder(r.relShopFile);
    const dst = dateFolder
      ? path.join(OPERATOR_ROOT, dateFolder, operatorSafe, safeName(r.shop), r.category || "其他", baseName)
      : path.join(OPERATOR_ROOT, operatorSafe, safeName(r.shop), r.category || "其他", baseName);
    return { ...r, operatorSafe, src, dst };
  });

  // 预检查：源文件是否存在
  let srcMissing = 0;
  for (const p of copyPlans) {
    if (!fs.existsSync(p.src)) srcMissing += 1;
  }
  if (srcMissing > 0) console.log(`  ⚠ 源文件缺失 ${srcMissing} 条（将跳过）`);

  const errors = await runWithConcurrency(copyPlans, 16, async (p) => {
    if (!fs.existsSync(p.src)) throw new Error(`源文件不存在: ${p.relShopFile}`);
    if (fs.existsSync(p.dst)) return;
    await fs.promises.mkdir(path.dirname(p.dst), { recursive: true });
    await fs.promises.copyFile(p.src, p.dst);
  });
  console.log(`  完成，失败 ${errors.length} 条\n`);
  if (errors.length > 0) {
    console.log("  复制失败明细：");
    for (const e of errors) {
      const rec = copyPlans[e.index];
      console.log(
        `    seq=${rec?.seq ?? ""} 店铺=${rec?.shop || ""} 分类=${rec?.category || ""} 路径=${rec?.relShopFile || ""} 错误=${e.error}`,
      );
    }
    console.log("");
  }

  console.log("[6/6] 在 Excel 追加 按运营统计 sheet…");
  // 移除既有同名 sheet（如果有），重新生成
  const existing = wb.getWorksheet("按运营统计");
  if (existing) wb.removeWorksheet(existing.id);
  const opSheet = wb.addWorksheet("按运营统计");
  opSheet.columns = [
    { header: "运营", key: "operator", width: 18 },
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
    { header: "店铺数量", key: "shops", width: 10 },
  ];
  const byOp = new Map();
  for (const r of attrib) {
    if (!byOp.has(r.operator)) byOp.set(r.operator, { operator: r.operator, total: 0, shops: new Set() });
    const row = byOp.get(r.operator);
    row.total += 1;
    row[r.category] = (row[r.category] || 0) + 1;
    row[r.kindLabel] = (row[r.kindLabel] || 0) + 1;
    row.shops.add(r.shop);
  }
  const opRows = [...byOp.values()].sort((a, b) => b.total - a.total);
  for (const r of opRows) {
    opSheet.addRow({
      operator: r.operator,
      total: r.total,
      三件套: r.三件套 || 0,
      产品图: r.产品图 || 0,
      其他: r.其他 || 0,
      头像: r.头像 || 0,
      店招: r.店招 || 0,
      海报: r.海报 || 0,
      P店招: r.P店招 || 0,
      图片墙: r.图片墙 || 0,
      详情页: r.详情页 || 0,
      品牌故事: r.品牌故事 || 0,
      数据分析: r.数据分析 || 0,
      巡店话术: r.巡店话术 || 0,
      shops: r.shops.size,
    });
  }
  opSheet.getRow(1).font = { bold: true };
  opSheet.views = [{ state: "frozen", ySplit: 1 }];

  await wb.xlsx.writeFile(EXCEL_PATH);
  console.log(`  Excel 已更新\n`);

  console.log("完成 ✓");
  console.log(`  按运营分类根目录:  ${OPERATOR_ROOT}`);
  for (const r of opRows) console.log(`    ${r.operator.padEnd(12)}  ${r.total} 张，${r.shops.size} 家店铺`);
  if (missing > 0) console.log(`  无法归属（保留在 按店铺分类）:  ${missing} 条`);
  if (errors.length > 0) console.log(`  复制失败:  ${errors.length} 条`);
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
