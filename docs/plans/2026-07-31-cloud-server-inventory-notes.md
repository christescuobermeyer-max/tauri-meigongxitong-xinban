# 云服务器迁移盘点笔记

## 信息来源

- 当前仓库 `AGENTS.md`、`docs/项目总览.md`、`docs/云服务器信息.md`
- 旧服务器只读 SSH 盘点结果
- 椰子云实例 `server-2057` 控制台和新服务器只读 SSH 盘点结果
- 当前仓库部署脚本、systemd 和 Caddy 配置模板

## 安全边界

- 不读取 `/opt/csgh-gateway/secrets/gateway.env` 等密钥文件内容。
- 不输出环境变量值、访问令牌、私钥、数据库连接串和完整签名 URL。
- 只记录配置文件路径、变量名、权限、大小、校验和与迁移方法。

## 盘点结论

- 已完成服务器基础信息、项目目录、服务、端口、运行时、DNS、Caddy、状态数据、缓存、日志、任务和防火墙只读盘点。
- 未读取任何活动密钥文件内容；正式文档只记录密钥文件路径、权限和迁移办法。
- 服务器不是单项目主机：包含 4 个业务服务和 1 个共用 HTTPS 入口，迁移时必须作为一个整体切换。

## 已确认的服务器基础信息

- 主机名：`iZj6c8w5q10ln2vkngrgypZ`
- 系统：Alibaba Cloud Linux 3.2104 U13，x86_64，内核 5.10
- 时区：Asia/Shanghai（盘点时间输出为 `+08:00`）
- 云实例：阿里云 ECS `ecs.e-c1m2.xlarge`，`cn-hongkong-d`
- 资源：4 vCPU、约 7.3 GiB RAM、2 GiB Swap
- 根盘：40 GB ext4，已用约 25 GB，可用约 14 GB，使用率 65%；底层虚拟盘显示 70 GB，但根分区仅约 40 GB
- 内存：约 7.3 GiB，Swap 2 GiB
- 运维账号：`admin`，具备无交互 sudo；业务账号包含 `csgh`、`caddy`
- SSH：22；Caddy：80/443；Caddy Admin：仅 `127.0.0.1:2019`
- SSH 密码登录关闭，`admin` 公钥登录可用且具备 `NOPASSWD` sudo；`PermitRootLogin` 实测仍为 `yes`，新机应显式设为 `no`

## 已确认的业务服务

| systemd 服务 | 运行用户 | 入口/进程 | 监听地址 | 初步归属 |
|---|---|---|---|---|
| `csgh-backend-gateway.service` | `csgh` | `/opt/csgh-gateway/bin/backend-gateway` | `0.0.0.0:8787` | 呈尚策划美工生图系统 PRO |
| `chengshang-auto-meal-worker.service` | `admin` | `/usr/bin/node /opt/chengshang-auto-meal/server.js` | `0.0.0.0:8797` | 呈尚自动出餐系统 |
| `dpcs-api.service` | `root` | Uvicorn `app.main:app` | `127.0.0.1:8810` | 双平台合同系统 API |
| `dpcs-store-ocr.service` | `root` | Uvicorn `app.main:app` | `127.0.0.1:8800` | 双平台合同系统门店资源 OCR |
| `caddy.service` | `caddy` | `/usr/local/bin/caddy` | 80/443 | 所有公网 HTTP(S) 入口 |

以上 5 个服务均为 `enabled` 且盘点时均为 `active`，4 个本机健康检查和 3 个公网健康检查均通过。

## 运行时和基础设施

- Node.js `20.20.2`、npm `10.8.2`
- 两个 Python 服务均使用 Python `3.11.13` 独立 venv；系统默认 `python3` 为 `3.6.8`
- Caddy `2.8.4`，手工安装于 `/usr/local/bin/caddy`
- Rust `1.95.0`，Git `2.43.7`，rsync `3.1.3`
- 无 Docker、Podman、PM2；无本地 MongoDB、PostgreSQL、Redis、Nginx 或 Apache 业务实例
- 无业务 crontab；systemd timer 仅有系统缓存和临时文件清理
- firewalld 仅放行 SSH/HTTP/HTTPS；8787、8797、8800、8810 未对公网放行

