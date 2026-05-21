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
    select l.oss_key, l.oss_url, l.user_id, p.display_name
    from public.generation_logs l
    left join public.profiles p on p.id = l.user_id
    order by random()
    limit 10
  `;
  for (const r of rows) {
    console.log(`[${r.display_name}] key=${r.oss_key}`);
    console.log(`  url=${r.oss_url}`);
  }
} finally {
  await sql.end();
}
