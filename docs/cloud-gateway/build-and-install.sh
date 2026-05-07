#!/usr/bin/env bash
# ==============================================================================
# 呈尚策划 美工生图系统 PRO · 编译并安装网关到 systemd
# 用法：在项目根目录（包含 src-tauri/）执行
#   sudo bash docs/cloud-gateway/build-and-install.sh
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "必须用 root 运行，请 sudo bash build-and-install.sh"
  exit 1
fi

PROJECT_ROOT="$(pwd)"
if [[ ! -f "$PROJECT_ROOT/src-tauri/Cargo.toml" ]]; then
  err "请在项目根目录执行此脚本（找不到 src-tauri/Cargo.toml）"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ----- 1. 编译 ---------------------------------------------------------------
log "切换到 csgh 用户编译 backend-gateway（release 模式，禁用 tauri-commands）..."
chown -R csgh:csgh "$PROJECT_ROOT"
sudo -u csgh bash -c "cd '$PROJECT_ROOT/src-tauri' && \
  source ~/.cargo/env && \
  cargo build --release --bin backend-gateway --no-default-features"

# ----- 2. 安装二进制 ---------------------------------------------------------
log "安装二进制到 /opt/csgh-gateway/bin/..."
install -o csgh -g csgh -m 0755 \
  "$PROJECT_ROOT/src-tauri/target/release/backend-gateway" \
  /opt/csgh-gateway/bin/backend-gateway

# ----- 3. 处理 .env ----------------------------------------------------------
ENV_FILE=/opt/csgh-gateway/secrets/gateway.env
if [[ ! -f "$ENV_FILE" ]]; then
  log "首次安装，复制 gateway.env.example 到 $ENV_FILE"
  install -o csgh -g csgh -m 0600 \
    "$SCRIPT_DIR/gateway.env.example" "$ENV_FILE"
  warn "请立即编辑 $ENV_FILE 填入真实密钥后再启动服务"
else
  log ".env 已存在，保留现有密钥配置"
fi

# ----- 4. 安装 systemd unit -------------------------------------------------
log "安装 systemd unit..."
install -m 0644 \
  "$SCRIPT_DIR/csgh-backend-gateway.service" \
  /etc/systemd/system/csgh-backend-gateway.service

systemctl daemon-reload

if systemctl is-active --quiet csgh-backend-gateway; then
  log "重启 csgh-backend-gateway 服务..."
  systemctl restart csgh-backend-gateway
else
  log "启用并启动 csgh-backend-gateway 服务..."
  systemctl enable --now csgh-backend-gateway
fi

sleep 2
systemctl status csgh-backend-gateway --no-pager -l || true

# ----- 5. 健康检查 -----------------------------------------------------------
log "健康检查 http://127.0.0.1:8787/health ..."
if curl -fsS http://127.0.0.1:8787/health; then
  echo
  log "✓ 网关运行正常"
else
  err "✗ 健康检查失败，查看日志：journalctl -u csgh-backend-gateway -e"
  exit 1
fi

log "================================================================"
log "  完成 ✓ 下一步配置 Caddy 反代 + 域名 HTTPS："
log "    1. cp $SCRIPT_DIR/Caddyfile /etc/caddy/Caddyfile"
log "    2. 编辑域名后 systemctl reload caddy"
log "================================================================"
