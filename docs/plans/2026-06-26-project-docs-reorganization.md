# 项目文档梳理与归档执行计划

> 创建日期：2026-06-26  
> 状态：已完成  
> 范围：只整理文档、索引和项目说明，不改业务代码，不移动本地私密凭证文件。

## 目标

把“呈尚策划美工生图系统 PRO”的技术栈、云资源、文件架构、部署流程和文档索引梳理成清晰结构，并让根目录只保留必要入口文档。

## 已确认事实

### 技术栈

| 层级 | 当前技术 |
|---|---|
| 桌面端 | Tauri 2、Rust、Windows MSI/NSIS 打包 |
| 前端 | React 18、TypeScript、Vite 6 |
| 云端网关 | Rust、Axum、systemd、Caddy 反代 |
| 云服务器 | 阿里云轻量应用服务器，香港地域，2C2G / 40GB / 200Mbps，Alibaba Cloud Linux 3 |
| 云数据库与认证 | Supabase Auth、Postgres、RLS、pg_cron |
| 图片与安装包存储 | 阿里云 OSS |
| 加速 | 阿里云全球加速 GA，`gw.hbcsch.pw` CNAME 到 GA |
| 上游生图 | 多线路 image-2：云雾、VectorEngine、Pockgo、APIMart、Manxiaobai、OtuAPI 等，统一由网关调度 |
| 自动更新 | Supabase `app_update_config` 控制版本与强制更新，安装包放 OSS |

### 当前云资源入口

| 项 | 值 |
|---|---|
| 网关域名 | `https://gw.hbcsch.pw` |
| 源站公网 IP | `47.86.225.83` |
| SSH 用户 | `admin` |
| 服务器项目目录 | `/opt/csgh-image-studio` |
| 网关运行目录 | `/opt/csgh-gateway` |
| systemd 服务 | `csgh-backend-gateway` |
| Caddy 服务 | `caddy` |

### 现有文档问题

1. 根目录 `.md` 混有项目入口、云部署、SSH、API 参考和并发框架文档，职责不清。
2. `AGENTS.md` 只写了摘要，缺少完整技术栈、云资源和新文档索引。
3. `docs/项目总览.md` 有核心信息，但不够完整，不能单独回答“项目用了哪些云服务和技术”。
4. 云网关文档分散在 `docs/backend-gateway-deploy.md`、`docs/cloud-gateway/README.md`、根目录 `云端部署与分发手册.md`。
5. 本地私密文档 `运维凭证.local.md` 被 `.gitignore` 忽略，不能纳入公开文档整理。

## 目标文档结构

```text
根目录/
├── AGENTS.md                    # AI 协作入口：短摘要 + 文档索引
├── CLAUDE.md                    # 通用行为约束，保留原位
├── README.md                    # 面向开发/使用的项目入口
└── docs/
    ├── 项目总览.md              # 项目完整总览：技术栈、云资源、架构、数据流
    ├── 文档索引.md              # 所有文档入口与阅读顺序
    ├── 云服务器信息.md          # 云服务器与网关定位信息，不含密钥
    ├── 自动更新.md              # 自动更新发布流程
    ├── backend-gateway-deploy.md
    ├── local-backend-gateway-windows.md
    ├── 六台电脑独立部署指南.md
    ├── architecture/
    │   └── 生图并发与网关分配框架.md
    ├── operations/
    │   ├── 云端部署与分发手册.md
    │   └── 云服务器添加SSH公钥.md
    ├── reference/
    │   └── GPT-Image-2 API 调用说明.md
    ├── cloud-gateway/
    │   └── 云端网关脚本、Caddy、systemd、GA 文档
    └── plans/
        └── 历史实施计划与本执行计划
```

## 执行步骤

### 第 1 步：建立分类目录

- 创建 `docs/architecture/`
- 创建 `docs/operations/`
- 创建 `docs/reference/`

验收：三个目录存在，不改业务源码。

### 第 2 步：移动根目录杂项文档

移动公开文档：

| 原路径 | 新路径 | 原因 |
|---|---|---|
| `生图并发与网关分配框架.md` | `docs/architecture/生图并发与网关分配框架.md` | 架构设计文档 |
| `云端部署与分发手册.md` | `docs/operations/云端部署与分发手册.md` | 生产部署与分发 |
| `云服务器添加SSH公钥.md` | `docs/operations/云服务器添加SSH公钥.md` | 服务器运维 |
| `GPT-Image-2 API 调用说明.md` | `docs/reference/GPT-Image-2 API 调用说明.md` | 外部 API 参考 |

