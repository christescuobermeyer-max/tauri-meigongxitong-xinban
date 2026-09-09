//! 后台管理 Tab4「余额监控」对应的 Tauri 命令。
//!
//! 流程：
//!   1. `balance_login`：spawn Python `newapi_capture_login.py`，
//!       脚本会弹出 headed Chromium，用户人工登录后保存 cookies+userId+quotaPerUnit。
//!   2. `balance_fetch`：本地调试时线路2/6/7 使用 API Key billing 接口；生产客户端
//!       会优先走云端网关。其它线路 spawn Python `newapi_fetch_balance.py`，用 cookies
//!       调站点 `/api/user/self` 拿余额。
//!
//! 共用两个 Python 脚本，每条线路提供自己的 URL/domain 配置。
//! 脚本通过 include_str! 内嵌进 Rust 二进制，运行时覆写到 app_cache_dir。

use crate::api_key_billing;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const SCRIPT_CAPTURE: &str = include_str!("../../scripts/balance/newapi_capture_login.py");
const SCRIPT_FETCH: &str = include_str!("../../scripts/balance/newapi_fetch_balance.py");
const SCRIPT_OPEN_CONSOLE: &str = include_str!("../../scripts/balance/newapi_open_console.py");

const CAPTURE_NAME: &str = "newapi_capture_login.py";
const FETCH_NAME: &str = "newapi_fetch_balance.py";
const OPEN_CONSOLE_NAME: &str = "newapi_open_console.py";
#[derive(Clone, Copy)]
struct LineConfig {
    /// 登录页 URL（也是 cookie 域名所在站点）
    login_url: &'static str,
    /// cookie 域，比如 "img.zikl.dev"
    domain: &'static str,
    /// 余额 API URL
    api_url: &'static str,
    /// Referer 头，一般是 console 页面 URL
    referer: &'static str,
    /// session 文件名 key。
    session_key: &'static str,
    /// 余额显示单位符号：apimart 用 "$"，其它 newapi 站点用 "⚡"
    unit_symbol: &'static str,
}

fn line_config(line: &str) -> Result<LineConfig, String> {
    match line {
        "line2" => Ok(LineConfig {
            login_url: "https://img.zikl.dev/console",
            domain: "img.zikl.dev",
            api_url: "https://img.zikl.dev/api/user/self",
            referer: "https://img.zikl.dev/console",
            session_key: "line2",
            unit_symbol: "¤",
        }),
        "line3" => Ok(LineConfig {
            login_url: "https://api.vectorengine.ai/console",
            domain: "api.vectorengine.ai",
            api_url: "https://api.vectorengine.ai/api/user/self",
            referer: "https://api.vectorengine.ai/console",
            session_key: "line3",
            unit_symbol: "⚡",
        }),
        "line4" => Ok(LineConfig {
            login_url: "https://newapi.pockgo.com/console",
            domain: "newapi.pockgo.com",
            api_url: "https://newapi.pockgo.com/api/user/self",
            referer: "https://newapi.pockgo.com/console",
            session_key: "line4",
            unit_symbol: "⚡",
        }),
        "line5" => Ok(LineConfig {
            login_url: "https://apimart.ai/zh/overview",
            domain: "apimart.ai",
            api_url: "https://apimart.ai/api/user/self",
            referer: "https://apimart.ai/zh/overview",
            session_key: "line5",
            unit_symbol: "$",
        }),
        "line6" => Ok(LineConfig {
            login_url: "https://api.manxiaobai.online/console",
            domain: "api.manxiaobai.online",
            api_url: "https://api.manxiaobai.online/api/user/self",
            referer: "https://api.manxiaobai.online/console",
            session_key: "line6",
            unit_symbol: "⚡",
        }),
        "line7" => Ok(LineConfig {
            login_url: "https://api.novaeworld.top/console",
            domain: "api.novaeworld.top",
            api_url: "https://api.novaeworld.top/api/user/self",
            referer: "https://api.novaeworld.top/console",
            session_key: "line7",
            unit_symbol: "⚡",
        }),
        _ => Err(format!("暂未支持的线路：{line}（当前支持 line2-line7）")),
    }
}

struct Scripts {
    capture: PathBuf,
    fetch: PathBuf,
    open_console: PathBuf,
}

fn ensure_scripts(app: &AppHandle) -> Result<Scripts, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法解析 app_cache_dir：{e}"))?;
    let scripts_dir = cache_dir.join("balance-scripts");
    std::fs::create_dir_all(&scripts_dir).map_err(|e| format!("创建脚本目录失败：{e}"))?;

    let capture = scripts_dir.join(CAPTURE_NAME);
    let fetch = scripts_dir.join(FETCH_NAME);
    let open_console = scripts_dir.join(OPEN_CONSOLE_NAME);
    std::fs::write(&capture, SCRIPT_CAPTURE).map_err(|e| format!("写入 capture 脚本失败：{e}"))?;
    std::fs::write(&fetch, SCRIPT_FETCH).map_err(|e| format!("写入 fetch 脚本失败：{e}"))?;
    std::fs::write(&open_console, SCRIPT_OPEN_CONSOLE)
        .map_err(|e| format!("写入 open_console 脚本失败：{e}"))?;
    Ok(Scripts {
        capture,
        fetch,
        open_console,
    })
}

