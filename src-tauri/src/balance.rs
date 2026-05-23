//! 后台管理 Tab4「余额监控」对应的 Tauri 命令。
//!
//! 流程：
//!   1. `balance_login`：spawn Python `newapi_capture_login.py`，
//!       脚本会弹出 headed Chromium，用户人工登录后保存 cookies+userId+quotaPerUnit。
//!   2. `balance_fetch`：spawn Python `newapi_fetch_balance.py`，
//!       用 cookies 调站点 `/api/user/self` 拿余额，stdout 单行 JSON。
//!
//! 共用两个 Python 脚本，每条线路提供自己的 URL/domain 配置。
//! 脚本通过 include_str! 内嵌进 Rust 二进制，运行时覆写到 app_cache_dir。

use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

const SCRIPT_CAPTURE: &str =
    include_str!("../../scripts/balance/newapi_capture_login.py");
const SCRIPT_FETCH: &str =
    include_str!("../../scripts/balance/newapi_fetch_balance.py");

const CAPTURE_NAME: &str = "newapi_capture_login.py";
const FETCH_NAME: &str = "newapi_fetch_balance.py";

#[derive(Clone, Copy)]
struct LineConfig {
    /// 登录页 URL（也是 cookie 域名所在站点）
    login_url: &'static str,
    /// cookie 域，比如 "yunwu.ai"
    domain: &'static str,
    /// 余额 API URL
    api_url: &'static str,
    /// Referer 头，一般是 console 页面 URL
    referer: &'static str,
    /// session 文件名 key；同账号共用同一 session，比如 line1 和 line2 都用 "line2"
    session_key: &'static str,
    /// 余额显示单位符号：apimart 用 "$"，其它 newapi 站点用 "⚡"
    unit_symbol: &'static str,
}

fn line_config(line: &str) -> Result<LineConfig, String> {
    match line {
        // line1 与 line2 同账号同后台（yunwu），共用 line2.json
        "line1" | "line2" => Ok(LineConfig {
            login_url: "https://yunwu.ai/console",
            domain: "yunwu.ai",
            api_url: "https://yunwu.ai/api/user/self",
            referer: "https://yunwu.ai/console",
            session_key: "line2",
            unit_symbol: "⚡",
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
        // line5 = APIMart：表面是 Next.js 自定义 UI，底层仍是 New-API；显示单位是 USD
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
            login_url: "https://otuapi.com/console",
            domain: "otuapi.com",
            api_url: "https://otuapi.com/api/user/self",
            referer: "https://otuapi.com/console",
            session_key: "line7",
            unit_symbol: "⚡",
        }),
        _ => Err(format!("暂未支持的线路：{line}（当前支持 line1-line7）")),
    }
}

fn ensure_scripts(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法解析 app_cache_dir：{e}"))?;
    let scripts_dir = cache_dir.join("balance-scripts");
    std::fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("创建脚本目录失败：{e}"))?;

    let cap_path = scripts_dir.join(CAPTURE_NAME);
    let fetch_path = scripts_dir.join(FETCH_NAME);
    std::fs::write(&cap_path, SCRIPT_CAPTURE).map_err(|e| format!("写入 capture 脚本失败：{e}"))?;
    std::fs::write(&fetch_path, SCRIPT_FETCH).map_err(|e| format!("写入 fetch 脚本失败：{e}"))?;
    Ok((cap_path, fetch_path))
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
        .arg("--login-url").arg(cfg.login_url)
        .arg("--domain").arg(cfg.domain)
        .arg("--session-file").arg(&sess)
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
        .arg("--api-url").arg(cfg.api_url)
        .arg("--referer").arg(cfg.referer)
        .arg("--session-file").arg(&sess)
        .arg("--unit-symbol").arg(cfg.unit_symbol)
        .env("PYTHONIOENCODING", "utf-8")
        .output()
        .map_err(|e| format!("启动 python 失败：{e}"))
}

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn balance_login(app: AppHandle, line: String) -> Result<(), String> {
    let cfg = line_config(&line)?;
    let (cap_path, _) = ensure_scripts(&app)?;
    let sess_path = session_path(&app, cfg.session_key)?;

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
    let cfg = line_config(&line)?;
    let (_, fetch_path) = ensure_scripts(&app)?;
    let sess_path = session_path(&app, cfg.session_key)?;

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