## 已确认的项目和数据目录

- `/opt/csgh-image-studio`：生图系统 Git 仓库，约 2.4 GB；大头是 `src-tauri` 构建目录。
- `/opt/csgh-gateway`：生图网关运行目录，约 84 MB；含 `bin/`、`state/`、`secrets/`、`backups/`。
- `/opt/chengshang-auto-meal`：自动出餐 Node 项目，约 63 MB；含 `node_modules/` 和 `prompts/`。
- `/opt/dual-platform-contract-system`：双平台合同系统，约 7.5 GB；含前端、`dpcs-api/`、`store-ocr-service/`、`releases/`、`backups/`、`_backups/`、`cookies/`。
- `/opt/dual-platform-contract-system-updates`：合同系统更新/Windows 分发内容，约 25 MB。
- `/opt/chengshang-contract-auth`：合同相关认证状态目录，约 32 KB，需确认消费者。
- `/home/admin/csgh-build`：生图网关构建目录，约 431 MB。
- `/home/admin`、`/home/csgh` 下有 Rust/npm/cache；是否迁移应按“重建工具链、只迁必要状态”处理。

## 必须迁移的状态与运行缓存

- `/opt/csgh-gateway/state/paused-lines.json`
- `/opt/csgh-gateway/state/apimart-pending-tasks.json`
- `/opt/chengshang-contract-auth/storage-states/`（3 个登录状态文件，权限 600）
- `/opt/dual-platform-contract-system/cookies/`（当前为空，仍保留目录和权限）
- `/home/admin/.cache/ms-playwright/`（自动出餐 Chromium，当前可执行文件位于该目录）
- `/root/.cache/ms-playwright/` 和 `/home/admin/.cache/paddle/` 等浏览器/OCR 缓存；保留可避免切换时临时下载失败
- `/var/lib/caddy/`（TLS 证书状态）和 `/var/log/caddy/`
- `/opt/dual-platform-contract-system/{releases,backups,_backups}/`、`/opt/*backup*` 等历史发布与备份
- `/home/admin/csgh-build/` 及 `/opt` 下全部目录；旧机整盘快照作为未识别内容的最终兜底

## 配置、权限和用户

- `admin` UID/GID `1000:1000`；`csgh` 为 `995:992`；`caddy` 为 `994:991`
- `/opt/csgh-gateway/secrets/gateway.env`：`root:root`、600；父目录 `csgh:csgh`、700
- `/opt/chengshang-auto-meal/.env`：`admin:admin`、600
- `/opt/dual-platform-contract-system/dpcs-api/secrets/dpcs-api.env`：`root:root`、600
- `/opt/dual-platform-contract-system/store-ocr-service/secrets/ocr.env`：`admin:admin`、600
- 业务 unit 位于 `/etc/systemd/system/`；生图网关另有 `csgh-backend-gateway.service.d/override.conf`
- Caddy 配置 `/etc/caddy/Caddyfile`；证书目录 `/var/lib/caddy`

## Caddy 和公网路由

- 唯一域名：`gw.hbcsch.pw`
- `/dual-platform-contract-system/*` 反代到 OSS，供合同系统更新/静态分发
- 合同系统指定 `/api/...` 路径反代到 `127.0.0.1:8810`
- `/store-ocr/*` 去掉前缀后反代到 `127.0.0.1:8800`
- 其余请求反代到生图网关 `127.0.0.1:8787`
- 自动出餐 `8797` 没有 Caddy 路由且未被 firewalld 放行；其进程内 worker 通过 `setInterval` 调度，迁移前仍需由该项目确认是否存在旧 IP 直连消费者
- 对活动源码执行排除 env/secret/venv/缓存/备份的文件名级搜索：自动出餐和合同系统未命中旧公网 IP、旧私网 IP 或 `:8797`；生图仓库只在两份历史文档中命中旧 IP
- TLS 证书盘点时有效至 2026-10-04；迁移后仍需依赖 Caddy自动续期
- 公网 DNS 经公共 DoH 核对为 A 记录直连 `47.86.225.83`，TTL 600；历史文档中的 GA/CNAME 描述已过时或当前未启用

