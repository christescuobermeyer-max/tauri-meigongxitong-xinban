# 实时监控普通用户入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在侧边栏“历史记录”下方增加所有用户可见的“实时监控”页面，并复用现有网关监控组件与完整数据。

**Architecture:** 前端新增一个 `gatewayMonitor` 工作区 tab，直接渲染现有 `AdminGatewayMonitor`，避免复制 UI。后端新增经过登录态和账号启用校验的只读 `/api/gateway-stats`，并与管理员接口共享快照构建逻辑；普通接口使用 service role 读取运营姓名，所有写接口继续保持管理员权限。

**Tech Stack:** React 18、TypeScript、Vite 6、Tauri 2、Rust、Axum、Supabase Auth/PostgREST。

## Global Constraints

- 普通用户页面必须与后台管理中的监控组件一比一一致。
- 普通用户可查看完整运营姓名、账号 ID 前 8 位、运行任务和排队任务。
- 新页面不提供任何写操作。
- `/api/admin/line-pause`、`/api/admin/line-resume` 和账号管理接口继续要求管理员权限。
- 复用现有 `AdminGatewayMonitor`，不复制组件、样式或轮询逻辑。
- 保留每 5 秒自动刷新、8 秒超时、立即刷新和旧数据降级行为。
- 普通用户完整姓名查询依赖网关环境变量 `SUPABASE_SERVICE_ROLE_KEY`；缺失时接口必须返回明确配置错误。
- 不覆盖或回退当前工作区已有未提交修改。
- 当前目标文件已有用户修改，实施阶段不自动提交这些文件，避免把无关改动带入提交。

---

### Task 1: 添加普通用户实时监控契约测试

**Files:**
- Create: `tests/gateway-monitor-user-page.test.ts`
- Read: `src/components/Sidebar.tsx`
- Read: `src/hooks/useGenerationWorkspace.ts`
- Read: `src/components/WorkspaceShell.tsx`
- Read: `src/components/WorkspacePages.tsx`
- Read: `src/lib/gateway-stats.ts`
- Read: `src-tauri/src/bin/backend_gateway.rs`

**Interfaces:**
- Consumes: 当前侧边栏、工作区 tab、监控组件和网关源码。
- Produces: 一个在功能缺失时失败、实现完成后通过的源码契约测试。

- [ ] **Step 1: 写失败测试**

创建 `tests/gateway-monitor-user-page.test.ts`：

```ts
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
const gatewayStatsClient = readFileSync(
  new URL("../src/lib/gateway-stats.ts", import.meta.url),
  "utf8",
);
const gateway = readFileSync(
  new URL("../src-tauri/src/bin/backend_gateway.rs", import.meta.url),
  "utf8",
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  ok(startIndex >= 0, `missing source marker: ${start}`);
  ok(endIndex > startIndex, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
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
ok(workspacePages.includes('import AdminGatewayMonitor from "./admin/AdminGatewayMonitor";'));
ok(workspacePages.includes('workspace.tab === "gatewayMonitor"'));
ok(workspacePages.includes("<AdminGatewayMonitor />"));

ok(gatewayStatsClient.includes('"/api/gateway-stats"'));
equal(gatewayStatsClient.includes('"/api/admin/gateway-stats"'), false);

ok(gateway.includes('.route("/api/gateway-stats", get(gateway_stats))'));
const userHandler = sourceBetween(
  gateway,
  "async fn gateway_stats(",
  "async fn admin_gateway_stats(",
);
ok(userHandler.includes("verify_access_token"));
ok(userHandler.includes("service_role_bearer"));
equal(userHandler.includes("ensure_admin_profile"), false);

const adminHandler = sourceBetween(
  gateway,
  "async fn admin_gateway_stats(",
  "async fn build_gateway_stats_response(",
);
ok(adminHandler.includes("ensure_admin_profile"));

const pauseHandler = sourceBetween(
  gateway,
  "async fn admin_line_pause(",
  "async fn admin_line_resume(",
);
ok(pauseHandler.includes("ensure_admin_profile"));

console.log("gateway monitor user page contract: OK");
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
npx tsx tests/gateway-monitor-user-page.test.ts
```

Expected: FAIL，首先报告缺少 `key: "gatewayMonitor"`、`/api/gateway-stats` 或 `async fn gateway_stats`。

- [ ] **Step 3: 保存 RED 证据**

记录失败原因，确认失败来自功能尚未实现，而不是测试语法或路径错误。

---

### Task 2: 新增普通用户只读网关快照接口

