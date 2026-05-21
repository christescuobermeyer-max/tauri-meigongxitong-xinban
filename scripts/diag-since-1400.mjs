import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const envPath = path.resolve(".env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
try {
  // Shanghai 14:00 = UTC 06:00
  const cutStart = "2026-05-21T06:00:00Z";
  console.log(`时间窗口（上海）: 14:00 至现在`);
  console.log(`UTC cutoff: ${cutStart}\n`);

  console.log("== 各线路成功生图数（DB confirmed） ==");
  const byLine = await sql`
    select coalesce(generation_line, '(空)') as line, count(*)::int as cnt
    from public.generation_logs
    where created_at >= ${cutStart}
    group by 1 order by 2 desc
  `;
  let total = 0;
  for (const r of byLine) { console.log(`  ${r.line.padEnd(10)} ${r.cnt}`); total += r.cnt; }
  console.log(`  合计       ${total}\n`);

  console.log("== 每运营 × 线路 ==");
  const byUserLine = await sql`
    select p.display_name as op, coalesce(l.generation_line, '(空)') as line, count(*)::int as cnt
    from public.generation_logs l join public.profiles p on p.id = l.user_id
    where l.created_at >= ${cutStart}
    group by 1, 2 order by 1, 2
  `;
  const opTotals = new Map();
  let lastOp = "";
  for (const r of byUserLine) {
    if (r.op !== lastOp) { if (lastOp) console.log(""); console.log(`[${r.op}]`); lastOp = r.op; }
    console.log(`  ${r.line.padEnd(10)} ${r.cnt}`);
    opTotals.set(r.op, (opTotals.get(r.op) || 0) + r.cnt);
  }
  console.log("\n== 运营汇总 ==");
  [...opTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([op, c]) => console.log(`  ${op.padEnd(12)} ${c}`));

  console.log("\n== 每小时分布（上海时区） ==");
  const byHour = await sql`
    select to_char(created_at at time zone 'Asia/Shanghai', 'HH24') as hour,
           coalesce(generation_line, '(空)') as line, count(*)::int as cnt
    from public.generation_logs
    where created_at >= ${cutStart}
    group by 1, 2 order by 1, 2
  `;
  const hourPivot = new Map();
  const linesSet = new Set();
  for (const r of byHour) {
    if (!hourPivot.has(r.hour)) hourPivot.set(r.hour, {});
    hourPivot.get(r.hour)[r.line] = r.cnt;
    linesSet.add(r.line);
  }
  const lineList = [...linesSet].sort();
  console.log("  小时   " + lineList.map((l) => l.padStart(8)).join(""));
  for (const [h, m] of [...hourPivot.entries()].sort()) {
    console.log(`  ${h}:00  ` + lineList.map((l) => String(m[l] ?? 0).padStart(8)).join(""));
  }

  console.log("\n== 与上午 09:00-10:20 窗口的对照（部署前 baseline） ==");
  const baseline = await sql`
    select coalesce(generation_line, '(空)') as line, count(*)::int as cnt
    from public.generation_logs
    where created_at >= '2026-05-21T01:00:00Z' and created_at < '2026-05-21T02:20:00Z'
    group by 1 order by 2 desc
  `;
  console.log("  上午 baseline:");
  let bt = 0;
  for (const r of baseline) { console.log(`    ${r.line.padEnd(10)} ${r.cnt}`); bt += r.cnt; }
  console.log(`    合计       ${bt}`);

  // 一些"用户层成功率"难直接算（DB 只有成功记录），但可以看 retry 次数
  console.log("\n== retry / attempt 字段（generation_logs 里没有 attempt 列了，跳过；详见 journal） ==");
} finally {
  await sql.end();
}
