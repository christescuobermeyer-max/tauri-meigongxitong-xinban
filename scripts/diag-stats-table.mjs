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
  const cols = await sql`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'daily_generation_stats'
    order by ordinal_position
  `;
  console.log("daily_generation_stats 列:");
  for (const c of cols) console.log("  " + c.column_name + " : " + c.data_type);

  const sample = await sql`select * from public.daily_generation_stats limit 3`;
  console.log("样本:", sample);
} finally {
  await sql.end();
}