**Files:**
- Modify: `src-tauri/src/bin/backend_gateway.rs:152-180`
- Modify: `src-tauri/src/bin/backend_gateway.rs:1056-1105`
- Modify: `src-tauri/src/bin/backend_gateway.rs:1229-1273`
- Test: `tests/gateway-monitor-user-page.test.ts`

**Interfaces:**
- Consumes: `verify_access_token`、`ensure_admin_profile`、`service_role_bearer`、`GatewayGenerationQueue::snapshot`、`LineHealthRegistry::snapshot`。
- Produces: `GET /api/gateway-stats` 和共享函数 `build_gateway_stats_response(...) -> Result<GatewayStatsResponse, GatewayError>`。

- [ ] **Step 1: 注册普通只读路由**

在现有线路健康路由之后加入：

```rust
.route("/api/gateway-stats", get(gateway_stats))
```

- [ ] **Step 2: 把响应结构改成共享命名**

将：

```rust
struct AdminGatewayStatsResponse {
```

改为：

```rust
struct GatewayStatsResponse {
```

- [ ] **Step 3: 添加普通用户处理函数**

放在 `admin_gateway_stats` 之前：

```rust
async fn gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GatewayStatsResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    let service_role = service_role_bearer(&state)?;
    let response =
        build_gateway_stats_response(&state, service_role, service_role).await?;
    Ok(Json(response))
}
```

`verify_access_token` 已包含账号启用状态校验，因此普通接口不调用 `ensure_admin_profile`。

- [ ] **Step 4: 保留管理员校验并复用共享构建函数**

将管理员处理函数改为：

```rust
async fn admin_gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GatewayStatsResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let response =
        build_gateway_stats_response(&state, &state.supabase_anon_key, token).await?;
    Ok(Json(response))
}
```

- [ ] **Step 5: 提取共享快照函数**

紧接管理员处理函数之后添加：

```rust
async fn build_gateway_stats_response(
    state: &AppState,
    profiles_api_key: &str,
    profiles_bearer: &str,
) -> Result<GatewayStatsResponse, GatewayError> {
    let queue = state.generation_queue.snapshot();
    let health = state.line_health.snapshot();
    let paused_lines = state.pause_state.snapshot();

    let mut user_ids: std::collections::HashSet<String> =
        queue.active_by_user.keys().cloned().collect();
    for ticket in &queue.waiting {
        user_ids.insert(ticket.user_id.clone());
    }

    let display_names = if user_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_display_names(
            state,
            profiles_api_key,
            profiles_bearer,
            &user_ids,
        )
        .await?
    };

    Ok(GatewayStatsResponse {
        queue,
        health,
        display_names,
        server_time: chrono::Utc::now()
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        paused_lines,
    })
}
```

不使用 `unwrap_or_default()`，否则 service role 配置或 Supabase 查询错误会静默丢失运营姓名，不符合完整复刻要求。

- [ ] **Step 6: 扩展姓名查询认证参数**

将函数签名改为：

```rust
async fn fetch_display_names(
    state: &AppState,
    api_key: &str,
    bearer: &str,
    user_ids: &std::collections::HashSet<String>,
) -> Result<HashMap<String, String>, GatewayError> {
```

请求头改为：

```rust
.header("apikey", api_key)
.bearer_auth(bearer)
```

- [ ] **Step 7: 运行契约测试**

Run:

```powershell
npx tsx tests/gateway-monitor-user-page.test.ts
```

Expected: 仍 FAIL，因为前端入口与客户端路径尚未实现；后端相关断言通过。

- [ ] **Step 8: 运行 Rust 定向测试**

Run:

```powershell
cmd.exe /c "call ""D:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"" -arch=x64 >NUL && cargo test --manifest-path src-tauri\Cargo.toml gateway"
```

Expected: Rust 测试通过，0 failed。

---

### Task 3: 增加侧边栏入口并复用监控组件

**Files:**
- Modify: `src/components/Sidebar.tsx:1-110`
- Modify: `src/hooks/useGenerationWorkspace.ts:46-62`
- Modify: `src/components/WorkspaceShell.tsx:29-57`
- Modify: `src/components/WorkspacePages.tsx:1-190`
- Modify: `src/lib/gateway-stats.ts:54-83`
- Test: `tests/gateway-monitor-user-page.test.ts`
- Test: `tests/sidebar-layout.test.ts`

**Interfaces:**
- Consumes: `WorkspaceTab`、`AdminGatewayMonitor`、`IconMonitor`、`fetchGatewayStats`。
- Produces: 普通用户可见的 `gatewayMonitor` 页面入口。

- [ ] **Step 1: 增加监控图标导入**

在 `Sidebar.tsx` 的图标导入中加入：

```ts
IconMonitor
```

