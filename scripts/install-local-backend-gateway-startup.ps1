param(
    [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSCommandPath)),
    [string]$TaskName = "CSGH Backend Gateway",
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$startScript = Join-Path $ProjectRoot "scripts\start-local-backend-gateway.ps1"
if (-not (Test-Path $startScript)) {
    throw "未找到启动脚本：$startScript"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "呈尚策划美工生图系统PRO 本地后端网关" `
    -Force | Out-Null

Write-Host "已安装开机/登录自启动任务：$TaskName" -ForegroundColor Green
Write-Host "可在任务计划程序中查看或删除该任务。"
