# 美工系统架构与发布盘点记录

## 架构

- 客户端：React 18 + TypeScript + Vite，封装在 Tauri 2 桌面应用中。
- 本地能力：`src-tauri/src/lib.rs` 注册图片文件、视频、OSS、自动更新等 Tauri 命令。
- 业务入口：`src/App.tsx` 管登录、更新门和工作区壳；`WorkspaceShell.tsx` 组合导航、标题栏、工作区调度和工作区页面。
- 工作区：`src/components/workspace/` 放页面适配器，`src/hooks/` 管各工具状态，`src/lib/` 管提示词、生成流程、历史、下载和 OSS。
- 桌面更新：启动时读取 Supabase `app_update_config`；客户端从 OSS 下载 NSIS 包，由 Rust 安装并重开应用。
- 云端网关：Rust/Axum 单进程；路由入口在 `src-tauri/src/bin/backend_gateway.rs`，共享 limiter、queue、line health、prompt、provider 和 OSS 模块。
- 数据及资产：Supabase Auth/Postgres/RLS 保存用户和生图历史；阿里云 OSS 保存上传素材、结果和安装包。

## 扩展维护观察

- 工作区键、标题、侧栏文案和页面入口目前分散在 hook、侧栏、工作区壳和页面分发中；本次集中 tab 元数据并要求 renderer 穷尽匹配。
- `useGenerationWorkspace.ts` 同时管理历史、副作用、并发计数和多组 10 槽位 hook，约 727 行；`WorkspacePages.tsx` 负责大量条件分支。
- Rust 网关入口约 2749 行，视频命令约 1264 行；这些适合后续按请求域拆分，但本次发布避免扩大到服务端重构。
- 工作区已有未提交功能及新文件；按用户指示保留并纳入当前构建，不清理或回退。

## 更新状态

- 本次发布前本地版本：`3.0.49`；本次已构建并发布 `3.0.50`。
- 发布前只读查询的 Supabase 配置：`latest_version=3.0.49`、安装包存在、`force_update=true`；发布后已验证 `latest_version=3.0.50`、安装包存在、`force_update=true`。
- OSS 当前安装包 Range 请求返回 HTTP `206`，CORS 为 `*`；Supabase anon 状态读取及 service-role 只读查询返回 HTTP `200`。
- `.env.local` 中有发布变量；publisher 默认只读进程环境。Node `--env-file=.env.local` 已通过只读 `status` 命令验证。
- 自动更新对桌面客户端而言是启动检查和用户交互流程；网关服务器不是安装包分发端。

## 保密边界

- 不把 `.env.local`、SSH 私钥、OSS/Supabase 值或签名 URL 写入本记录。
- 只在发布子进程使用 `.env.local`，不设置持久用户/系统环境变量。
