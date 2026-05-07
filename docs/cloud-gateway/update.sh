#!/usr/bin/env bash
# ==============================================================================
# 网关版本升级脚本（拉取最新代码 → 重新编译 → 平滑重启）
# 用法：在项目根目录 sudo bash docs/cloud-gateway/update.sh
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
  err "必须用 root 运行"
  exit 1
fi

PROJECT_ROOT="$(pwd)"
if [[ ! -f "$PROJECT_ROOT/src-tauri/Cargo.toml" ]]; then
  err "请在项目根目录执行"
  exit 1
fi

log "拉取最新代码..."
sudo -u csgh git -C "$PROJECT_ROOT" pull --ff-only

log "重新编译..."
sudo -u csgh bash -c "cd '$PROJECT_ROOT/src-tauri' && \
  source ~/.cargo/env && \
  cargo build --release --bin backend-gateway"

log "替换二进制..."
install -o csgh -g csgh -m 0755 \
  "$PROJECT_ROOT/src-tauri/target/release/backend-gateway" \
  /opt/csgh-gateway/bin/backend-gateway

log "重启服务..."
systemctl restart csgh-backend-gateway
sleep 2
systemctl status csgh-backend-gateway --no-pager -l | head -20

log "健康检查..."
if curl -fsS http://127.0.0.1:8787/health; then
  echo
  log "✓ 升级完成"
else
  err "✗ 健康检查失败：journalctl -u csgh-backend-gateway -e"
  exit 1
fi