不移动：

| 路径 | 原因 |
|---|---|
| `运维凭证.local.md` | 本地私密凭证，已被 `.gitignore` 忽略 |
| `AGENTS.md` | 协作入口 |
| `CLAUDE.md` | 行为约束入口 |
| `README.md` | 项目入口 |

验收：根目录公开 `.md` 只剩 `AGENTS.md`、`CLAUDE.md`、`README.md`；本地私密 `.local.md` 可继续留在本机但不入仓。

### 第 3 步：重写 `docs/项目总览.md`

内容结构：

1. 项目定位
2. 当前技术栈总表
3. 云资源与外部服务总表
4. 运行架构
5. 数据流
6. 文件架构
7. 核心模块索引
8. 环境变量边界
9. 测试与发布边界
10. 相关文档

要求：

- 写清“用的是什么云服务器、云数据库、OSS 存图、安装包分发、GA 加速、上游生图线路”。
- 只写公开定位信息，不写真实密钥、数据库连接串或签名 URL。
- 保持文档偏“总览”，复杂细节链接到专门文档。

验收：该文档能独立回答新接手开发者的项目背景问题。

### 第 4 步：新增 `docs/文档索引.md`

索引按用途分类：

- 必读入口
- 架构设计
- 云部署与服务器
- 发布与更新
- 本地/多机器部署
- API 与参考
- 实施计划
- 本地私密文件说明

验收：所有公开文档都能从索引找到；路径全部指向整理后的新位置。

### 第 5 步：更新 `AGENTS.md`

保留短入口定位，补充：

- 完整技术栈摘要
- 云资源摘要
- 更新后的仓库结构
- 更新后的文档索引
- 根目录文档归类规则

要求：

- 不把 `AGENTS.md` 写成详细设计文档。
- 详细内容只链接 `docs/项目总览.md`、`docs/文档索引.md`、`docs/云服务器信息.md` 等。

验收：AI 接手时先读 `AGENTS.md` 能知道下一步该读哪份详细文档。

### 第 6 步：更新交叉引用

需要检查并更新：

- `docs/项目总览.md`
- `docs/云服务器信息.md`
- `README.md`
- 被移动文档内部如果引用旧路径，也要改成新路径。

验收：`rg` 搜索旧根目录文档路径时，不再有公开索引指向旧位置。

### 第 7 步：校验

执行只读检查：

```powershell
Get-ChildItem -File -Filter *.md
Get-ChildItem docs -Recurse -File -Filter *.md
rg -n "云端部署与分发手册.md|云服务器添加SSH公钥.md|生图并发与网关分配框架.md|GPT-Image-2 API 调用说明.md" AGENTS.md README.md docs --glob '!docs/plans/2026-06-26-project-docs-reorganization.md'
rg -n "(SUPABASE_SERVICE_ROLE_KEY=|ACCESS_KEY_SECRET=|API_KEY=|sb_secret|BEGIN .*PRIVATE KEY|签名下载链接)" AGENTS.md README.md docs --glob '!docs/plans/2026-06-26-project-docs-reorganization.md'
```

验收：

- 根目录文档清爽。
- 文档索引路径准确。
- 不新增真实密钥或完整签名 URL。
- 不运行构建，因为本次只改文档。

## 风险与处理

| 风险 | 处理 |
|---|---|
| 工作区已有大量未提交改动 | 只改文档相关文件，不碰业务源码 |
| 历史文档内容可能过时 | 在总览中以当前代码和已核对服务器信息为准，历史文档保留为操作参考 |
| 本地凭证文档含敏感信息 | 不读取、不移动、不索引具体内容，只说明它是本地私密文件 |
| 移动文档导致旧链接失效 | 新增 `docs/文档索引.md`，并更新 AGENTS/README/总览里的引用 |

## 执行进度

- [x] 收集项目配置、云服务、数据库和现有文档事实
- [x] 写出本执行计划
- [x] 建立分类目录
- [x] 移动根目录杂项文档
- [x] 重写 `docs/项目总览.md`
- [x] 新增 `docs/文档索引.md`
- [x] 更新 `AGENTS.md`
- [x] 更新交叉引用
- [x] 校验敏感信息和文档路径
