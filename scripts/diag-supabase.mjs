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
  const t0 = Date.now();
  const ping = await sql`select now() as ts, current_user, version()`;
  console.log(`[ok] 连接耗时 ${Date.now() - t0}ms`);
  console.log("  数据库时间:", ping[0].ts.toISOString());
  console.log("  当前用户  :", ping[0].current_user);

  console.log("\n[行数 / 表大小]");
  const sizes = await sql`
    select 'generation_logs' as t, count(*)::int as rows, pg_size_pretty(pg_total_relation_size('public.generation_logs')) as size from public.generation_logs
    union all
    select 'profiles', count(*)::int, pg_size_pretty(pg_total_relation_size('public.profiles')) from public.profiles
  `;
  for (const r of sizes) console.log(`  ${r.t}: ${r.rows} 行 / ${r.size}`);

  console.log("\n[最新 5 条 generation_logs 是不是真能写入]");
  const recent = await sql`
    select id, user_id, generation_line, asset_kind, oss_url, created_at
    from public.generation_logs
    order by created_at desc
    limit 5
  `;
  for (const r of recent) {
    console.log(
      `  ${new Date(r.created_at).toISOString()}  ${r.generation_line}  ${r.asset_kind}  ${r.oss_url.slice(0, 80)}…`
    );
  }

  console.log("\n[最近 6 小时每条线路最新一次成功]");
  const last = await sql`
    select generation_line, max(created_at) last_at
    from public.generation_logs
    where created_at >= now() - interval '6 hours'
    group by 1
    order by 1
  `;
  for (const r of last) {
    const min = Math.round((Date.now() - new Date(r.last_at).getTime()) / 60000);
    console.log(`  ${r.generation_line}  ${r.last_at.toISOString()}  (${min}m ago)`);
  }
} finally {
  await sql.end();
}
