use std::{
    path::{Path, PathBuf},
    process::{Child, Command},
    time::Duration,
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

const APP_UPDATE_PROGRESS_EVENT: &str = "app-update://progress";

#[derive(Debug, Deserialize)]
pub struct AppUpdateInstallRequest {
    installer_url: String,
    latest_version: String,
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
pub async fn install_app_update(
    app: AppHandle,
    req: AppUpdateInstallRequest,
) -> Result<(), String> {
    let url = req
        .installer_url
        .parse::<reqwest::Url>()
        .map_err(|error| format!("安装包地址无效：{error}"))?;
    validate_installer_url(&url)?;

    let installer_path = download_installer(&app, &url, &req.latest_version).await?;
    emit_update_progress(&app, "installing", 1, Some(1))?;
    let app_exe =
        std::env::current_exe().map_err(|error| format!("无法解析当前软件路径：{error}"))?;
    let child = launch_installer(&installer_path)?;
    reopen_after_install(&child, &app_exe)?;
    app.exit(0);
    Ok(())
}

fn validate_installer_url(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("安装包地址必须以 http:// 或 https:// 开头".to_string());
    }
    let file_name = installer_file_name(url)?;
    let extension = Path::new(&file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension != "msi" && extension != "exe" {
        return Err("安装包只支持 .msi 或 .exe 文件".to_string());
    }
    Ok(())
}

async fn download_installer(
    app: &AppHandle,
    url: &reqwest::Url,
    latest_version: &str,
) -> Result<PathBuf, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("无法解析更新缓存目录：{error}"))?
        .join("updates")
        .join(safe_path_segment(latest_version));
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|error| format!("创建更新缓存目录失败：{error}"))?;

    let file_name = installer_file_name(url)?;
    let installer_path = cache_dir.join(file_name);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|error| format!("初始化更新下载客户端失败：{error}"))?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| format!("下载安装包失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("下载安装包失败：{error}"))?;
    let total_bytes = response.content_length();
    let mut file = tokio::fs::File::create(&installer_path)
        .await
        .map_err(|error| format!("保存安装包失败：{error}"))?;
    let mut downloaded_bytes = 0_u64;
    emit_update_progress(app, "downloading", downloaded_bytes, total_bytes)?;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("读取安装包失败：{error}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("保存安装包失败：{error}"))?;
        downloaded_bytes = downloaded_bytes.saturating_add(chunk.len() as u64);
        emit_update_progress(app, "downloading", downloaded_bytes, total_bytes)?;
    }
    file.flush()
        .await
        .map_err(|error| format!("保存安装包失败：{error}"))?;
    emit_update_progress(
        app,
        "downloading",
        downloaded_bytes,
        Some(
            total_bytes
                .unwrap_or(downloaded_bytes)
                .max(downloaded_bytes),
        ),
    )?;
    Ok(installer_path)
}

fn emit_update_progress(
    app: &AppHandle,
    phase: &'static str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
) -> Result<(), String> {
    let percent = match total_bytes {
        Some(total) if total > 0 => {
            let value = downloaded_bytes.saturating_mul(100) / total;
            value.min(100) as u8
        }
        _ if phase == "installing" => 100,
        _ => 0,
    };
    app.emit(
        APP_UPDATE_PROGRESS_EVENT,
        AppUpdateProgressPayload {
            phase,
            downloaded_bytes,
            total_bytes,
            percent,
        },
    )
    .map_err(|error| format!("更新进度通知失败：{error}"))
}

fn installer_file_name(url: &reqwest::Url) -> Result<String, String> {
    let file_name = url
        .path_segments()
        .and_then(|segments| segments.last())
        .unwrap_or("")
        .trim();
    if file_name.is_empty() {
        return Err("安装包地址缺少文件名".to_string());
    }
    Ok(safe_path_segment(&decode_percent_encoded_ascii(file_name)))
}

fn decode_percent_encoded_ascii(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                let decoded = high * 16 + low;
                output.push(if decoded.is_ascii() {
                    decoded as char
                } else {
                    '_'
                });
                index += 3;
                continue;
            }
        }
        output.push(bytes[index] as char);
        index += 1;
    }
    output
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn safe_path_segment(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn launch_installer(path: &Path) -> Result<Child, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut command = if extension == "msi" {
        let mut command = Command::new("msiexec.exe");
        command
            .arg("/i")
            .arg(path)
            .arg("/passive")
            .arg("/norestart");
        command
    } else {
        let mut command = Command::new(path);
        command.arg("/S");
        command
    };
    command
        .spawn()
        .map_err(|error| format!("启动安装程序失败：{error}"))
}

fn reopen_after_install(installer: &Child, app_exe: &Path) -> Result<(), String> {
    let script = format!(
        "Start-Sleep -Seconds 2; Wait-Process -Id {} -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Start-Process -FilePath '{}'",
        installer.id(),
        escape_powershell_single_quoted_path(app_exe)
    );
    Command::new("powershell.exe")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-WindowStyle")
        .arg("Hidden")
        .arg("-Command")
        .arg(script)
        .spawn()
        .map_err(|error| format!("启动更新后自动打开程序失败：{error}"))?;
    Ok(())
}

fn escape_powershell_single_quoted_path(path: &Path) -> String {
    path_to_string(path).replace('\'', "''")
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        escape_powershell_single_quoted_path, installer_file_name, safe_path_segment,
        validate_installer_url,
    };
    use std::path::PathBuf;

    #[test]
    fn accepts_msi_and_exe_installer_urls() {
        let msi = "https://oss.example.com/app-3.1.0.msi".parse().unwrap();
        let exe = "https://oss.example.com/app-3.1.0.exe".parse().unwrap();

        assert!(validate_installer_url(&msi).is_ok());
        assert!(validate_installer_url(&exe).is_ok());
    }

    #[test]
    fn rejects_unknown_installer_extension() {
        let url = "https://oss.example.com/app.zip".parse().unwrap();

        assert_eq!(
            validate_installer_url(&url).unwrap_err(),
            "安装包只支持 .msi 或 .exe 文件"
        );
    }

    #[test]
    fn sanitizes_download_file_name() {
        let url = "https://oss.example.com/%E5%AE%89%E8%A3%85/app 3.1.0.msi"
            .parse()
            .unwrap();

        assert_eq!(installer_file_name(&url).unwrap(), "app_3.1.0.msi");
        assert_eq!(safe_path_segment("3.1.0/beta"), "3.1.0_beta");
    }

    #[test]
    fn escapes_powershell_single_quoted_paths() {
        let path = PathBuf::from(r"C:\Program Files\Csgh's App\app.exe");

        assert_eq!(
            escape_powershell_single_quoted_path(&path),
            r"C:\Program Files\Csgh''s App\app.exe"
        );
    }
}
