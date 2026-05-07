# 阿里云轻量服务器 · 后端网关部署手册

> 适用机型：阿里云轻量应用服务器 2C2G/40GB·200Mbps·**香港地域**·Alibaba Cloud Linux 3.21
> 客户端：6 台 Windows 员工电脑通过 HTTPS 访问云端网关
> 月费：¥56/月（已选择套餐）

---

## 一、整体架构

```
┌────────────┐ HTTPS ┌─────────────────────┐
│ 6 台员工电脑 │ ──────────► │   阿里云香港轻量      │
│ Tauri 客户端 │             │  Caddy(443) ──┐    │
└──────┬─────┘             │               ▼    │
       │                   │   backend-gateway   │
       │                   │      :8787          │
       │ 直连              │      │              │
       ▼                   └──────┼──────────────┘
   ┌────────────┐                │
   │ Supabase    │                ├──► 云雾/Pockgo/APIMart 等上游 API
   │ (Auth/DB)   │                ├──► Supabase（service_role 操作）
   └─────────────┘                └──► 阿里云 OSS（图片归档）
```

**关键划分**：
- **Supabase Auth/DB** → 客户端**直连**（无需经过网关，每台员工电脑用 anon key）
- **生图 API、OSS 上传、admin 创建账号** → **必须经过网关**（敏感密钥只在云端）

---

## 二、前置准备清单

