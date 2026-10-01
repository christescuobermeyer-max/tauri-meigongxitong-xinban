# 工作区目录与自动更新发布实施计划

> **For Codex:** 按任务逐项执行，并在每项实现前遵循测试驱动开发(TDD)。

**目标：** 复核美工系统完整架构，减少新增工作区时重复维护，并从本机发布高于云端当前版本的桌面更新。

**架构：** 新增单一工作区目录作为 tab 类型、侧栏元数据和标题的来源；页面分发改为穷尽检查，避免新 tab 静默落到后台页面。发布命令通过 Node `--env-file=.env.local` 在单个进程中加载凭据，不写入用户或系统环境变量。

**技术栈：** React 18、TypeScript、Vite、Tauri 2、Rust、Supabase、阿里云 OSS、Node.js。

---

## 进度

- [x] 架构和脏工作区复核
- [x] 工作区目录维护性改动与测试
- [x] 发布命令入口和文档更新
- [x] `3.0.50` 版本同步、测试与 NSIS 构建
- [x] OSS 灰度上传、验收和正式启用

## 现状

- React/TypeScript 前端按组件、hook 和 lib 分层；Tauri/Rust 负责桌面 IPC；云端 Rust/Axum 网关处理认证、生图调度、线路健康、OSS 归档和历史记录。
- Supabase 负责登录、历史与更新配置；OSS 保存素材、生成结果和安装包。
- 工作区 tab 类型位于 `useGenerationWorkspace.ts`，侧栏元数据位于 `Sidebar.tsx`，标题判断位于 `WorkspaceShell.tsx`，页面分发位于 `WorkspacePages.tsx`。新增 tab 要同步维护多处。
- 工作区总 hook 约 727 行，并装配多个固定 10 槽位工作区；本次不重写生成状态机，只先消除 tab 元数据重复并加页面穷尽检查。
- 当前更新提示是可稍后处理的模式；本次保留该行为。
- 本机和云端发布前版本为 `3.0.49`；本次目标版本为 `3.0.50`。

## 任务

### 任务 1：增加并测试工作区目录

- 新建 `src/lib/workspace-catalog.ts`，集中定义工作区键、标题、侧栏标签、说明、图标标识和管理员可见性。
- 新建 `tests/workspace-catalog.test.ts`，覆盖键唯一、标题映射、普通用户过滤和管理员工作区可见性。
- 先运行测试确认目录不存在时失败，再实现最小目录并运行通过。

### 任务 2：接入工作区目录并穷尽页面分发

- `useGenerationWorkspace.ts` 从目录导入并重新导出 `WorkspaceTab` 类型，保留所有现有槽位和用户改动。
- `Sidebar.tsx` 使用目录渲染现有导航和权限过滤。
- `WorkspaceShell.tsx` 使用目录获取页面标题。
- `WorkspacePages.tsx` 保留现有页面分支并增加 `assertNever` 收口；增加 tab 后若没有页面分支，TypeScript 构建应失败。
- 更新侧栏行为测试；运行目录、侧栏、工作区 hook 顺序和构建验证。

### 任务 3：建立本机发布入口并更新文档

- 在 `package.json` 增加 `update:publish` 命令，执行 `node --env-file=.env.local scripts/publish-app-update.mjs`。
- 更新 `docs/自动更新.md`，写明本机 `status`、`stage`、`enable` 命令及可选更新提示行为。
- 使用只读 `status` 验证 npm 入口，不上传、不写云端配置。

### 任务 4：同步版本、测试与构建

- 将 package、lockfile、Cargo、Tauri、侧栏版本和版本断言统一为 `3.0.50`。
- 运行更新、侧栏、工作区和功能相关测试，再运行 `npm run build`。
- 使用员工端脚本生成 NSIS 安装包并核对产物版本。

### 任务 5：发布桌面更新

- 使用 `stage` 上传 NSIS 包，验证 OSS Range/CORS 和 Supabase 灰度状态。
- 使用 `status` 复核云端版本与包路径。
- 使用 `enable` 开启配置，再次 `status` 确认 `force_update=true`（已完成）。
- 不部署或重启云端 Rust 网关。

### 任务 6：交付架构复核报告

- 输出当前客户端、网关、数据与发布架构，以及本次改动和下一步维护热点。
- 更新 `docs/文档索引.md`。

## 当前状态

**全部阶段已完成。** 工作区目录维护性改动已通过测试和构建，`3.0.50` NSIS 包已上传 OSS，Supabase 更新配置已开启。
