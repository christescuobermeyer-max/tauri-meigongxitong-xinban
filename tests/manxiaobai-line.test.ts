import { ok } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

function read(path: string) {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const typesSource = read("src/types.ts");
const topbarSource = read("src/components/TopBarStatus.tsx");
const supabaseSource = read("src/lib/supabase.ts");
const historySource = read("src/lib/history.ts");
const historyPanelSource = read("src/components/HistoryPanel.tsx");
const adminLogListSource = read("src/components/admin/AdminGenerationLogList.tsx");
const adminFiltersSource = read("src/lib/admin-log-filters.ts");
const schemaSource = read("supabase/schema.sql");
const migrationSource = read("supabase/migrations/20260519_add_generation_line6.sql");
const providerSource = read("src-tauri/src/image_provider.rs");
const apiSource = read("src-tauri/src/api.rs");
const editSource = read("src-tauri/src/manxiaobai_edit.rs");
const lineHealthRsSource = read("src-tauri/src/line_health.rs");
const lineHealthTsSource = read("src/lib/line-health.ts");
const validationSource = read("src-tauri/src/api_validation.rs");
const generationSizeSource = read("src/lib/generation-size.ts");
const gatewayLimiterSource = read("src-tauri/src/gateway_limiter.rs");
const frontendBalanceSource = read("src/lib/balance.ts");
const backendBalanceSource = read("src-tauri/src/balance.rs");
const apiKeyBillingSource = read("src-tauri/src/api_key_billing.rs");
const backendGatewaySource = read("src-tauri/src/bin/backend_gateway.rs");
const line6ValidationArm =
  validationSource.match(/ImageApiLine::Line6\s*=>\s*matches!\([\s\S]*?\n\s*\),/)?.[0] ?? "";

// ---- 前端 ----
ok(typesSource.includes('"line6"'), "前端 GenerationLine 类型应包含线路6");
ok(!topbarSource.includes("自动分配线路"), "顶部栏不应再显示自动分配线路");
ok(supabaseSource.includes("HistoricalGenerationLine"), "云端 generation_logs 类型应使用包含 line6 的历史线路类型");
ok(historySource.includes('"line6"'), "本地历史记录类型应允许 line6");
ok(historyPanelSource.includes('"线路6"'), "历史面板应显示线路6");
ok(adminLogListSource.includes('line === "line6"'), "后台管理应识别 line6");
ok(adminFiltersSource.includes('line6: "线路6"'), "后台过滤标签应有 line6");
ok(lineHealthTsSource.includes('"line6"'), "前端 line-health 列表应含 line6");

// ---- 数据库 ----
ok(
  schemaSource.includes("'line6'"),
  "schema.sql 中 CHECK 约束应包含 line6"
);
ok(
  migrationSource.includes("'line6'"),
  "迁移文件 20260519_add_generation_line6.sql 应存在且包含 line6"
);

// ---- 后端 Rust ----
ok(providerSource.includes("Line6"), "image_provider 应定义 Line6 变体");
ok(
  providerSource.includes("api.manxiaobai.online/v1/images/generations"),
  "line6 generations URL 必须指向 manxiaobai"
);
ok(
  providerSource.includes("api.manxiaobai.online/v1/images/edits"),
  "line6 edit URL 必须指向 manxiaobai"
);
ok(
  providerSource.includes("MANXIAOBAI_IMAGE_2_API_KEY"),
  "image_provider 应读取 MANXIAOBAI_IMAGE_2_API_KEY"
);
ok(
  providerSource.includes('const LINE6_MODEL: &str = "gpt-image-2.5";'),
  "line6 应使用 manxiaobai 的 gpt-image-2.5 模型"
);
ok(
  apiSource.includes("generate_manxiaobai_edit_image"),
  "api.rs 应在 Line6 分支调用 manxiaobai 编辑实现"
);
ok(
  apiSource.includes("ImageApiLine::Line6"),
  "api.rs 应处理 Line6 分支"
);
ok(
  editSource.includes("MAX_ATTEMPTS: usize = 3"),
  "manxiaobai 应做 3 次自动重试（备用线路）"
);
ok(
  editSource.includes("multipart"),
  "manxiaobai 模块应使用 multipart/form-data 调用 edit 接口"
);
ok(
  lineHealthRsSource.includes('"line6"'),
  "后端 line_health.rs 应在 LINES 数组里包含 line6"
);
ok(
  generationSizeSource.includes('const MANXIAOBAI_WIDE_SIZE = "2384x1024";'),
  "前端应为 line6 使用 manxiaobai 支持的超宽像素尺寸"
);
ok(
  !generationSizeSource.includes('line === "line2" || line === "line6"'),
  "前端不应再让 line6 复用 line2 的 1792x768 尺寸"
);
ok(
  gatewayLimiterSource.includes('"1792x768" | "21:9" => Cow::Borrowed("2384x1024")'),
  "网关应兼容旧客户端传入的 1792x768，并映射为 line6 支持的 2384x1024"
);
ok(
  gatewayLimiterSource.includes('"16:9" | "auto" | "1792x1024" => Cow::Borrowed("1824x1024")'),
  "网关应把 line6 的 16:9/auto 映射为 manxiaobai 支持的 1824x1024"
);
ok(
  line6ValidationArm.includes('"2384x1024"') && line6ValidationArm.includes('"1824x1024"'),
  "api_validation 应为 Line6 单独维护 manxiaobai 支持的像素白名单"
);
ok(
  !/ImageApiLine::Line2\s*\|\s*ImageApiLine::Line6|ImageApiLine::Line6\s*\|\s*ImageApiLine::Line2/.test(
    validationSource
  ),
  "api_validation 不应再让 Line6 走 Line2 同一组 size 白名单"
);
ok(
  !line6ValidationArm.includes('"1792x768"'),
  "api_validation 不应允许 line6 把 1792x768 原样发给 manxiaobai"
);
ok(
  frontendBalanceSource.includes('{ id: "line6", name: "线路6（manxiaobai）", consoleUrl: "https://api.manxiaobai.online/console", balanceMode: "api_key", supported: true }'),
  "线路6余额监控应和线路2一样使用 API Key billing 模式，不再依赖网页登录 session"
);
ok(
  apiKeyBillingSource.includes('const MANXIAOBAI_BILLING_SUBSCRIPTION_URL: &str =') &&
    apiKeyBillingSource.includes('"https://api.manxiaobai.online/v1/dashboard/billing/subscription"') &&
    apiKeyBillingSource.includes('"https://api.manxiaobai.online/v1/dashboard/billing/usage"'),
  "后端线路6余额应读取 manxiaobai 的 subscription 与 usage billing 接口"
);
ok(
  apiKeyBillingSource.includes('const MANXIAOBAI_API_KEY_ENV_KEYS: [&str; 2]') &&
    apiKeyBillingSource.includes('"MANXIAOBAI_IMAGE_2_API_KEY"') &&
    apiKeyBillingSource.includes('"IMAGE_2_LINE6_API_KEY"'),
  "后端线路6余额应复用 manxiaobai 生图 API Key"
);
ok(
  frontendBalanceSource.includes('"/api/admin/balance"') &&
    frontendBalanceSource.includes('line?.balanceMode === "api_key"'),
  "生产网关模式下线路6余额应由云端网关读取，不能要求员工客户端配置 MANXIAOBAI_IMAGE_2_API_KEY"
);
ok(
  backendGatewaySource.includes('.route("/api/admin/balance", post(admin_balance_fetch))') &&
    backendGatewaySource.includes("fetch_api_key_billing_balance_for_line"),
  "后端网关应提供管理员余额查询接口并在服务器侧读取 MANXIAOBAI_IMAGE_2_API_KEY"
);

console.log("manxiaobai (line6) contract: OK");
