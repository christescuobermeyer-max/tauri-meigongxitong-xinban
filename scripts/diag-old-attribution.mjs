import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import ExcelJS from "exceljs";

const envPath = path.resolve(".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// Date range of stats
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
try {
  const statsRange = await sql`
    select min(stat_day) as oldest, max(stat_day) as newest, count(*)::int as rows
    from public.daily_generation_stats
  `;
  console.log("daily_generation_stats 日期范围:", statsRange[0]);

  // Date range of "old" Excel records (created_at < 2026-05-14)
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve("数据导出/OSS图片汇总.xlsx"));
  const sheet = wb.getWorksheet("全部明细");
  const oldRecords = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const seq = Number(row.getCell(1).value) || 0;
    const createdAt = row.getCell(7).value;
    const iso = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? "");
    if (seq >= 1 && seq <= 3787) oldRecords.push({ seq, iso });
  });
  const days = new Map();
  for (const r of oldRecords) {
    const day = r.iso.slice(0, 10);
    days.set(day, (days.get(day) || 0) + 1);
  }
  console.log(`\n旧记录共 ${oldRecords.length} 条，按日期分布:`);
  const sorted = [...days.entries()].sort();
  for (const [d, c] of sorted) console.log(`  ${d}: ${c}`);
  const oldDays = sorted.map(([d]) => d);

  // Cross-reference stats coverage of those days
  if (oldDays.length === 0) { console.log("(无旧记录)"); process.exit(0); }
  const oldest = oldDays[0];
  const newest = oldDays[oldDays.length - 1];
  const statRows = await sql`
    select stat_day, user_id, total_count
    from public.daily_generation_stats
    where stat_day >= ${oldest} and stat_day <= ${newest}
    order by stat_day, user_id
  `;
  // group by day
  const statByDay = new Map();
  for (const r of statRows) {
    const d = r.stat_day.toISOString().slice(0, 10);
    if (!statByDay.has(d)) statByDay.set(d, []);
    statByDay.get(d).push({ user_id: r.user_id, total: Number(r.total_count) });
  }
  console.log("\n旧记录日期 → stats 中的运营活跃情况:");
  for (const d of oldDays) {
    const ops = statByDay.get(d) || [];
    const summary = ops.map((o) => `${o.user_id.slice(0, 8)}=${o.total}`).join(", ");
    console.log(`  ${d}  Excel=${days.get(d)}  stats=[${ops.length} 人] ${summary}`);
  }
} finally {
  await sql.end();
}