| 项 | 说明 |
|---|---|
| 域名 | 至少 1 个二级域名（如 `gw.yourcompany.com`），免备案香港地域无需阿里云备案 |
| Supabase 项目 | 已建好，记录 URL / anon key / service_role key |
| 5 条生图线路 API Key | 云雾、vectorengine、pockgo、APIMart 等 |
| 阿里云 OSS | bucket + RAM 子账号 AccessKey（仅授权 PutObject/GetObject） |
| SSH 工具 | Windows 推荐 [Termius](https://termius.com/) 或 PowerShell 自带 ssh |

---

## 三、部署步骤

### 步骤 1：购买后获取 SSH 信息

1. 服务器购买完成后，进入 [阿里云轻量控制台](https://swas.console.aliyun.com/)
2. 点你的实例 → 「重置密码」 → 设置 root 密码（记牢）
3. 记录公网 IP（截图右上角的 IPv4 地址）
4. 「防火墙」标签页确认：22(SSH)、80(HTTP)、443(HTTPS) **三条规则都已开放**（默认就开了）

### 步骤 2：SSH 登录

```bash
ssh root@你的公网IP
# 输入刚才设置的密码
```

### 步骤 3：上传项目代码

**推荐方式（git clone）**：

```bash
# 假设代码已经推到你自己的 Git 仓库
cd /home/csgh
git clone https://你的仓库地址.git csgh-image-studio
cd csgh-image-studio
```

如果暂时没上 Git，可以先在本地用 `scp` 上传：

```powershell
# 在你本地 Windows PowerShell（项目根目录）执行
scp -r . root@你的公网IP:/root/csgh-image-studio
```

### 步骤 4：运行系统初始化

```bash
cd /root/csgh-image-studio   # 或 /home/csgh/csgh-image-studio
sudo bash docs/cloud-gateway/bootstrap.sh
```

这一步会：
- 更新系统、安装 Caddy + Rust 工具链
- 创建 2 GB swap、低权限运行用户 `csgh`
- 启动 firewalld 防火墙
- 准备 `/opt/csgh-gateway/` 目录

> ⚠️ Rust 编译工具链下载约 200 MB，3-5 分钟。

### 步骤 5：填写密钥环境变量

```bash
sudo cp docs/cloud-gateway/gateway.env.example /opt/csgh-gateway/secrets/gateway.env
sudo chown csgh:csgh /opt/csgh-gateway/secrets/gateway.env
sudo chmod 600 /opt/csgh-gateway/secrets/gateway.env
sudo vim /opt/csgh-gateway/secrets/gateway.env
```

按文件内注释把 Supabase / 5 条线路 / OSS 全部填进去。**这个文件是整个系统最敏感的密钥集合，权限必须 600**。

### 步骤 6：编译并启动网关

```bash
sudo bash docs/cloud-gateway/build-and-install.sh
```

预计耗时 **3-8 分钟**（首次编译要拉 cargo 依赖）。

成功标志：
```
[INFO] ✓ 网关运行正常
{"ok":true,"service":"csgh-backend-gateway"}
```

### 步骤 7：配置域名

去你的域名服务商（阿里云/Cloudflare/腾讯云）做一条 **A 记录**：

```
gw.yourcompany.com → 你的服务器公网 IP
```

DNS 生效用 `dig gw.yourcompany.com` 或 `nslookup` 确认（一般 1-10 分钟）。

### 步骤 8：配置 Caddy 启用 HTTPS

```bash
sudo cp docs/cloud-gateway/Caddyfile /etc/caddy/Caddyfile
sudo vim /etc/caddy/Caddyfile
# 把第一行 gateway.example.com 改成你的真实域名

sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddy 会**自动**向 Let's Encrypt 申请 HTTPS 证书并续期，无需手动操作。30 秒内能在浏览器访问 `https://gw.yourcompany.com/health`，看到 JSON 响应即成功。

### 步骤 9：客户端打包发布

在你的 Windows 开发机执行：

```powershell
$env:VITE_BACKEND_GATEWAY_URL="https://gw.yourcompany.com"
npm run tauri:build
```

把 `src-tauri/target/release/bundle/msi/*.msi` 分发到 6 台员工电脑安装。客户端配置见 [`client-setup.md`](./client-setup.md)。

---

## 四、日常运维

### 查看日志

```bash
# 网关业务日志
sudo journalctl -u csgh-backend-gateway -f

# Caddy 访问日志
sudo tail -f /var/log/caddy/gateway.log
```

### 重启服务

```bash
sudo systemctl restart csgh-backend-gateway
sudo systemctl reload caddy   # Caddy 改配置只需 reload
```

### 升级到新版本

```bash
cd /root/csgh-image-studio
sudo bash docs/cloud-gateway/update.sh
```

会自动 `git pull` → 重新编译 → 重启服务 → 健康检查。

### 监控资源

```bash
# 查看内存使用（重点关注 backend-gateway 进程）
htop
# 或
systemctl status csgh-backend-gateway   # 显示当前内存占用

# 查看 swap 是否被使用
free -h
```

如果 swap 被持续占用 > 500 MB，说明业务峰值已经吃满 2 GB 物理内存，建议考虑升级到 2C4G。

---

## 五、故障排查

### 1. 健康检查 502/超时

```bash
# 先确认网关进程在跑
sudo systemctl status csgh-backend-gateway
# 看错误日志
sudo journalctl -u csgh-backend-gateway -e --no-pager
```

常见原因：
- `gateway.env` 缺密钥 → 启动直接失败 → journal 会显示「缺少环境变量：xxx」
- 端口被占用 → `ss -tlnp | grep 8787` 看占用

### 2. Caddy 申请证书失败

```bash
sudo journalctl -u caddy -e --no-pager
```

常见原因：
- DNS 没生效 → `dig 你的域名` 检查
- 80 端口被防火墙挡 → `firewall-cmd --list-all` 确认 http 在 services 里
- 域名解析到 CDN（Cloudflare 橙云）→ 必须改成「仅 DNS」灰云模式

### 3. 客户端调用 401 / 登录态无效

网关每次请求都会用 `Bearer <access_token>` 调 Supabase 验证。
- 客户端的 `VITE_SUPABASE_URL` 和服务器 `VITE_SUPABASE_URL` 必须**指向同一个 Supabase 项目**
- 客户端登录态过期需要重新登录

### 4. 内存被 OOM kill

```bash
# 查看是否被 OOM 杀过
dmesg -T | grep -i 'killed process'
# 或
journalctl --since "1 hour ago" | grep -i oom
```

如果频繁触发，systemd 会自动重启（已配置 `Restart=always`）。建议：
- 临时：增大 swap（`fallocate -l 4G /swapfile2` 同样流程）
- 长期：升级到 2C4G

### 5. 跨境 / Supabase 连不上

香港地域 → Supabase（AWS）正常情况下延迟 50-100ms 稳定。如出问题：
```bash
curl -v https://你的项目.supabase.co/auth/v1/health
ping -c 4 你的项目.supabase.co
```

---

## 六、安全加固清单

部署完成后**强烈建议**做：

- [x] systemd unit 已开启 `NoNewPrivileges`、`ProtectSystem=strict` 等加固（脚本默认）
- [x] gateway.env 权限 600，仅 csgh 用户可读（脚本默认）
- [ ] **关闭 SSH 密码登录，改用密钥**：
  ```bash
  # 本地生成密钥后上传 ~/.ssh/authorized_keys
  sudo vim /etc/ssh/sshd_config
  # 改 PasswordAuthentication no
  sudo systemctl restart sshd
  ```
- [ ] **修改默认 SSH 端口**（22 → 自定义如 52022）：同上 sshd_config，记得在阿里云控制台防火墙放行新端口
- [ ] **fail2ban**（可选）：屏蔽暴力破解 IP
  ```bash
  sudo dnf install -y fail2ban
  sudo systemctl enable --now fail2ban
  ```
- [ ] **OSS RAM 子账号**：不要用 OSS 主账号 AccessKey，子账号只授权 bucket 内的 PutObject/GetObject
- [ ] **Supabase RLS 策略**：确认 `profiles`、`generation_logs` 等表的 RLS 已启用（项目应已默认开启）

---

## 七、文件清单

`docs/cloud-gateway/` 目录下的所有文件：

| 文件 | 用途 |
|---|---|
| `bootstrap.sh` | 系统初始化（仅首次执行一次） |
| `build-and-install.sh` | 编译网关 + 安装 systemd（首次部署执行） |
| `update.sh` | 拉新代码 + 重编译 + 重启（日常升级） |
| `csgh-backend-gateway.service` | systemd unit 模板 |
| `Caddyfile` | Caddy 反代配置模板 |
| `gateway.env.example` | 环境变量模板 |
| `README.md` | 本文档 |
| `client-setup.md` | 6 台员工电脑配置指南 |

---

## 八、月度成本预估

| 项 | 费用 | 说明 |
|---|---|---|
| 阿里云轻量香港 2C2G | **¥56/月** | 已含全部公网流量 |
| 域名 | **¥0-5/月** | 普通 .com 年费 50-70 元 |
| Supabase | **¥0** | Free Tier 完全够 6 人 / 1000张图/天 |
| 阿里云 OSS | **¥10-20/月** | 主要存储费 + 极少回源流量 |
| 5 条生图线路 API | 按调用量 | 与本部署方案无关 |
| **合计** | **约 ¥70-85/月** | |
