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
  // 时间窗口：今天上海 0:00 ~ 10:20 = UTC 2026-05-20 16:00 ~ 2026-05-21 02:20
  const cutStart = "2026-05-20T16:00:00Z";
  const cutEnd = "2026-05-21T02:20:00Z";

  console.log(`时间窗口（上海）: 今天 00:00 ~ 10:20`);
  console.log(`UTC: ${cutStart} ~ ${cutEnd}\n`);

  // 1. 每线路成功生图数
  const byLine = await sql`
    select coalesce(generation_line, '(空)') as line, count(*)::int as cnt
    from public.generation_logs
    where created_at >= ${cutStart} and created_at < ${cutEnd}
    group by 1
    order by 2 desc
  `;
  console.log("== 各线路成功数（仅成功归档到 OSS） ==");
  for (const r of byLine) console.log(`  ${r.line.padEnd(10)} ${r.cnt}`);
  const total = byLine.reduce((s, r) => s + r.cnt, 0);
  console.log(`  合计       ${total}\n`);

  // 2. 每用户 + 线路
  const byUserLine = await sql`
    select p.display_name as op,
           coalesce(l.generation_line, '(空)') as line,
           count(*)::int as cnt
    from public.generation_logs l
    join public.profiles p on p.id = l.user_id
    where l.created_at >= ${cutStart} and l.created_at < ${cutEnd}
    group by 1, 2
    order by 1, 2
  `;
  console.log("== 每运营 × 线路 ==");
  let lastOp = "";
  for (const r of byUserLine) {
    if (r.op !== lastOp) {
      if (lastOp) console.log("");
      console.log(`[${r.op}]`);
      lastOp = r.op;
    }
    console.log(`  ${r.line.padEnd(10)} ${r.cnt}`);
  }

  // 3. 每小时分布
  console.log("\n== 每小时成功数（上海时区） ==");
  const byHour = await sql`
    select
      to_char(created_at at time zone 'Asia/Shanghai', 'HH24') as hour,
      coalesce(generation_line, '(空)') as line,
      count(*)::int as cnt
    from public.generation_logs
    where created_at >= ${cutStart} and created_at < ${cutEnd}
    group by 1, 2
    order by 1, 2
  `;
  const hourPivot = new Map();
  const lines = new Set();
  for (const r of byHour) {
    if (!hourPivot.has(r.hour)) hourPivot.set(r.hour, {});
    hourPivot.get(r.hour)[r.line] = r.cnt;
    lines.add(r.line);
  }
  const lineList = [...lines].sort();
  console.log("  小时  " + lineList.map((l) => l.padStart(8)).join(""));
  for (const [h, m] of [...hourPivot.entries()].sort()) {
    console.log(
      `  ${h}:00 ` + lineList.map((l) => String(m[l] ?? 0).padStart(8)).join(""),
    );
  }

  // 4. line4 在过去 24 小时有多少成功？
  console.log("\n== line4 最近 24 小时活跃度 ==");
  const line4 = await sql`
    select date_trunc('hour', created_at at time zone 'Asia/Shanghai') as hour,
           count(*)::int as cnt
    from public.generation_logs
    where generation_line = 'line4'
      and created_at >= now() - interval '24 hours'
    group by 1
    order by 1 desc
  `;
  if (line4.length === 0) console.log("  ⚠ 过去 24 小时 line4 0 张成功");
  else for (const r of line4) console.log(`  ${r.hour.toISOString()}  ${r.cnt}`);

  // 5. line4 历史最近 1 条成功记录
  const lastLine4 = await sql`
    select l.created_at, p.display_name as op, l.shop_name
    from public.generation_logs l
    join public.profiles p on p.id = l.user_id
    where l.generation_line = 'line4'
    order by l.created_at desc
    limit 3
  `;
  console.log("\n== line4 最近 3 条成功（如果有） ==");
  if (lastLine4.length === 0) console.log("  ⚠ 数据库里没有 line4 任何成功记录");
  else for (const r of lastLine4) console.log(`  ${r.created_at.toISOString()}  ${r.op}  ${r.shop_name}`);
} finally {
  await sql.end();
}
