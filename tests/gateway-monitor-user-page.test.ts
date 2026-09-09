import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

const sidebar = readFileSync(
  new URL("../src/components/Sidebar.tsx", import.meta.url),
  "utf8",
);
const workspaceHook = readFileSync(
  new URL("../src/hooks/useGenerationWorkspace.ts", import.meta.url),
  "utf8",
);
const workspaceShell = readFileSync(
  new URL("../src/components/WorkspaceShell.tsx", import.meta.url),
  "utf8",
);
const workspacePages = readFileSync(
  new URL("../src/components/WorkspacePages.tsx", import.meta.url),
  "utf8",
);
const gatewayMonitor = readFileSync(
  new URL(
    "../src/components/admin/AdminGatewayMonitor.tsx",
    import.meta.url,
  ),
  "utf8",
);
const gatewayStatsClient = readFileSync(
  new URL("../src/lib/gateway-stats.ts", import.meta.url),
  "utf8",
);
const gateway = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);

function sourceBetween(source: string, start: string, end: string): string {
  const normalizedSource = source.replace(/\r\n/g, "\n");
  const startIndex = normalizedSource.indexOf(start);
  const endIndex = normalizedSource.indexOf(end, startIndex + start.length);
  ok(startIndex >= 0, `missing source marker: ${start}`);
  ok(endIndex > startIndex, `missing source marker: ${end}`);
  return normalizedSource.slice(startIndex, endIndex);
}

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

const historyIndex = sidebar.indexOf('key: "history"');
const monitorIndex = sidebar.indexOf('key: "gatewayMonitor"');
const adminIndex = sidebar.indexOf('key: "admin"');

ok(historyIndex >= 0, "侧边栏应保留历史记录");
ok(monitorIndex > historyIndex, "实时监控应位于历史记录之后");
ok(adminIndex > monitorIndex, "后台管理应位于实时监控之后");

const monitorItem = sourceBetween(
  sidebar,
  'key: "gatewayMonitor"',
  'key: "admin"',
);
ok(monitorItem.includes('label: "实时监控"'));
ok(monitorItem.includes("<IconMonitor"));
equal(monitorItem.includes("adminOnly"), false);

ok(workspaceHook.includes('| "gatewayMonitor"'));
ok(workspaceShell.includes('workspace.tab === "gatewayMonitor"'));
ok(workspaceShell.includes('? "实时监控"'));
ok(
  workspacePages.includes(
    'import AdminGatewayMonitor from "./admin/AdminGatewayMonitor";',
  ),
);
ok(workspacePages.includes('workspace.tab === "gatewayMonitor"'));
const monitorPage = sourceBetween(
  workspacePages,
  'if (workspace.tab === "gatewayMonitor")',
  "\n\n  return (",
);
equal(
  occurrences(monitorPage, "<AdminGatewayMonitor />"),
  1,
  "普通用户实时监控页应只复用一份 AdminGatewayMonitor",
);
equal(monitorPage.includes("pauseLine"), false);
equal(monitorPage.includes("resumeLine"), false);
equal(monitorPage.includes("/api/admin/line-pause"), false);
equal(monitorPage.includes("/api/admin/line-resume"), false);

ok(gatewayMonitor.includes("const POLL_INTERVAL_MS = 5000"));
ok(
  gatewayMonitor.includes(
    "window.setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS)",
  ),
);
ok(gatewayMonitor.includes("window.clearInterval(timer)"));
const refreshHandler = sourceBetween(
  gatewayMonitor,
  "function refresh()",
  "\n\n  if (loading",
);
ok(refreshHandler.includes("setTick((n) => n + 1)"));
ok(gatewayMonitor.includes("onClick={refresh}"));
ok(gatewayMonitor.includes("立即刷新"));

