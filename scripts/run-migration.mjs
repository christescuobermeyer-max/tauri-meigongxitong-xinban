#!/usr/bin/env node
// 一键执行 supabase/migrations/ 下任一 SQL 迁移文件
// 用法：node scripts/run-migration.mjs <migration-file-relative-path>
// 例：  node scripts/run-migration.mjs supabase/migrations/20260514_add_brand_story_asset_kind.sql

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

// 自动加载 .env.local（避免依赖 dotenv）
const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("❌ 缺少 SUPABASE_DB_URL（在 .env.local 里填好后重跑）");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("❌ 用法：node scripts/run-migration.mjs <migration-file>");
  process.exit(1);
}

const sqlPath = path.resolve(file);
if (!fs.existsSync(sqlPath)) {
  console.error(`❌ 找不到文件：${sqlPath}`);
  process.exit(1);
}

const sqlText = fs.readFileSync(sqlPath, "utf-8");

console.log(`[migrate] 文件：${file}`);
console.log(`[migrate] 字节数：${sqlText.length}`);
console.log(`[migrate] 目标：${dbUrl.replace(/:[^:@]+@/, ":***@")}`);
console.log("");

const sql = postgres(dbUrl, {
  ssl: "require",
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
});

try {
  console.log("[migrate] 连接中…");
  await sql`select 1 as ok`;
  console.log("[migrate] ✓ 连接成功");

  console.log("[migrate] 执行 SQL（事务包裹）…");
  await sql.begin(async (tx) => {
    await tx.unsafe(sqlText);
  });
  console.log("[migrate] ✓ 执行成功");

  console.log("");
  console.log("[migrate] 验证：当前 asset_kind 约束允许的值");
  const rows = await sql`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.generation_logs'::regclass
      and contype = 'c'
  `;
  for (const r of rows) console.log(`  - ${r.conname}: ${r.def}`);

  console.log("");
  console.log("[migrate] 验证：daily_generation_stats 视图字段");
  const cols = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'daily_generation_stats'
    order by ordinal_position
  `;
  console.log("  " + cols.map((c) => c.column_name).join(", "));

  console.log("");
  console.log("✅ 迁移完成");
} catch (error) {
  console.error("❌ 迁移失败：", error.message);
  if (error.detail) console.error("   detail:", error.detail);
  if (error.hint) console.error("   hint:", error.hint);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