- [ ] **Step 2: 在历史记录后增加导航项**

在 `history` 项和 `admin` 项之间加入：

```tsx
{
  key: "gatewayMonitor",
  label: "实时监控",
  icon: <IconMonitor />,
  desc: "网关并发 / 线路健康 / 排队情况",
},
```

不要设置 `adminOnly`。

- [ ] **Step 3: 扩展 WorkspaceTab**

在 `history` 与 `admin` 之间加入：

```ts
| "gatewayMonitor"
```

- [ ] **Step 4: 增加页面标题**

在 `WorkspaceShell.tsx` 的标题选择中，将末尾分支调整为：

```ts
: workspace.tab === "history"
  ? "历史记录"
  : workspace.tab === "gatewayMonitor"
    ? "实时监控"
    : "后台管理";
```

- [ ] **Step 5: 增加共享监控页面**

在 `WorkspacePages.tsx` 顶部加入：

```ts
import AdminGatewayMonitor from "./admin/AdminGatewayMonitor";
```

在历史记录分支之后、后台管理默认返回之前加入：

```tsx
if (workspace.tab === "gatewayMonitor") {
  return (
    <div className="page page--single">
      <AdminGatewayMonitor />
    </div>
  );
}
```

- [ ] **Step 6: 切换普通只读接口路径**

在 `fetchGatewayStats()` 中将：

```ts
`${baseUrl}/api/admin/gateway-stats`
```

改为：

```ts
`${baseUrl}/api/gateway-stats`
```

管理员页面继续使用同一个客户端函数，因此也走共享只读接口；管理员写接口不受影响。

- [ ] **Step 7: 运行新契约测试并确认 GREEN**

Run:

```powershell
npx tsx tests/gateway-monitor-user-page.test.ts
```

Expected:

```text
gateway monitor user page contract: OK
```

- [ ] **Step 8: 运行现有侧边栏测试**

Run:

```powershell
npx tsx tests/sidebar-layout.test.ts
```

Expected: PASS。

---

### Task 4: 完整回归验证

**Files:**
- Verify: `src/components/Sidebar.tsx`
- Verify: `src/hooks/useGenerationWorkspace.ts`
- Verify: `src/components/WorkspaceShell.tsx`
- Verify: `src/components/WorkspacePages.tsx`
- Verify: `src/lib/gateway-stats.ts`
- Verify: `src-tauri/src/bin/backend_gateway.rs`
- Verify: `tests/gateway-monitor-user-page.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 的完整实现。
- Produces: 构建、TypeScript 契约测试和 Rust 测试证据。

- [ ] **Step 1: 运行相关 TypeScript 测试**

Run:

```powershell
npx tsx tests/gateway-monitor-user-page.test.ts
npx tsx tests/sidebar-layout.test.ts
npx tsx tests/backend-gateway.test.ts
npx tsx tests/generation-concurrency-guard.test.ts
```

Expected: 全部 exit code 0。

- [ ] **Step 2: 运行前端生产构建**

Run:

```powershell
npm run build
```

Expected: TypeScript 和 Vite 构建成功，exit code 0。

- [ ] **Step 3: 运行 Rust 全量测试**

Run:

```powershell
cmd.exe /c "call ""D:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"" -arch=x64 >NUL && cargo test --manifest-path src-tauri\Cargo.toml"
```

Expected: 0 failed；需要真实 OSS 或上游网络的测试允许保持 ignored。

- [ ] **Step 4: 检查权限边界**

Run:

```powershell
rg -n "gateway-stats|admin_line_pause|admin_line_resume|ensure_admin_profile" src-tauri/src/bin/backend_gateway.rs
```

Expected:

- `/api/gateway-stats` 使用 `gateway_stats`。
- `gateway_stats` 不调用 `ensure_admin_profile`。
- `admin_gateway_stats`、`admin_line_pause`、`admin_line_resume` 仍调用 `ensure_admin_profile`。

- [ ] **Step 5: 检查最终差异**

Run:

```powershell
git diff --check
git diff -- src/components/Sidebar.tsx src/hooks/useGenerationWorkspace.ts src/components/WorkspaceShell.tsx src/components/WorkspacePages.tsx src/lib/gateway-stats.ts src-tauri/src/bin/backend_gateway.rs tests/gateway-monitor-user-page.test.ts
```

Expected: 无空白错误；差异仅包含本功能所需增量，并保留文件中原有未提交修改。

- [ ] **Step 6: 不自动提交实现文件**

当前目标文件在任务开始前已有大量未提交修改。完成后保留工作区差异并向用户报告，不执行会把用户既有改动一起带入的 `git add` 或 `git commit`。
