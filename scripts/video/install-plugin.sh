#!/usr/bin/env bash
# 安装抖音兼容插件；yt-dlp 每次启动自动加载，无需重启网关。
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "请使用 sudo 安装抖音解析插件" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/yt_dlp_plugins/extractor/csgh_douyin.py"
PLUGIN_ROOT=/opt/csgh-gateway/bin/yt-dlp-plugins/csgh
TARGET="$PLUGIN_ROOT/yt_dlp_plugins/extractor/csgh_douyin.py"

install -d -o root -g root -m 0755 \
  /opt/csgh-gateway/bin/yt-dlp-plugins \
  "$PLUGIN_ROOT" "$PLUGIN_ROOT/yt_dlp_plugins" "$PLUGIN_ROOT/yt_dlp_plugins/extractor"
if [[ -f "$TARGET" ]]; then
  cp -p -- "$TARGET" "$TARGET.bak-$(date -u +%Y%m%dT%H%M%S%NZ)"
fi
TEMPORARY="$(mktemp "$PLUGIN_ROOT/yt_dlp_plugins/extractor/.csgh-douyin-XXXXXX")"
trap 'rm -f -- "$TEMPORARY"' EXIT
install -o root -g root -m 0644 "$SOURCE" "$TEMPORARY"
mv -f -- "$TEMPORARY" "$TARGET"
echo "抖音解析插件已安装：$TARGET"
