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
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  console.log("public 表:");
  for (const t of tables) console.log("  " + t.table_name);

  const minMax = await sql`
    select
      min(created_at) as oldest,
      max(created_at) as newest,
      count(*)::int as total
    from public.generation_logs
  `;
  console.log("\ngeneration_logs 时间范围:", minMax[0]);
} finally {
  await sql.end();
}
