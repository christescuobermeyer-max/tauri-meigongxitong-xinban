# AGENTS.md

## 目标

本项目是“呈尚策划美工生图系统 PRO”：面向外卖运营团队的 Windows 桌面生图工具，用 AI 生成和修改头像、店招、海报、产品图、套餐图、详情页、图片墙、品牌故事配图、数据分析图和视频店招，并把成功结果归档到云端历史。

这个文件只作为 AI 协作入口：写项目摘要、仓库结构、实现约束和文档索引。详细技术背景、云资源和部署流程放到 `docs/`，优先读 `docs/项目总览.md` 和 `docs/文档索引.md`。

## 技术栈摘要

| 层级 | 当前技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 |
| 桌面端 | Tauri 2 + Rust，Windows MSI / NSIS 打包 |
| 云端网关 | Rust + Axum，systemd 服务 `csgh-backend-gateway` |
| 云服务器 | 椰子云香港二区，Ubuntu 22.04；8 vCPU / 8 GB 级内存，`/opt` 位于 70 GB 数据盘 |
| 反向代理 | Caddy HTTPS 反代到 `127.0.0.1:8787` |
| 公网入口 | 域名 `https://gw.hbcsch.pw`；2026-08-01 A 记录已切到新服务器，GA 未启用 |
| 云数据库 | Supabase Auth + Postgres + RLS + pg_cron |
| 图片/安装包存储 | 阿里云 OSS |
| 生图上游 | 多线路 image-2，由网关自动调度、限流、重试 |

## 云资源摘要

| 项 | 值 |
|---|---|
| 网关域名 | `https://gw.hbcsch.pw` |
| 源站公网 IP | `156.225.23.248` |
| SSH 用户 | `admin` |
| 服务器项目目录 | `/opt/csgh-image-studio` |
| 网关运行目录 | `/opt/csgh-gateway` |
| 网关密钥文件 | `/opt/csgh-gateway/secrets/gateway.env`（只记录路径，禁止写入文档） |

更完整信息见 `docs/云服务器信息.md`。

## 仓库结构

| 路径 | 说明 |
|---|---|
| `src/` | React 18 + TypeScript + Vite 前端界面 |
| `src/components/` | 页面、工作区、后台和 UI 组件 |
| `src/components/workspace/` | 各生图工作区页面 |
| `src/hooks/` | 各工作区状态、登录态、线路健康与流程编排 |
| `src/lib/` | 前端业务 API、Tauri 调用、Supabase/OSS/历史/下载辅助逻辑 |
| `src-tauri/` | Tauri 2 + Rust 桌面端和云网关共享源码 |
| `src-tauri/src/bin/backend_gateway.rs` | Rust/Axum 云服务器网关入口 |
| `supabase/` | Postgres schema、RLS、迁移 SQL |
| `scripts/` | 构建、诊断、数据导出、运维脚本 |
| `tests/` | 以 `tsx` / `mjs` 为主的项目行为断言测试 |
| `docs/` | 详细技术文档、部署流程、架构设计和实施计划 |
| `docs/architecture/` | 架构设计文档 |
| `docs/operations/` | 生产部署和服务器运维文档 |
| `docs/reference/` | API 与外部服务参考 |
| `docs/cloud-gateway/` | 云端网关部署脚本、Caddy、systemd、GA 文档 |
| `docs/plans/` | 历史实施计划和执行记录 |

## 实现约束

- 默认使用中文回复。
- 改动要小而准：只改完成当前请求必需的文件，不做顺手重构。
- 不要回退用户已有改动；工作区可能长期保持未提交状态。
- 代码风格跟随现有文件，不引入无必要的新抽象。
- 涉及新功能或修复时，优先补对应测试，再实现。
- 前端构建至少验证 `npm run build`；Rust/Tauri 改动按影响范围跑 `cargo test` 或 `npm run tauri:build`。
- 发布新安装包或启用强制更新前，必须先读 `docs/自动更新.md` 并按流程操作。
- 不要把真实密钥、完整签名 URL、数据库连接串写进文档或提交记录。
- 不要读取、移动或公开 `*.local.md`、`.env.local`、`运维凭证.local.md` 这类本地私密文件内容。

## 常用命令

```powershell
npm run build
npm run tauri:build
npx tsx tests/mandatory-update.test.ts
npx tsx tests/sidebar-layout.test.ts
cmd.exe /c "call ""D:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"" -arch=x64 >NUL && cargo test --manifest-path src-tauri\Cargo.toml app_update"
```

## 文档索引

| 文档 | 什么时候读 |
|---|---|
| `docs/项目总览.md` | 需要了解完整技术栈、云资源、运行架构、数据流、文件边界 |
| `docs/文档索引.md` | 不确定要读哪份文档，或新增/归档文档前 |
| `docs/云服务器信息.md` | 查询服务器 IP、域名、SSH 用户、服务器目录、服务名 |
| `docs/自动更新.md` | 发布新版本、构建安装包、OSS 上传、Supabase 强制更新 |
| `docs/operations/云端部署与分发手册.md` | 了解生产云部署、成本、员工客户端分发 |
| `docs/operations/云服务器全量迁移计划.md` | 迁移整台服务器到椰子云目标机、盘点同机项目、跨发行版重建、切换 DNS/GA、验收或回滚 |
| `docs/operations/美工生图系统新服务器连接说明.md` | 美工客户端、网关、SSH、部署、验收和回滚的当前生产连接信息 |
| `docs/operations/自动出餐系统新服务器连接说明.md` | 自动出餐项目连接新机、部署及单 worker 正式切换流程 |
| `docs/cloud-gateway/README.md` | 部署或调整阿里云轻量服务器 Rust 网关 |
| `docs/cloud-gateway/global-accelerator.md` | 调整阿里云 GA、DNS、回滚和排错 |
| `docs/local-backend-gateway-windows.md` | Windows 本地网关调试 |
| `docs/六台电脑独立部署指南.md` | 新电脑或多机器独立部署 |
| `docs/architecture/生图并发与网关分配框架.md` | 理解多用户多线路调度、队列、健康检测、自动重试 |
| `docs/architecture/生图结果OSS直连分发方案.md` | 调整生成结果交付、OSS 直连、兼容协议、灰度或回滚 |
| `docs/reference/GPT-Image-2 API 调用说明.md` | 查看 image-2 调用协议参考 |

## 根目录文档规则

根目录只保留：

- `AGENTS.md`：AI 协作入口。
- `CLAUDE.md`：通用行为约束。
- `README.md`：项目开发和使用入口。
- `*.local.md`：本地私密文档可留在本机，但必须被 `.gitignore` 忽略，不能提交。

新增公开文档按类型放入 `docs/architecture/`、`docs/operations/`、`docs/reference/` 或 `docs/plans/`。

## 维护原则

如果新增了重要模块、发布流程或部署流程：

1. 在 `docs/` 新增或更新详细文档。
2. 更新 `docs/文档索引.md`。
3. 只在本文件补一行摘要或索引。
4. 保持本文件短小，避免变成实现细节集合。
