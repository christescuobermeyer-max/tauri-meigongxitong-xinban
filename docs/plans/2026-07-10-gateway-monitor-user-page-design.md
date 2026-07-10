# 实时监控普通用户入口设计

## 状态

- 日期：2026-07-10
- 状态：已确认
- 选择方案：共享同一监控组件，新增普通用户只读接口

## 目标

在侧边栏“历史记录”正下方新增“实时监控”分类页，让普通用户和管理员都能查看现有“网关实时监控”板块。

新页面必须与后台管理中的监控板块一比一保持一致，包括：

- 全局并发、等待队列、账号并发上限和活跃账号统计。
- 各线路占用、健康状态、延迟、失败数和暂停状态。
- 各运营账号的姓名、运行数、排队数和账号 ID 前 8 位。
- 排队任务的类型、尺寸、排除线路和等待时长。
- 首次加载、加载失败、手动刷新、刷新失败沿用旧数据。
- 每 5 秒自动刷新。

## 非目标

- 不开放账号管理、余额监控、趋势统计等后台页面。
- 不开放线路暂停、恢复或其他管理写操作。
- 不复制第二套监控组件、样式或数据转换逻辑。
- 不改变现有网关调度、限流、队列和健康计算逻辑。

## 前端设计

### 侧边栏入口

在 `Sidebar.tsx` 的“历史记录”后、“后台管理”前增加普通导航项：

- key：`gatewayMonitor`
- 标签：`实时监控`
- 所有已登录用户可见，不设置 `adminOnly`
- 使用现有图标组件中语义最接近监控/状态的图标

### 页面路由

在 `WorkspaceTab` 联合类型中增加 `gatewayMonitor`。

`WorkspaceShell` 在该 tab 下显示标题“实时监控”。

`WorkspacePages` 在该 tab 下渲染现有 `AdminGatewayMonitor` 组件。通过直接复用同一个组件保证后台管理页和普通用户页的 DOM、样式、表格、刷新频率及错误状态始终一致。

后台管理中的“网关实时监控”标签页继续使用同一组件，不改变现有布局。

### 数据请求

`fetchGatewayStats()` 从管理员路径切换到新的只读路径：

```text
GET /api/gateway-stats
Authorization: Bearer <Supabase access_token>
```

组件继续每 5 秒轮询，并保留 8 秒请求超时、立即刷新和旧数据降级机制。

## 后端设计

### 新增只读路由

在 Axum Router 中增加：

```text
GET /api/gateway-stats
```

处理函数执行：

1. 校验 Bearer Token。
2. 通过现有 `verify_access_token` 校验 Supabase 登录态。
3. 通过现有 `ensure_active_profile` 确认账号未停用。
4. 获取队列、线路健康状态、暂停线路和服务器时间。
5. 查询快照涉及账号的 `display_name`。
6. 返回与现有管理员监控接口完全相同的 JSON 结构。

### 共享快照逻辑

提取共享的网关快照构建函数，由普通只读接口和现有管理员接口共同调用，避免两份响应拼装逻辑发生漂移。

现有 `/api/admin/gateway-stats` 保留管理员身份校验，确保已有调用和管理语义不被破坏。

### 运营姓名查询

普通用户受 Supabase RLS 限制，不能直接读取其他账号资料。网关应使用 `SUPABASE_SERVICE_ROLE_KEY` 查询快照中涉及账号的 `id` 和 `display_name`，只返回监控组件所需的这两个字段。

该服务端凭据不得返回客户端或写入日志。若服务端未配置 service role，接口返回明确配置错误，不静默降级为缺失姓名，以保证“一比一完整复刻”的数据要求。

### 权限边界

以下接口保持管理员专用：

- `/api/admin/line-pause`
- `/api/admin/line-resume`
- `/api/admin-create-user`
- `/api/admin-soft-delete-user`
- 其他后台账号、余额和统计管理接口

新页面和新接口均不提供任何写操作。

## 错误处理

- 未登录或登录态过期：返回 401，前端显示现有监控加载失败状态。
- 账号已停用：返回 401，沿用现有账号停用提示。
- 未配置 service role：返回 502 和清晰的服务器配置错误。
- 网关临时不可用或请求超时：组件保留最近一次成功数据，并显示“上一次刷新失败”。
- 首次加载失败：显示完整错误卡片和“重试”按钮。

## 测试设计

遵循测试先行：

1. 新增前端/网关契约测试并先确认失败。
2. 实现最小代码使测试通过。
3. 运行现有侧边栏、网关监控和构建测试，确认没有回归。

测试至少覆盖：

- “实时监控”位于“历史记录”之后。
- 普通用户导航项没有 `adminOnly`。
- `WorkspaceTab`、页面标题和页面渲染均包含 `gatewayMonitor`。
- 普通页面与后台页面引用同一个监控组件。
- `fetchGatewayStats()` 调用 `/api/gateway-stats`。
- 新接口调用 `verify_access_token`，但不调用 `ensure_admin_profile`。
- 管理员监控接口仍调用 `ensure_admin_profile`。
- 线路暂停和恢复接口仍保持管理员校验。
- `npm run build` 通过。
- 相关 TypeScript 契约测试通过。
- Rust 全量测试通过。

## 预计修改文件

- `src/components/Sidebar.tsx`
- `src/hooks/useGenerationWorkspace.ts`
- `src/components/WorkspaceShell.tsx`
- `src/components/WorkspacePages.tsx`
- `src/lib/gateway-stats.ts`
- `src-tauri/src/bin/backend_gateway.rs`
- `tests/gateway-monitor-page.test.ts`
- 必要时更新现有侧边栏或网关测试

## 验收标准

1. 普通用户登录后可在历史记录下方看到“实时监控”。
2. 点击后显示与后台管理中完全相同的监控板块。
3. 普通用户能看到完整账号、线路和队列数据。
4. 页面自动刷新和手动刷新均正常。
5. 普通用户不能调用任何管理写接口。
6. 管理员后台监控板块无视觉和功能回归。
7. 构建与相关测试全部通过。
