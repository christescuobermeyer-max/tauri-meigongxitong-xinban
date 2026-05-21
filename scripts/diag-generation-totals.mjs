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
  // 1) generation_totals 当前值 + updated_at
  const totals = await sql`
    select p.display_name as operator,
           t.user_id,
           t.total_count,
           t.updated_at,
           (select count(*) from public.generation_logs l where l.user_id = t.user_id)::int as logs_7d
    from public.generation_totals t
    join public.profiles p on p.id = t.user_id
    order by t.total_count desc
  `;
  console.log("== generation_totals 现状 ==");
  console.log("运营".padEnd(12), "永久累计", "近7天logs", "updated_at");
  for (const r of totals) {
    console.log(
      String(r.operator).padEnd(12),
      String(r.total_count).padStart(8),
      String(r.logs_7d).padStart(10),
      r.updated_at?.toISOString?.() ?? r.updated_at,
    );
  }
  const sumTotals = totals.reduce((s, r) => s + Number(r.total_count), 0);
  const sumLogs = totals.reduce((s, r) => s + Number(r.logs_7d), 0);
  console.log(`合计`.padEnd(12), String(sumTotals).padStart(8), String(sumLogs).padStart(10));

  // 2) Trigger 是否在
  const trig = await sql`
    select tgname, tgenabled
    from pg_trigger
    where tgname = 'on_generation_log_insert_increment_total'
  `;
  console.log("\n== trigger on_generation_log_insert_increment_total ==");
  console.log(trig.length ? trig : "❌ 不存在");

  // 3) updated_at 最新的几条 + 最近 1 小时是否在涨
  const recent = await sql`
    select p.display_name as operator, t.total_count, t.updated_at
    from public.generation_totals t
    join public.profiles p on p.id = t.user_id
    order by t.updated_at desc
    limit 5
  `;
  console.log("\n== 最近更新的 5 条 ==");
  for (const r of recent) {
    console.log(String(r.operator).padEnd(12), String(r.total_count).padStart(8), r.updated_at);
  }

  // 4) 检查 generation_totals 中是否有任何 user_id 缺失（profiles 有但 totals 没有）
  const missing = await sql`
    select p.id, p.display_name, p.is_active
    from public.profiles p
    left join public.generation_totals t on t.user_id = p.id
    where t.user_id is null
  `;
  console.log("\n== 在 profiles 但没有 generation_totals 行的账号 ==");
  console.log(missing.length ? missing : "(无)");
} finally {
  await sql.end();
}
