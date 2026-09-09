import { equal, ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const gatewayUrl = new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url);
const docsUrl = new URL("../docs/reference/账号生图统计API对接说明.md", import.meta.url);

equal(existsSync(fileURLToPath(gatewayUrl)), true);
const gatewaySource = readFileSync(gatewayUrl, "utf8");

ok(
  gatewaySource.includes("/api/admin/account-generation-summary"),
  "网关应暴露账号生图统计接口"
);
ok(
  gatewaySource.includes("admin_account_generation_summary"),
  "网关应实现账号生图统计 handler"
);
const handlerMatch = gatewaySource.match(
  /async fn admin_account_generation_summary[\s\S]*?async fn fetch_account_generation_profiles/
);
ok(handlerMatch, "应能定位账号生图统计 handler");
const handlerSource = handlerMatch![0];
equal(
  handlerSource.includes("verify_access_token"),
  false,
  "账号生图统计接口不应要求登录态"
);
equal(
  handlerSource.includes("ensure_admin_profile"),
  false,
  "账号生图统计接口不应要求管理员身份"
);
equal(
  handlerSource.includes("bearer_token"),
  false,
  "账号生图统计接口不应读取 Authorization Bearer"
);
ok(
  handlerSource.includes("service_role_bearer"),
  "账号生图统计接口应使用网关服务端 service role 只读查询"
);
ok(
  gatewaySource.includes("AccountGenerationSummaryResponse"),
  "账号生图统计接口应有明确响应结构"
);
ok(
  gatewaySource.includes("generation_totals?select=user_id,total_count"),
  "累计生图总张数应读取永久累计表 generation_totals"
);
ok(
  gatewaySource.includes("generation_monthly_totals?select=user_id,month_count"),
  "本月已生图总张数应读取持久月度累计表 generation_monthly_totals"
);
ok(
  gatewaySource.includes("current_shanghai_month_range"),
  "本月统计窗口应按 Asia/Shanghai 月份计算"
);
ok(
  gatewaySource.includes("deleted_at=is.null"),
  "接口默认只返回未删除账号"
);

equal(existsSync(fileURLToPath(docsUrl)), true, "应提供新 Web 页面可直接使用的对接文档");
const docsSource = readFileSync(docsUrl, "utf8");
ok(docsSource.includes("GET /api/admin/account-generation-summary"));
ok(docsSource.includes("无需登录"));
equal(docsSource.includes("Authorization: Bearer"), false);
equal(docsSource.includes("supabase.auth.getSession"), false);
ok(docsSource.includes("total_count"));
ok(docsSource.includes("month_count"));
ok(docsSource.includes("month_start"));
ok(docsSource.includes("month_end"));
ok(docsSource.includes("generation_monthly_totals"));
ok(docsSource.includes("curl"));

const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../supabase/migrations/20260709_add_generation_monthly_totals.sql", import.meta.url),
  "utf8"
);
ok(schemaSource.includes("create table if not exists public.generation_monthly_totals"));
ok(schemaSource.includes("deleted_at      timestamptz"));
ok(schemaSource.includes("increment_generation_counters"));
ok(schemaSource.includes("on_generation_log_insert_increment_counters"));
ok(schemaSource.includes("date_trunc('month', new.created_at at time zone 'Asia/Shanghai')"));
ok(migrationSource.includes("create table if not exists public.generation_monthly_totals"));
ok(migrationSource.includes("insert into public.generation_monthly_totals"));
ok(migrationSource.includes("on_generation_log_insert_increment_counters"));
