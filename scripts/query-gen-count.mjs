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
  const rows = await sql`
    select
      to_char(created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as day,
      count(*)::int as cnt,
      count(distinct user_id)::int as users
    from public.generation_logs
    where created_at >= '2026-05-17'
    group by 1
    order by 1
  `;
  for (const r of rows) console.log(`${r.day}  生图 ${r.cnt} 张  / 活跃用户 ${r.users}`);
} finally {
  await sql.end();
}
