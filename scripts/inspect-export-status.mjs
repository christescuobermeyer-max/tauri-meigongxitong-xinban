// 检查 数据导出/ 当前状态：上次更新到哪一天 + 总行数 + 各运营张数
// 不会修改任何文件，仅供 skill 在跑增量前显示"上次更新时间"

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const ROOT = path.resolve("数据导出");
const EXCEL_PATH = path.join(ROOT, "OSS图片汇总.xlsx");
const OPERATOR_DIR = path.join(ROOT, "按运营分类");
const ATTRIBUTION_CACHE = path.join(ROOT, ".operator-attribution.json");

function fmtBeijingDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // 转北京时区显示
  const beijing = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(beijing.getUTCDate()).padStart(2, "0");
  const hh = String(beijing.getUTCHours()).padStart(2, "0");
  const mm = String(beijing.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function countFilesRecursive(dir) {
  let count = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isFile()) count++;
    else if (e.isDirectory()) count += countFilesRecursive(full);
  }
  return count;
}

async function main() {
  console.log("══════════════════════════════════════════");
  console.log("  数据导出 当前状态");
  console.log("══════════════════════════════════════════\n");

  if (!fs.existsSync(EXCEL_PATH)) {
    console.log("⚠️  未发现 Excel 汇总文件，尚未做过任何导出。");
    console.log(`   预期路径：${EXCEL_PATH}\n`);
    return;
  }

  // 读 Excel：取最大 seq + 最大 created_at
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const sheet = wb.getWorksheet("全部明细");
  if (!sheet) {
    console.log("⚠️  Excel 缺少『全部明细』sheet。");
    return;
  }

  let rowCount = 0;
  let maxSeq = 0;
  let latestIso = null;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    rowCount++;
    const seq = Number(row.getCell(1).value) || 0;
    if (seq > maxSeq) maxSeq = seq;
    const cell7 = row.getCell(7).value;
    let iso = null;
    if (cell7 instanceof Date) iso = cell7.toISOString();
    else if (typeof cell7 === "string") iso = cell7;
    else if (cell7 && typeof cell7 === "object" && "text" in cell7) iso = String(cell7.text);
    if (iso && (!latestIso || iso > latestIso)) latestIso = iso;
  });

  console.log(`📊 Excel 汇总：${EXCEL_PATH}`);
  console.log(`   · 总记录数：${rowCount} 行`);
  console.log(`   · 最大序号：${maxSeq}`);
  console.log(`   · 最新一张生成时间：${fmtBeijingDate(latestIso)}（北京时间）`);
  const days = daysSince(latestIso);
  if (days != null) {
    console.log(`   · 距今：${days} 天`);
  }

  // 按运营分类 / 按店铺分类 现状
  console.log(`\n📁 子目录：`);
  for (const sub of ["全部图片", "按店铺分类", "按运营分类"]) {
    const dir = path.join(ROOT, sub);
    if (!fs.existsSync(dir)) {
      console.log(`   · ${sub}/  ❌ 不存在`);
      continue;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (sub === "全部图片") {
      const files = entries.filter((e) => e.isFile()).length;
      console.log(`   · ${sub}/  ${files} 张原图`);
    } else {
      const dirs = entries.filter((e) => e.isDirectory()).length;
      console.log(`   · ${sub}/  ${dirs} 个分类目录`);
    }
  }

  // 各运营张数（如有）
  if (fs.existsSync(OPERATOR_DIR)) {
    const ops = fs
      .readdirSync(OPERATOR_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (ops.length > 0) {
      console.log(`\n👥 按运营分类现状：`);
      const stats = [];
      for (const op of ops) {
        const opDir = path.join(OPERATOR_DIR, op);
        let shopCount = 0;
        for (const shopEntry of fs.readdirSync(opDir, { withFileTypes: true })) {
          if (shopEntry.isDirectory()) shopCount++;
        }
        const total = countFilesRecursive(opDir);
        stats.push({ op, total, shopCount });
      }
      stats.sort((a, b) => b.total - a.total);
      for (const s of stats) {
        console.log(`   · ${s.op.padEnd(12, " ")} ${String(s.total).padStart(5, " ")} 张 · ${s.shopCount} 家店铺`);
      }
    }
  }

  // 归属缓存
  if (fs.existsSync(ATTRIBUTION_CACHE)) {
    const stat = fs.statSync(ATTRIBUTION_CACHE);
    const obj = JSON.parse(fs.readFileSync(ATTRIBUTION_CACHE, "utf-8"));
    const count = Object.keys(obj.attributions || obj).length;
    console.log(`\n🗃️  归属缓存：${count} 条`);
    console.log(`   · 缓存文件更新时间：${fmtBeijingDate(stat.mtime.toISOString())}`);
  }

  console.log("\n══════════════════════════════════════════");
  console.log("  建议：继续运行 increments 拉取新图 + 按运营重分类");
  console.log("══════════════════════════════════════════");
}

main().catch((err) => {
  console.error("[inspect] 失败：", err);
  process.exit(1);
});