## 外部依赖

- 生图网关：Supabase、阿里云 OSS、多条 image-2 API 线路
- 自动出餐：外部 MongoDB、Supabase、Playwright/美团或饿了么页面
- 合同 API：外部 MongoDB、OSS、第三方合同平台登录状态、内部 OCR 服务
- OCR：PaddleOCR/PaddlePaddle 本地模型和外部 OCR LLM API
- 外部服务均可能限制出口 IP；新公网 IP必须在迁移前加入白名单，旧 IP在观察期后再移除

## 源码和可重建性

- `/opt/csgh-image-studio` 是服务器上唯一检测到的 Git 仓库：`main`、commit `33955e7793f6fe1b59dd7e0fdf6e64fe0036693b`。
- 该仓库有 117 个已修改文件和 13 个未跟踪项，合计 130 项，不能通过重新 clone 替代服务器目录复制。
- 自动出餐和双平台合同系统目录没有 `.git` 元数据，必须按服务器现状完整复制。
- 双平台合同系统约 7.5 GB，其中 API 多份备份、OCR venv 和本地 wheels 占主要空间。

## 容量观察

- `/opt/dual-platform-contract-system` 中存在多份 700 MB 级 API 备份和约 1.7 GB 的 `backups/`。
- `/opt/csgh-image-studio/src-tauri` 约 2.4 GB，主要为可重建的 Rust `target`。
- 全量迁移前应区分“必须保留的数据/状态”和“可重建缓存”，但旧服务器整盘快照仍应完整保留作为兜底。
- `/var/log` 约 2.2 GB，其中 systemd journal 约 2.1 GB；建议归档旧日志，不直接覆盖新机 journal。
- 新机建议至少 4 vCPU、8 GB RAM、80 GB SSD、x86_64；本次实际目标为 Ubuntu 22.04，需按跨发行版流程重建运行时。
- 旧机除根分区外只有 `/boot/efi` 持久挂载；`/mnt`、`/media`、`/srv` 均为空，`/home` 只有 `admin` 和 `csgh`。迁移归档仍分别保存根文件系统、`/root`、完整 `/home`、完整 `/opt` 和 EFI，避免活动副本重建后丢失旧发行版原件。
- 活动 `/opt` 最终增量必须排除新机网关二进制、Rust `target`、`node_modules` 和两个 Python venv；否则旧机内容会覆盖 Ubuntu 原生运行时。排除不影响 `/srv/legacy-server/opt` 的完整旧机副本。
- 最终只读复核时，旧机 5 个 systemd 服务均为 active，4 个本机健康接口通过，3 个公网 API 健康路径和 updater 文件均返回 200；新机业务服务仍全部 inactive。

## 新服务器实测信息

