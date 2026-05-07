#!/usr/bin/env bash
# ==============================================================================
# 呈尚策划 美工生图系统 PRO · 云端网关 一键初始化脚本
# 适用：阿里云轻量应用服务器（香港地域）· Alibaba Cloud Linux 3.21
# 用法：bash bootstrap.sh
# ==============================================================================

set -euo pipefail

# ----- 颜色 ------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "必须用 root 运行，请 sudo bash bootstrap.sh"
  exit 1
fi

# ----- 1. 系统更新 -----------------------------------------------------------
log "更新系统软件包..."
dnf update -y

# ----- 2. 安装基础工具 -------------------------------------------------------
log "安装基础工具（curl, git, vim, htop, ufw 替代品 firewalld）..."
dnf install -y curl git vim htop firewalld tar gzip ca-certificates \
               gcc make pkg-config openssl-devel

# ----- 3. 创建 2 GB swap（应对 OOM 兜底）------------------------------------
if [[ -f /swapfile ]]; then
  warn "/swapfile 已存在，跳过 swap 创建"
else
  log "创建 2 GB swapfile..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
  echo "vm.swappiness=10" >> /etc/sysctl.d/99-swappiness.conf
  sysctl -p /etc/sysctl.d/99-swappiness.conf || true
fi

# ----- 4. 时区设为上海 -------------------------------------------------------
log "设置时区为 Asia/Shanghai..."
timedatectl set-timezone Asia/Shanghai

# ----- 5. 防火墙 -------------------------------------------------------------
log "启动 firewalld，开放 22/80/443，关闭其他端口..."
systemctl enable --now firewalld
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
# 网关自身 8787 不对外开放，仅 Caddy 反代访问
firewall-cmd --reload

# ----- 6. 创建运行用户（不使用 root 跑业务）---------------------------------
if id csgh &>/dev/null; then
  warn "用户 csgh 已存在，跳过"
else
  log "创建低权限用户 csgh..."
  useradd -r -m -s /bin/bash csgh
fi

# ----- 7. 准备目录结构 -------------------------------------------------------
log "准备 /opt/csgh-gateway 目录..."
install -d -o csgh -g csgh -m 0755 /opt/csgh-gateway
install -d -o csgh -g csgh -m 0755 /opt/csgh-gateway/bin
install -d -o csgh -g csgh -m 0700 /opt/csgh-gateway/secrets
install -d -o csgh -g csgh -m 0755 /var/log/csgh-gateway

# ----- 8. 安装 Caddy（反向代理 + 自动 HTTPS）-------------------------------
# Alibaba Cloud Linux 3 没有 copr，直接下载官方静态二进制
if command -v caddy >/dev/null 2>&1; then
  warn "Caddy 已安装，跳过"
else
  log "下载 Caddy 官方二进制..."
  CADDY_VER="2.8.4"
  CADDY_TMP=$(mktemp -d)
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VER}/caddy_${CADDY_VER}_linux_amd64.tar.gz" \
    -o "$CADDY_TMP/caddy.tar.gz"
  tar -xzf "$CADDY_TMP/caddy.tar.gz" -C "$CADDY_TMP" caddy
  install -m 0755 "$CADDY_TMP/caddy" /usr/local/bin/caddy
  rm -rf "$CADDY_TMP"

  log "创建 caddy 用户与目录..."
  id caddy &>/dev/null || useradd -r -d /var/lib/caddy -s /sbin/nologin caddy
  install -d -o caddy -g caddy -m 0755 /var/lib/caddy /var/log/caddy
  install -d -m 0755 /etc/caddy

  log "写入 Caddy systemd unit..."
  cat > /etc/systemd/system/caddy.service <<'CADDY_UNIT'
[Unit]
Description=Caddy Web Server
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
CADDY_UNIT

  # 占位 Caddyfile，避免 systemctl enable 时报错
  if [[ ! -f /etc/caddy/Caddyfile ]]; then
    cat > /etc/caddy/Caddyfile <<'CADDY_PLACEHOLDER'
# 占位配置 · bootstrap 阶段。后续按 docs/cloud-gateway/Caddyfile 模板替换。
:80 {
	respond "csgh-gateway bootstrap placeholder" 200
}
CADDY_PLACEHOLDER
    chown caddy:caddy /etc/caddy/Caddyfile
  fi

  systemctl daemon-reload
  log "Caddy 安装完成（systemd 服务名：caddy）"
fi

# ----- 9. 安装 Rust 工具链（用于编译 backend-gateway）-----------------------
if [[ -x /home/csgh/.cargo/bin/cargo ]]; then
  warn "csgh 用户已安装 Rust，跳过"
else
  log "为 csgh 用户安装 Rust 稳定版..."
  sudo -u csgh bash -c 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable'
fi

# ----- 10. 完成提示 ----------------------------------------------------------
log "================================================================"
log "  系统初始化完成 ✓"
log "  下一步："
log "    1. 上传项目代码到服务器（推荐 git clone）"
log "    2. 编辑 /opt/csgh-gateway/secrets/gateway.env （从 gateway.env.example 复制）"
log "    3. 运行 build-and-install.sh 编译并安装 systemd 服务"
log "    4. 配置域名 DNS 指向本机公网 IP"
log "    5. 编辑 /etc/caddy/Caddyfile 后 systemctl reload caddy"
log "================================================================"
