import { ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
const start = schema.indexOf("create or replace function public.cleanup_expired_generation_logs(");
const cleanup = schema.slice(start, schema.indexOf("-- 6.", start));
ok(cleanup.includes("revoke all on function public.cleanup_expired_generation_logs(timestamptz) from authenticated"), "普通用户不能执行全库历史清理");
ok(cleanup.includes("revoke all on function public.cleanup_expired_generation_logs(timestamptz) from anon"), "匿名用户不能执行全库历史清理");
ok(/where created_at < \(now\(\) - interval '7 days'\)/.test(cleanup), "截止时间必须由数据库时钟计算");
ok(!/where created_at < p_cutoff/.test(cleanup), "调用参数不能扩大清理范围");

const history = readFileSync(new URL("../../src/lib/cloud-history.ts", import.meta.url), "utf8");
ok(!history.includes('supabase.rpc("cleanup_expired_generation_logs"'), "客户端不应执行全库清理 RPC");
const migration = readFileSync(new URL("../../supabase/migrations/20260930_harden_generation_cleanup.sql", import.meta.url), "utf8");
ok(migration.includes("from authenticated"));
ok(migration.includes("from anon"));
console.log("历史清理安全边界验证通过");
