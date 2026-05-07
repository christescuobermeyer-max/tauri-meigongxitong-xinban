param(
    [int]$Port = 8787,
    [string]$RuleName = "CSGH Backend Gateway 8787"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "请用管理员 PowerShell 运行此脚本，否则无法写入 Windows 防火墙规则。"
}

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "防火墙规则已存在：$RuleName" -ForegroundColor Yellow
    exit 0
}

New-NetFirewallRule `
    -DisplayName $RuleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow | Out-Null

Write-Host "已放行本地后端网关端口：$Port" -ForegroundColor Green
