param(
    [ValidateSet("dev", "build", "doctor", "cli")]
    [string]$Mode = "dev",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$projectRoot = Split-Path -Parent $PSCommandPath
$tauriCli = Join-Path $projectRoot "node_modules\.bin\tauri.cmd"

if (-not (Test-Path $tauriCli)) {
    throw "未找到本地 Tauri CLI：$tauriCli，请先执行 npm install。"
}

function Get-VswherePath {
    foreach ($path in @(
        "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe",
        "C:\Program Files\Microsoft Visual Studio\Installer\vswhere.exe"
    )) {
        if (Test-Path $path) {
            return $path
        }
    }
    return $null
}

function Get-VisualStudioRoots {
    $roots = [System.Collections.Generic.List[string]]::new()
    $vswhere = Get-VswherePath

    if ($vswhere) {
        $json = & $vswhere -all -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format json -utf8
        if ($LASTEXITCODE -eq 0 -and $json) {
            foreach ($item in ($json | ConvertFrom-Json)) {
                if ($item.installationPath) {
                    [void]$roots.Add($item.installationPath)
                }
            }
        }
    }

    foreach ($base in @(
        "C:\Program Files\Microsoft Visual Studio",
        "D:\Program Files\Microsoft Visual Studio"
    )) {
        if (-not (Test-Path $base)) {
            continue
        }
        foreach ($yearDir in Get-ChildItem $base -Directory -ErrorAction SilentlyContinue) {
            foreach ($editionDir in Get-ChildItem $yearDir.FullName -Directory -ErrorAction SilentlyContinue) {
                [void]$roots.Add($editionDir.FullName)
            }
        }
    }

    return $roots | Where-Object { $_ } | Select-Object -Unique
}

function Get-ToolchainInfo([string]$vsRoot) {
    $vsDevCmd = Join-Path $vsRoot "Common7\Tools\VsDevCmd.bat"
    $msvcRoot = Join-Path $vsRoot "VC\Tools\MSVC"

    if (-not (Test-Path $vsDevCmd) -or -not (Test-Path $msvcRoot)) {
        return $null
    }

    $toolDir = Get-ChildItem $msvcRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -First 1

    if (-not $toolDir) {
        return $null
    }

    foreach ($requiredPath in @(
        (Join-Path $toolDir.FullName "include\vcruntime.h"),
        (Join-Path $toolDir.FullName "include\excpt.h"),
        (Join-Path $toolDir.FullName "lib\x64\vcruntime.lib")
    )) {
        if (-not (Test-Path $requiredPath)) {
            return $null
        }
    }

    return [pscustomobject]@{
        Root      = $vsRoot
        VsDevCmd  = $vsDevCmd
        ToolDir   = $toolDir.FullName
        Version   = $toolDir.Name
        IsPreview = $vsRoot -match "Preview|Insiders"
    }
}

function Select-Toolchain {
    $candidates = foreach ($root in Get-VisualStudioRoots) {
        $info = Get-ToolchainInfo -vsRoot $root
        if ($info) {
            $info
        }
    }

    if (-not $candidates) {
        throw "未找到可用的 Visual Studio C++ 工具链。请安装带有 MSVC、Windows SDK 的 Visual Studio 2022。"
    }

    return $candidates |
        Sort-Object @{ Expression = "IsPreview"; Ascending = $true }, @{ Expression = "Version"; Descending = $true } |
        Select-Object -First 1
}

function Import-VisualStudioEnvironment([string]$vsDevCmd) {
    $dumpFile = Join-Path $env:TEMP ("tauri-vsenv-" + [guid]::NewGuid().ToString() + ".txt")
    $dumpScript = Join-Path $env:TEMP ("tauri-vsenv-" + [guid]::NewGuid().ToString() + ".cmd")

    @"
@echo off
call "$vsDevCmd" -arch=x64 >NUL 2>&1
if errorlevel 1 exit /b %errorlevel%
set > "$dumpFile"
"@ | Set-Content -Path $dumpScript -Encoding ascii

    try {
        & cmd.exe /c "`"$dumpScript`""
        if ($LASTEXITCODE -ne 0) {
            throw "VsDevCmd.bat 执行失败，退出码 $LASTEXITCODE。"
        }
        if (-not (Test-Path $dumpFile)) {
            throw "未生成 Visual Studio 环境变量导出文件。"
        }

        Get-Content $dumpFile | ForEach-Object {
            if ($_ -match "^([^=]+)=(.*)$") {
                Set-Item -Path "env:$($matches[1])" -Value $matches[2] -Force
            }
        }
    }
    finally {
        Remove-Item $dumpScript, $dumpFile -Force -ErrorAction SilentlyContinue
    }

    $clCommand = Get-Command cl.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $clCommand) {
        throw "Visual Studio 环境加载后仍未找到 cl.exe。"
    }

    $env:CC = $clCommand.Source
    $env:CXX = $clCommand.Source
}

function Get-ProcessChain([int]$processId) {
    $chain = [System.Collections.Generic.List[object]]::new()
    $currentId = $processId

    while ($currentId -gt 0 -and $currentId -ne $PID) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $currentId" -ErrorAction SilentlyContinue
        if (-not $proc) {
            break
        }
        [void]$chain.Add($proc)
        $parentId = [int]$proc.ParentProcessId
        if ($parentId -le 0 -or $parentId -eq $currentId -or $parentId -eq $PID) {
            break
        }
        $currentId = $parentId
    }

    return $chain
}

function Get-ProjectGroupRoot([int]$processId) {
    $pattern = "tauri\.js|npm-cli\.js.+run tauri:dev|npm-cli\.js.+run dev|tauri dev|vite(\.js)?"
    $matches = Get-ProcessChain -processId $processId | Where-Object {
        $_.ProcessId -ne $PID -and (
            $_.Name -in @("csgh-image-studio.exe", "cargo.exe") -or
            ([string]$_.CommandLine) -match $pattern
        )
    }

    if ($matches) {
        return $matches | Select-Object -Last 1
    }
    return $null
}

function Get-DescendantIds([int]$rootId) {
    $childrenByParent = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Group-Object ParentProcessId -AsHashTable -AsString
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $found = [System.Collections.Generic.HashSet[int]]::new()
    $queue.Enqueue($rootId)

    while ($queue.Count -gt 0) {
        $currentId = $queue.Dequeue()
        if (-not $found.Add($currentId)) {
            continue
        }
        foreach ($child in ($childrenByParent[[string]$currentId] | Where-Object { $_ })) {
            $queue.Enqueue([int]$child.ProcessId)
        }
    }

    return $found
}

function Stop-StaleProcesses {
    $rootIds = [System.Collections.Generic.HashSet[int]]::new()

    foreach ($listener in (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 1420, 1421 })) {
        $root = Get-ProjectGroupRoot -processId ([int]$listener.OwningProcess)
        if (-not $root) {
            throw "端口 $($listener.LocalPort) 已被其他进程占用（PID $($listener.OwningProcess)），请先关闭后再重试。"
        }
        [void]$rootIds.Add([int]$root.ProcessId)
    }

    foreach ($app in (Get-Process csgh-image-studio -ErrorAction SilentlyContinue)) {
        $root = Get-ProjectGroupRoot -processId $app.Id
        if ($root) {
            [void]$rootIds.Add([int]$root.ProcessId)
        }
    }

    if ($rootIds.Count -eq 0) {
        return
    }

    $allIds = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($rootId in $rootIds) {
        foreach ($targetId in (Get-DescendantIds -rootId $rootId)) {
            [void]$allIds.Add([int]$targetId)
        }
    }

    foreach ($targetId in (@($allIds) | Sort-Object -Descending)) {
        if ($targetId -ne $PID) {
            Stop-Process -Id $targetId -Force -ErrorAction SilentlyContinue
        }
    }

    Start-Sleep -Milliseconds 800
}

$toolchain = Select-Toolchain
Import-VisualStudioEnvironment -vsDevCmd $toolchain.VsDevCmd

$clPath = (Get-Command cl.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
$includeCount = (($env:INCLUDE -split ";") | Where-Object { $_ }).Count
$libCount = (($env:LIB -split ";") | Where-Object { $_ }).Count

if ($Mode -eq "doctor") {
    Write-Host "已选中 Visual Studio：" -ForegroundColor Cyan
    Write-Host "  $($toolchain.Root)"
    Write-Host "MSVC 工具链：" -ForegroundColor Cyan
    Write-Host "  $($toolchain.ToolDir)"
    Write-Host "cl.exe：" -ForegroundColor Cyan
    Write-Host "  $clPath"
    Write-Host "INCLUDE 条目数：$includeCount" -ForegroundColor Cyan
    Write-Host "LIB 条目数：$libCount" -ForegroundColor Cyan
    Write-Host "Tauri CLI：" -ForegroundColor Cyan
    Write-Host "  $tauriCli"
    exit 0
}

Write-Host "已选中 Visual Studio：$($toolchain.Root)" -ForegroundColor Cyan
Write-Host "MSVC 工具链：$($toolchain.Version)" -ForegroundColor Cyan
Write-Host "cl.exe：$clPath" -ForegroundColor Cyan
Write-Host "INCLUDE 条目数：$includeCount，LIB 条目数：$libCount" -ForegroundColor Cyan
Write-Host ""

Set-Location $projectRoot

switch ($Mode) {
    "dev" {
        Stop-StaleProcesses
        & $tauriCli "dev" @TauriArgs
        exit $LASTEXITCODE
    }
    "build" {
        & $tauriCli "build" @TauriArgs
        exit $LASTEXITCODE
    }
    "cli" {
        if (-not $TauriArgs -or $TauriArgs.Count -eq 0) {
            throw "cli 模式需要额外的 tauri 参数，例如：npm run tauri -- icon ./source.png"
        }
        if ($TauriArgs[0] -eq "dev") {
            Stop-StaleProcesses
        }
        & $tauriCli @TauriArgs
        exit $LASTEXITCODE
    }
}
