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
  console.log("=== 最近 1 小时各线路成功落库量 ===");
  const last1h = await sql`
    select
      coalesce(generation_line, '(null)') as line,
      count(*)::int as cnt,
      count(distinct user_id)::int as users,
      max(created_at) as last_at
    from public.generation_logs
    where created_at >= now() - interval '1 hour'
    group by 1
    order by 1
  `;
  for (const r of last1h) {
    const ts = r.last_at ? new Date(r.last_at).toISOString() : "—";
    console.log(`  ${r.line}  ${r.cnt} 张 / ${r.users} 用户 / 最近 ${ts}`);
  }
  if (last1h.length === 0) console.log("  （无任何记录）");

  console.log("\n=== 最近 6 小时按小时切片 ===");
  const slice = await sql`
    select
      to_char(date_trunc('hour', created_at at time zone 'Asia/Shanghai'), 'MM-DD HH24:00') as hour,
      coalesce(generation_line, '(null)') as line,
      count(*)::int as cnt
    from public.generation_logs
    where created_at >= now() - interval '6 hours'
    group by 1, 2
    order by 1, 2
  `;
  const grid = new Map();
  const lines = new Set();
  for (const r of slice) {
    lines.add(r.line);
    if (!grid.has(r.hour)) grid.set(r.hour, new Map());
    grid.get(r.hour).set(r.line, r.cnt);
  }
  const lineCols = [...lines].sort();
  const head = ["小时", ...lineCols].join("\t");
  console.log("  " + head);
  for (const [hour, m] of [...grid.entries()].sort()) {
    const row = [hour, ...lineCols.map((l) => String(m.get(l) || 0))];
    console.log("  " + row.join("\t"));
  }

  console.log("\n=== 今日（截止现在）各线路汇总 ===");
  const today = await sql`
    select
      coalesce(generation_line, '(null)') as line,
      count(*)::int as cnt
    from public.generation_logs
    where (created_at at time zone 'Asia/Shanghai')::date
        = (now() at time zone 'Asia/Shanghai')::date
    group by 1
    order by 1
  `;
  for (const r of today) console.log(`  ${r.line}  ${r.cnt} 张`);

  console.log("\n=== 每条线路最近一次成功的时间 ===");
  const lastSeen = await sql`
    select
      coalesce(generation_line, '(null)') as line,
      max(created_at) as last_at
    from public.generation_logs
    group by 1
    order by 1
  `;
  for (const r of lastSeen) {
    const diffMin = Math.round((Date.now() - new Date(r.last_at).getTime()) / 60000);
    console.log(`  ${r.line}  ${r.last_at.toISOString()}  (${diffMin} 分钟前)`);
  }
} finally {
  await sql.end();
}