- 云厂商/产品：椰子云香港二区，`香港2区-8H8G 20M`，实例 `server-2057`。
- 公网及出口 IP：`156.225.23.248`；私网 IP：`10.0.167.2/24`；主机名：`ser621695285778`。
- 系统：Ubuntu 22.04 LTS、KVM、x86_64、glibc 2.35、内核 `5.15.0-30-generic`。
- 资源：8 vCPU、约 7.8 GiB RAM，CPU 支持 AVX/AVX2；无 swap。
- 系统盘：`/dev/vda1` 30 GB ext4，已用约 2.3 GB，可用约 28 GB。
- 数据盘：`/dev/vdb1` 70 GB ext4，UUID `a0429bfb-5f41-4ed8-b8f8-29c408f8557f`，文件系统 clean、从未挂载、未写 fstab。
- 当前只有 SSH 22 监听；没有 Caddy、Node.js、npm、Rust、Cargo、Docker 或业务服务。
- 已安装 Python 3.10、rsync、Git、curl、wget、tar、zstd；两个业务 Python 服务要求 3.11.13。
- 目标机只有 root 交互账号，未创建 `admin`、`csgh`、`caddy`；UID/GID 994、995、1000 当前空闲。
- 当前 SSH 允许 root、公钥和密码登录；本次为盘点临时启用了公钥，正式迁移前必须创建 `admin` 并关闭 root/密码远程登录。
- 椰子云控制台未绑定安全组，UFW inactive，iptables INPUT ACCEPT；公网已出现 SSH 爆破尝试。
- 本次重新查看椰子云产品详情页：实例运行中、登录信息和规格与 SSH 实测一致；安全组列表仍为空，设置页只显示 ISO 挂载和启动项，未看到快照/备份入口。迁移前需要在用户中心或工单确认恢复点能力，不能默认认为已有快照。
- 当前工作站 IPv4 出口实测为 `183.93.209.210`，但出口可能因 VPN/线路变化；安全组 SSH 规则应按迁移当天实际来源确认，不能永久写死该地址。
- 时区为 UTC；`systemd-timesyncd` active 但未同步，访问 Ubuntu NTP 的 UDP/123 持续超时。
- 本地开启原 VPN 时，SSH 在 banner 前被远端网络关闭；关闭 VPN 后可直接完成握手和公钥登录。旧服务器访问新机 SSH 始终正常。
- 新机公网出口经 `api.ipify.org` 验证为 `156.225.23.248`，DNS、GitHub、npm、PyPI 和 Let's Encrypt 域名解析正常。
- 本机公钥可在关闭原 VPN 后直连新机；ED25519 主机指纹已从本机与旧服务器两条路径交叉核对并保存到 Windows `known_hosts`。非密码连接资料保存在 Git 忽略的 `.env.ssh.local`。

## 跨发行版兼容结论

- 旧机 glibc 2.32，新机 glibc 2.35。
- 旧 `backend-gateway` 动态依赖 `libssl.so.1.1` 和 `libcrypto.so.1.1`；新机只有 OpenSSL 3，旧二进制不能直接运行，必须从迁移后的完整工作树重编译。
- Caddy 2.8.4 是静态 x86_64 二进制，可在哈希一致后复用。
- 两个旧 Python venv 都固定到 `/usr/bin/python3.11` 且来自 Alibaba Cloud Linux，必须在 Ubuntu 22.04 上重建。
- OCR 目录已有 `paddlepaddle-3.3.1-cp311-cp311-manylinux1_x86_64.whl`，目标 CPU 指令集匹配；仍需做导入、模型预热和真实 OCR 测试。
- 自动出餐有 `package-lock.json`，当前未发现原生 `.node` 文件；仍按 lockfile 重建 `node_modules` 并重新安装 Playwright 系统依赖和 Chromium。
- 旧机实际占用约 25 GB；活动 `/opt` 约 10 GB。新机总盘 100 GB 足够，但必须把数据盘挂到 `/srv` 并将 `/srv/opt` bind 到 `/opt`，否则 30 GB 系统盘不足以承载活动副本和完整归档。

## 盘点错误

- 首次用户列表命令中的远端 `awk $3` 被本地 PowerShell 展开，导致语法错误；已改用 `cut` 重查，用户信息已获取，未影响服务器。
- `lsblk` 的当前版本不支持 `MOUNTPOINTS` 列；磁盘信息已由 `df` 获取，后续改用兼容列名。
- 一次本地 DNS 查询受代理 Fake-IP 影响返回保留地址，已改用公共 DoH/权威结果。
- 一次 root 身份 Git 查询触发安全目录检查，已改用仓库所有者 `csgh` 重查。
- 一次消费者搜索误入历史 secret 备份，只返回路径、未读取或输出内容；后续搜索均排除 secret、备份和缓存目录。
- 初次连接新机时，本地 VPN 出口在 SSH banner 前被服务商网络关闭；关闭 VPN并从旧机交叉验证后，确认 sshd 正常。
- 新机 VNC 中几条命令被 Caps Lock 转成大写，Linux 返回 `command not found`；改用小写命令后验证通过，未损坏 sshd 配置。
- 一次新机用户列表 `awk` 命令受本地 PowerShell 转义影响报错；随后用指定 UID/GID 的 `getent` 重查，目标 ID 均空闲。
