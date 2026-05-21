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
    with logs_now as (
      select user_id, count(*)::int as cnt
      from public.generation_logs
      group by user_id
    ),
    stats_sum as (
      select user_id, sum(total_count)::int as cnt
      from public.daily_generation_stats
      group by user_id
    )
    select p.id, p.display_name,
           coalesce(s.cnt, 0) as from_stats_sum,
           coalesce(l.cnt, 0) as from_logs_now,
           greatest(coalesce(s.cnt, 0), coalesce(l.cnt, 0)) as best_baseline
    from public.profiles p
    left join stats_sum s on s.user_id = p.id
    left join logs_now  l on l.user_id = p.id
    where coalesce(s.cnt, 0) + coalesce(l.cnt, 0) > 0
    order by best_baseline desc
  `;
  console.log("运营".padEnd(12), "stats累加(可作基线)", "现存7天logs", "建议基线");
  let sumStats = 0, sumLogs = 0, sumBest = 0;
  for (const r of rows) {
    console.log(
      String(r.display_name).padEnd(12),
      String(r.from_stats_sum).padStart(16),
      String(r.from_logs_now).padStart(12),
      String(r.best_baseline).padStart(8),
    );
    sumStats += Number(r.from_stats_sum);
    sumLogs += Number(r.from_logs_now);
    sumBest += Number(r.best_baseline);
  }
  console.log("合计".padEnd(12), String(sumStats).padStart(16), String(sumLogs).padStart(12), String(sumBest).padStart(8));

  const range = await sql`
    select min(stat_day) as oldest, max(stat_day) as newest from public.daily_generation_stats
  `;
  console.log("\ndaily_generation_stats 覆盖范围:", range[0]);
} finally {
  await sql.end();
}
