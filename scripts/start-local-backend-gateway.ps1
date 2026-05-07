param(
    [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSCommandPath)),
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$exe = Join-Path $ProjectRoot "src-tauri\target\release\backend-gateway.exe"
$envFile = Join-Path $ProjectRoot ".env.local"

if (-not (Test-Path $exe)) {
    throw "未找到 backend-gateway.exe，请先运行 scripts\build-local-backend-gateway.ps1"
}

if (-not (Test-Path $envFile)) {
    throw "未找到 .env.local，请先在受控电脑上配置生图、OSS、Supabase 密钥。"
}

$env:BACKEND_GATEWAY_HOST = $HostAddress
$env:BACKEND_GATEWAY_PORT = [string]$Port

Set-Location $ProjectRoot

Write-Host "正在启动本地后端网关..." -ForegroundColor Cyan
Write-Host "监听地址：http://$HostAddress`:$Port"
Write-Host "员工端网关地址应填写：http://本机局域网IP:$Port"
Write-Host "健康检查：http://127.0.0.1:$Port/health"
Write-Host ""
Write-Host "如员工电脑无法访问，请用管理员 PowerShell 放行防火墙：" -ForegroundColor Yellow
Write-Host "New-NetFirewallRule -DisplayName 'CSGH Backend Gateway 8787' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow"
Write-Host ""

& $exe
