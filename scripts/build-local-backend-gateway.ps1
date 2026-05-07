param(
    [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$cargoToml = Join-Path $ProjectRoot "src-tauri\Cargo.toml"
if (-not (Test-Path $cargoToml)) {
    throw "未找到 Cargo.toml：$cargoToml"
}

Set-Location $ProjectRoot
cargo build --release --bin backend-gateway --manifest-path $cargoToml

$exe = Join-Path $ProjectRoot "src-tauri\target\release\backend-gateway.exe"
if (-not (Test-Path $exe)) {
    throw "后端网关构建失败，未生成：$exe"
}

Write-Host "后端网关构建完成：" -ForegroundColor Green
Write-Host "  $exe"
