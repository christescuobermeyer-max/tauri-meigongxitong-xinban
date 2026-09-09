# 呈尚策划 · 美工生图系统 PRO

面向外卖运营团队的 Windows 桌面生图工具。系统基于 Tauri 2、React 18、TypeScript、Vite 和 Rust，生产环境通过云端 Rust/Axum 网关统一调度多条 image-2 生图线路，并把生成结果归档到阿里云 OSS 和 Supabase 历史。

完整技术栈、云服务器、数据库、OSS、GA、文件架构和数据流见 [docs/项目总览.md](docs/项目总览.md)。所有公开文档入口见 [docs/文档索引.md](docs/文档索引.md)。

## 当前能力

| 工作区 | 用途 |
|---|---|
| 三件套设计 | 头像 / 店招 / 海报 |
| 制作 1 张设计图 | 单张产品主图 |
| 制作全店图 | 多产品批量全店图 |
| 制作套餐图 | 多产品合成套餐图 |
| 图片墙生成 | 美团图片墙素材 |
| P 门头 | 门头招牌文字替换 |
| 视频店招 | 外卖视频裁剪导出 |
| 修改图片 | 头像 / 店招 / 海报 / 产品图修改 |
| 详情页生成 | 电商详情页展示图 |
| 品牌故事 | 店铺品牌文案 + 5 张配图 |
| 数据分析 | 截图生成专业数据分析图 |
| 历史记录 | 最近生成的 OSS 图片 |
| 后台管理 | 账号、生图统计、网关监控、OSS 历史 |

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 |
| 桌面端 | Tauri 2 + Rust |
| 云端网关 | Rust + Axum + systemd + Caddy |
| 云服务器 | 阿里云轻量应用服务器，香港地域 |
| 云数据库 | Supabase Auth / Postgres / RLS |
| 对象存储 | 阿里云 OSS |
| 加速 | 阿里云全球加速 GA |
| 自动更新 | Supabase 配置 + OSS 安装包下载 |

生产网关域名是 `https://gw.hbcsch.pw`。服务器目录、服务名和运维入口见 [docs/云服务器信息.md](docs/云服务器信息.md)。

## 目录结构

```text
src/                         React 前端
src/components/              页面、工作区、后台和 UI 组件
src/hooks/                   工作区状态、登录态、线路健康与流程编排
src/lib/                     前端业务 API、Supabase、Tauri、OSS、历史、下载
src-tauri/                   Tauri 桌面端和 Rust 云网关共享源码
src-tauri/src/bin/           backend_gateway.rs 云网关入口
supabase/                    Postgres schema、RLS、迁移 SQL
scripts/                     构建、诊断、数据导出、运维脚本
tests/                       tsx / mjs 行为断言测试
docs/                        项目说明、部署、架构、参考和计划文档
```

## 本地开发

前置条件：

- Node.js 18+
- Rust stable + Cargo
- Windows WebView2 Runtime
- Windows 打包需要 Visual Studio 2022 Build Tools，勾选 C++ 桌面开发工具链

安装依赖：

```powershell
npm install
```

启动开发模式：

```powershell
npm run tauri:dev
```

前端构建：

```powershell
npm run build
```

桌面打包：

```powershell
npm run tauri:build
```

## 环境变量

模板文件：

- [.env.example](.env.example)
- [docs/cloud-gateway/gateway.env.example](docs/cloud-gateway/gateway.env.example)

生产推荐网关模式：桌面安装包只内置 `VITE_BACKEND_GATEWAY_URL`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 这类公开配置；生图 API Key、OSS AccessKey、Supabase service role 放在服务器 `/opt/csgh-gateway/secrets/gateway.env`。

不要把真实密钥、数据库连接串、OSS AccessKey 或完整签名 URL 写进仓库文档。

## 常用验证

```powershell
npm run build
npx tsx tests/mandatory-update.test.ts
npx tsx tests/sidebar-layout.test.ts
```

Rust/Tauri 相关改动按影响范围追加：

```powershell
cmd.exe /c "call ""D:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"" -arch=x64 >NUL && cargo test --manifest-path src-tauri\Cargo.toml app_update"
npm run tauri:build
```

## 关键文档

| 文档 | 用途 |
|---|---|
| [docs/项目总览.md](docs/项目总览.md) | 完整项目事实和技术架构 |
| [docs/文档索引.md](docs/文档索引.md) | 全部公开文档导航 |
| [docs/云服务器信息.md](docs/云服务器信息.md) | 云服务器和网关运维入口 |
| [docs/自动更新.md](docs/自动更新.md) | 发布安装包和强制更新流程 |
| [docs/operations/云端部署与分发手册.md](docs/operations/云端部署与分发手册.md) | 生产云端部署和客户端分发 |
| [docs/cloud-gateway/README.md](docs/cloud-gateway/README.md) | 云端 Rust 网关部署 |
| [docs/architecture/生图并发与网关分配框架.md](docs/architecture/生图并发与网关分配框架.md) | 多用户多线路调度设计 |
