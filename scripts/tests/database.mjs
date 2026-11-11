import { execFile, execFileSync } from "node:child_process";
import { equal } from "node:assert/strict";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "csgh-db-"));
const data = path.join(temporary, "data");
const environment = { ...process.env, PGPASSFILE: path.join(temporary, "no-password-file") };
for (const key of ["PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGPASSWORD"]) delete environment[key];
const binary = (name) => process.env.PG_BINDIR ? path.join(process.env.PG_BINDIR, name) : name;
function run(name, args, input) {
  return execFileSync(binary(name), args, { input, encoding: "utf8", env: environment,
    stdio: ["pipe", "pipe", "pipe"], maxBuffer: 20 * 1024 * 1024 });
}
function sql(source) {
  return run("psql", ["-X", "-h", temporary, "-p", "5432", "-U", "csgh_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], source);
}
let started = false;
try {
  run("initdb", ["-D", data, "-U", "csgh_test", "-A", "trust", "--encoding=UTF8", "--locale=C"]);
  run("pg_ctl", ["-D", data, "-l", path.join(temporary, "postgres.log"), "-o", `-h '' -k '${temporary}' -p 5432`, "-w", "start"]);
  started = true;
  sql(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
    create schema cron;
    create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
  `);
  const schema = readFileSync(path.join(root, "supabase/schema.sql"), "utf8")
    .replace('create extension if not exists "pg_cron";', "");
  const tests = readdirSync(path.join(root, "supabase/tests"))
    .filter((name) => !name.startsWith(".") && name.endsWith(".sql")).sort();
  function verify(label) {
    for (const name of tests) {
      sql(readFileSync(path.join(root, "supabase/tests", name), "utf8"));
      console.log(`通过 ${label}: ${name}`);
    }
  }
  sql(schema);
  verify("完整初始化");
  sql(schema);
  verify("重复初始化");
  sql("alter table public.generation_logs drop column elapsed_ms;");
  sql(readFileSync(path.join(root, "supabase/migrations/20260518_add_generation_elapsed_ms.sql"), "utf8"));
  verify("旧库耗时字段迁移");
  const migration = readFileSync(path.join(root, "supabase/migrations/20261111_generation_archive_idempotency.sql"), "utf8");
  const userId = "44444444-4444-4444-8444-444444444444";
  const insert = `insert into public.generation_logs (user_id, shop_name, asset_kind, platform, oss_url)
    values ('${userId}', '并发测试', 'product', 'meituan', 'https://example.invalid/concurrent.jpg');`;
  sql("drop trigger before_generation_log_claim_archive on public.generation_logs; drop table public.generation_archive_receipts;");
  sql(`insert into auth.users (id, email) values ('${userId}', 'concurrent@example.invalid'); ${insert} ${insert}`);
  sql(migration);
  sql(migration);
  sql(insert);
  equal(sql(`select count(*) = 2 from public.generation_logs where user_id = '${userId}';`).includes(" t"), true);
  equal(sql(`select total_count = 2 from public.generation_totals where user_id = '${userId}';`).includes(" t"), true);
  console.log("通过 历史重复记录保持原样，增量迁移阻止再次累计");
  const concurrentInsert = insert.replace("concurrent.jpg", "concurrent-new.jpg");
  const argumentsForSql = ["-X", "-h", temporary, "-p", "5432", "-U", "csgh_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c"];
  await Promise.all([
    promisify(execFile)(binary("psql"), [...argumentsForSql, `begin; ${concurrentInsert} select pg_sleep(0.2); commit;`], { env: environment }),
    promisify(execFile)(binary("psql"), [...argumentsForSql, concurrentInsert], { env: environment }),
  ]);
  equal(sql(`select total_count = 3 from public.generation_totals where user_id = '${userId}';`).includes(" t"), true);
  console.log("通过 两个数据库连接并发重试仅增加一次统计");
  sql(`delete from auth.users where id = '${userId}';`);
  verify("幂等迁移重复执行");
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(temporary, { recursive: true, force: true });
}