fn session_path(app: &AppHandle, session_key: &str) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析 app_data_dir：{e}"))?;
    let dir = data_dir.join("balance-sessions");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 session 目录失败：{e}"))?;
    Ok(dir.join(format!("{session_key}.json")))
}

fn run_capture_blocking(
    script: PathBuf,
    sess: PathBuf,
    cfg: LineConfig,
) -> Result<std::process::Output, String> {
    Command::new("python")
        .arg("-u")
        .arg(&script)
        .arg("--login-url")
        .arg(cfg.login_url)
        .arg("--domain")
        .arg(cfg.domain)
        .arg("--session-file")
        .arg(&sess)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("启动 python 失败：{e}（请确认系统已安装 Python 3 与 playwright）"))
}

fn run_fetch_blocking(
    script: PathBuf,
    sess: PathBuf,
    cfg: LineConfig,
) -> Result<std::process::Output, String> {
    Command::new("python")
        .arg("-u")
        .arg(&script)
        .arg("--api-url")
        .arg(cfg.api_url)
        .arg("--referer")
        .arg(cfg.referer)
        .arg("--session-file")
        .arg(&sess)
        .arg("--unit-symbol")
        .arg(cfg.unit_symbol)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("启动 python 失败：{e}"))
}

fn run_open_console_blocking(
    script: PathBuf,
    sess: PathBuf,
    cfg: LineConfig,
) -> Result<std::process::Output, String> {
    Command::new("python")
        .arg("-u")
        .arg(&script)
        .arg("--console-url")
        .arg(cfg.login_url)
        .arg("--domain")
        .arg(cfg.domain)
        .arg("--session-file")
        .arg(&sess)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("启动 python 失败：{e}"))
}

async fn fetch_api_key_balance(line: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("创建 API Key 余额客户端失败：{error}"))?;
    api_key_billing::fetch_api_key_billing_balance_for_line(&client, line).await
}

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn balance_login(app: AppHandle, line: String) -> Result<(), String> {
    let cfg = line_config(&line)?;
    let scripts = ensure_scripts(&app)?;
    let sess_path = session_path(&app, cfg.session_key)?;
    let cap_path = scripts.capture;

    let output = tauri::async_runtime::spawn_blocking(move || {
        run_capture_blocking(cap_path, sess_path, cfg)
    })
    .await
    .map_err(|e| format!("子线程加入失败：{e}"))??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let code = output.status.code().unwrap_or(-1);
        return Err(format!(
            "登录脚本失败（退出码 {code}）。stdout:\n{stdout}\nstderr:\n{stderr}"
        ));
    }
    Ok(())
}

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn balance_fetch(app: AppHandle, line: String) -> Result<serde_json::Value, String> {
    if api_key_billing::supports_api_key_billing_line(&line) {
        return fetch_api_key_balance(&line).await;
    }
    let cfg = line_config(&line)?;
    let scripts = ensure_scripts(&app)?;
    let sess_path = session_path(&app, cfg.session_key)?;
    let fetch_path = scripts.fetch;

    if !sess_path.exists() {
        return Ok(serde_json::json!({
            "ok": false,
            "reason": "no_session",
            "detail": "尚未登录该线路",
        }));
    }

    let output = tauri::async_runtime::spawn_blocking(move || {
        run_fetch_blocking(fetch_path, sess_path, cfg)
    })
    .await
    .map_err(|e| format!("子线程加入失败：{e}"))??;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("脚本无 stdout 输出。stderr:\n{stderr}"));
    }
    serde_json::from_str::<serde_json::Value>(trimmed)
        .map_err(|e| format!("解析脚本输出失败：{e}\n原始输出：{trimmed}"))
}

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn balance_open_console(app: AppHandle, line: String) -> Result<(), String> {
    let cfg = line_config(&line)?;
    let scripts = ensure_scripts(&app)?;
    let sess_path = session_path(&app, cfg.session_key)?;
    if !sess_path.exists() {
        return Err("尚未登录该线路，请先点击「重新登录」".into());
    }
    let open_path = scripts.open_console;

    let output = tauri::async_runtime::spawn_blocking(move || {
        run_open_console_blocking(open_path, sess_path, cfg)
    })
    .await
    .map_err(|e| format!("子线程加入失败：{e}"))??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "打开后台失败。stdout:\n{stdout}\nstderr:\n{stderr}"
        ));
    }
    Ok(())
}
