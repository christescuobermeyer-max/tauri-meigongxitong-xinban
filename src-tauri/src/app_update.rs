use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

mod download;
mod launch;
mod security;
#[cfg(test)]
mod tests;

use download::download_installer;
use launch::{launch_installer, reopen_after_install};
use security::{validate_installer_url, validate_sha256, validate_version};

const APP_UPDATE_PROGRESS_EVENT: &str = "app-update://progress";

#[derive(Debug, Deserialize)]
pub struct AppUpdateInstallRequest {
    installer_url: String,
    latest_version: String,
    installer_sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateProgressPayload {
    phase: &'static str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    percent: u8,
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle, req: AppUpdateInstallRequest) -> Result<(), String> {
    let url = req.installer_url.parse::<reqwest::Url>()
        .map_err(|_| "安装包地址无效".to_string())?;
    validate_installer_url(&url)?;
    validate_version(&req.latest_version)?;
    let expected_sha256 = validate_sha256(&req.installer_sha256)?;
    let installer_path = download_installer(&app, &url, &req.latest_version, &expected_sha256).await?;
    emit_update_progress(&app, "installing", 1, Some(1))?;
    let app_exe = std::env::current_exe()
        .map_err(|error| format!("无法解析当前软件路径：{error}"))?;
    let child = launch_installer(&installer_path)?;
    reopen_after_install(&child, &app_exe)?;
    app.exit(0);
    Ok(())
}

fn emit_update_progress(app: &AppHandle, phase: &'static str, downloaded_bytes: u64, total_bytes: Option<u64>) -> Result<(), String> {
    let percent = if phase == "installing" { 100 } else {
        total_bytes.filter(|total| *total > 0)
            .map(|total| (downloaded_bytes.saturating_mul(100) / total).min(99) as u8)
            .unwrap_or(0)
    };
    app.emit(APP_UPDATE_PROGRESS_EVENT, AppUpdateProgressPayload { phase, downloaded_bytes, total_bytes, percent })
        .map_err(|error| format!("更新进度通知失败：{error}"))
}
