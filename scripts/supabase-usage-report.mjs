import postgres from "postgres";
import {
  FREE_PLAN_DATABASE_LIMIT_BYTES,
  estimateFreePlanCapacity,
  formatBytes,
  getUsageLevel,
} from "./lib/supabase-usage-estimator.mjs";

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const dailyGenerationTarget = Number(process.env.DAILY_GENERATION_TARGET || 1000);
const retentionDays = Number(process.env.HISTORY_RETENTION_DAYS || 7);

if (!dbUrl) {
  console.error("缺少 SUPABASE_DB_URL 或 DATABASE_URL，请传入 Supabase Session Pooler/Postgres 连接串。");
  process.exit(1);
}

const sql = postgres(dbUrl, {
  ssl: "require",
  max: 1,
  idle_timeout: 5,
  connect_timeout: 20,
});

try {
  const [database] = await sql`
    select
      pg_database_size(current_database())::bigint as database_size_bytes,
      pg_size_pretty(pg_database_size(current_database())) as database_size
  `;
  const [logs] = await sql`
    select
      count(*)::bigint as total_rows,
      count(*) filter (where created_at >= now() - interval '1 day')::bigint as last_24h,
      count(*) filter (where created_at >= now() - interval '7 day')::bigint as last_7d,
      coalesce(round(avg(pg_column_size(generation_logs))::numeric, 2), 1250) as avg_row_bytes
    from public.generation_logs
  `;
  const [cron] = await sql`
    select exists(
      select 1
      from cron.job
      where command ilike '%cleanup_expired_generation_logs%'
        and active = true
    ) as cleanup_job_active
  `;

  const estimate = estimateFreePlanCapacity({
    databaseSizeBytes: Number(database.database_size_bytes),
    averageGenerationLogBytes: Number(logs.avg_row_bytes),
    dailyGenerationTarget,
    retentionDays,
  });
  const level = getUsageLevel(estimate.estimatedDatabaseBytes, FREE_PLAN_DATABASE_LIMIT_BYTES);

  console.log("Supabase 免费版容量检查");
  console.log(`当前数据库大小：${database.database_size}`);
  console.log(`免费版数据库上限：${formatBytes(FREE_PLAN_DATABASE_LIMIT_BYTES)}`);
  console.log(`当前生图记录：${logs.total_rows} 条，近 24 小时：${logs.last_24h} 条，近 7 天：${logs.last_7d} 条`);
  console.log(`按 ${dailyGenerationTarget} 张/天、保留 ${retentionDays} 天估算：${estimate.estimatedRowsWithinRetention} 条记录`);
  console.log(`估算稳定数据库占用：${formatBytes(Math.round(estimate.estimatedDatabaseBytes))}`);
  console.log(`7 天自动清理任务：${cron.cleanup_job_active ? "已启用" : "未检测到"}`);
  console.log(`风险等级：${getUsageLevelLabel(level)}`);
} finally {
  await sql.end({ timeout: 5 });
}

function getUsageLevelLabel(level) {
  if (level === "danger") return "高风险，请升级或清理数据";
  if (level === "warning") return "注意，建议持续观察";
  return "安全";
}