const refreshFailureHandler = sourceBetween(
  gatewayMonitor,
  ".catch((err: unknown) => {",
  "      .finally",
);
ok(refreshFailureHandler.includes("setError("));
equal(
  refreshFailureHandler.includes("setStats("),
  false,
  "刷新失败时不得清空上一次成功的 stats",
);
ok(gatewayMonitor.includes("if (error && !stats)"));
ok(gatewayMonitor.includes("沿用上一次成功数据"));

ok(gatewayStatsClient.includes("const REQUEST_TIMEOUT_MS = 8000"));
ok(gatewayStatsClient.includes("const controller = new AbortController()"));
ok(
  gatewayStatsClient.includes(
    "window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)",
  ),
);
ok(gatewayStatsClient.includes("signal: controller.signal"));
ok(gatewayStatsClient.includes("/api/gateway-stats"));
equal(gatewayStatsClient.includes("/api/admin/gateway-stats"), false);

ok(gateway.includes('.route("/api/gateway-stats", get(gateway_stats))'));
const userHandler = sourceBetween(
  gateway,
  "async fn gateway_stats(",
  "async fn admin_gateway_stats(",
);
ok(userHandler.includes("verify_access_token"));
ok(userHandler.includes("service_role_bearer"));
ok(userHandler.includes("build_gateway_stats_response"));
equal(userHandler.includes("ensure_admin_profile"), false);

const adminHandler = sourceBetween(
  gateway,
  "async fn admin_gateway_stats(",
  "async fn build_gateway_stats_response(",
);
ok(adminHandler.includes("ensure_admin_profile"));
ok(adminHandler.includes("build_gateway_stats_response"));

const statsBuilder = sourceBetween(
  gateway,
  "async fn build_gateway_stats_response(",
  "async fn admin_line_pause(",
);
for (const requiredToken of [
  "generation_queue.snapshot()",
  "line_health.snapshot()",
  "pause_state.snapshot()",
  "queue.active_by_user",
  "queue.waiting",
  "fetch_display_names(",
  "queue,",
  "health,",
  "paused_lines,",
  "display_names,",
]) {
  ok(
    statsBuilder.includes(requiredToken),
    `共享网关快照构建函数缺少 ${requiredToken}`,
  );
}
equal(
  statsBuilder.includes("unwrap_or_default"),
  false,
  "运营姓名查询失败不得静默降级为空映射",
);

const serviceRoleBearer = sourceBetween(
  gateway,
  "fn service_role_bearer(",
  "fn current_shanghai_month_range(",
);
ok(serviceRoleBearer.includes(".ok_or_else("));
ok(serviceRoleBearer.includes("GatewayError::bad_gateway("));
ok(serviceRoleBearer.includes("未配置 SUPABASE_SERVICE_ROLE_KEY"));

const pauseHandler = sourceBetween(
  gateway,
  "async fn admin_line_pause(",
  "async fn admin_line_resume(",
);
ok(pauseHandler.includes("ensure_admin_profile"));

const resumeHandler = sourceBetween(
  gateway,
  "async fn admin_line_resume(",
  "fn validate_line_name(",
);
ok(resumeHandler.includes("ensure_admin_profile"));

ok(gateway.includes('.route("/api/admin-create-user", post(admin_create_user))'));
ok(
  gateway.includes(
    '.route("/api/admin-soft-delete-user", post(admin_soft_delete_user))',
  ),
);
const createUserHandler = sourceBetween(
  gateway,
  "async fn admin_create_user(",
  "async fn admin_soft_delete_user(",
);
ok(createUserHandler.includes("ensure_admin_profile"));

const softDeleteUserHandler = sourceBetween(
  gateway,
  "async fn admin_soft_delete_user(",
  "async fn brand_story_generate_text(",
);
ok(softDeleteUserHandler.includes("ensure_admin_profile"));

equal(gatewayMonitor.includes("pauseLine("), false);
equal(gatewayMonitor.includes("resumeLine("), false);
equal(gatewayMonitor.includes("/api/admin/line-pause"), false);
equal(gatewayMonitor.includes("/api/admin/line-resume"), false);

console.log("gateway monitor user page contract: OK");
