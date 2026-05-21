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
      coalesce(p.display_name, '(未知运营)') as operator,
      l.user_id,
      count(*)::int as cnt
    from public.generation_logs l
    left join public.profiles p on p.id = l.user_id
    group by 1, 2
    order by cnt desc
  `;
  console.log(`运营数量: ${rows.length}`);
  for (const r of rows) console.log(`${r.operator.padEnd(20)} ${String(r.cnt).padStart(6)}  ${r.user_id ?? ''}`);
} finally {
  await sql.end();
}
