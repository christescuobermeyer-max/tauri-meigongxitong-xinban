param(
    [Parameter(Mandatory = $true)]
    [string]$GatewayUrl
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($GatewayUrl -notmatch "^https?://") {
    throw "GatewayUrl 必须以 http:// 或 https:// 开头，例如：http://192.168.1.10:8787"
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $projectRoot

$env:VITE_BACKEND_GATEWAY_URL = $GatewayUrl.TrimEnd("/")
Write-Host "员工端安装包将使用后端网关：" -ForegroundColor Cyan
Write-Host "  $env:VITE_BACKEND_GATEWAY_URL"

npm run tauri:build
