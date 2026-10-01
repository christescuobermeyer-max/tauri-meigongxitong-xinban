use super::*;

pub(crate) fn prepare_gateway_douyin_cookie_args() -> Result<(Vec<String>, Option<PathBuf>, bool), String> {
    let Some(source_path) = locate_gateway_douyin_cookie_file()? else {
        return Ok((Vec::new(), None, false));
    };

    let temp_cookie_path = if is_json_cookie_file(&source_path)? {
        convert_json_cookie_file(&source_path, "douyin-gateway")?
    } else {
        copy_cookie_file_to_temp(&source_path, "douyin-gateway")?
    };

    Ok((
        vec![
            "--cookies".to_string(),
            temp_cookie_path.to_string_lossy().to_string(),
        ],
        Some(temp_cookie_path),
        true,
    ))
}

pub(crate) fn locate_gateway_douyin_cookie_file() -> Result<Option<PathBuf>, String> {
    for env_name in ["DOUYIN_COOKIE_PATH", "GATEWAY_DOUYIN_COOKIE_PATH"] {
        if let Ok(value) = env::var(env_name) {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            let path = PathBuf::from(trimmed);
            if path.exists() {
                return Ok(Some(path));
            }
            return Err(format!("{} 指向的抖音cookie文件不存在", env_name));
        }
    }

    let mut candidates = vec![
        PathBuf::from("/opt/csgh-gateway/secrets").join(DOUYIN_COOKIE_FILE_NAME),
        PathBuf::from("/opt/csgh-image-studio").join(DOUYIN_COOKIE_FILE_NAME),
    ];
    if let Ok(current_dir) = env::current_dir() {
        for dir in current_dir.ancestors().take(6) {
            candidates.push(dir.join(DOUYIN_COOKIE_FILE_NAME));
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for dir in exe_dir.ancestors().take(6) {
                candidates.push(dir.join(DOUYIN_COOKIE_FILE_NAME));
                candidates.push(dir.join("secrets").join(DOUYIN_COOKIE_FILE_NAME));
            }
        }
    }

    Ok(candidates.into_iter().find(|path| path.exists()))
}

pub(crate) fn is_json_cookie_file(path: &Path) -> Result<bool, String> {
    let content =
        std::fs::read_to_string(path).map_err(|error| format!("读取cookie文件失败：{error}"))?;
    Ok(content.trim_start().starts_with('['))
}

pub(crate) fn convert_json_cookie_file(path: &Path, temp_prefix: &str) -> Result<PathBuf, String> {
    let content =
        std::fs::read_to_string(path).map_err(|error| format!("读取cookie文件失败：{error}"))?;
    let cookies: Vec<BrowserCookie> =
        serde_json::from_str(&content).map_err(|error| format!("解析cookie JSON失败：{error}"))?;

    let mut lines = vec![NETSCAPE_COOKIE_HEADER.to_string()];
    for cookie in cookies {
        let include_subdomains =
            if cookie.domain.starts_with('.') && !cookie.host_only.unwrap_or(false) {
                "TRUE"
            } else {
                "FALSE"
            };
        let path = cookie.path.unwrap_or_else(|| "/".to_string());
        let secure = if cookie.secure.unwrap_or(false) {
            "TRUE"
        } else {
            "FALSE"
        };
        let expires = if cookie.session.unwrap_or(false) {
            0
        } else {
            cookie.expiration_date.unwrap_or(0.0) as i64
        };

        lines.push(format!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}",
            cookie.domain, include_subdomains, path, secure, expires, cookie.name, cookie.value
        ));
    }

    let temp_cookie_path = env::temp_dir().join(format!(
        "{}-ytdlp-cookie-{}.txt",
        temp_prefix,
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&temp_cookie_path, lines.join("\n"))
        .map_err(|error| format!("写入临时cookie文件失败：{error}"))?;
    Ok(temp_cookie_path)
}

pub(crate) fn copy_cookie_file_to_temp(path: &Path, temp_prefix: &str) -> Result<PathBuf, String> {
    let temp_cookie_path = env::temp_dir().join(format!(
        "{}-ytdlp-cookie-{}.txt",
        temp_prefix,
        uuid::Uuid::new_v4()
    ));
    // yt-dlp writes cookies back on exit; production keeps secrets read-only via systemd.
    std::fs::copy(path, &temp_cookie_path)
        .map_err(|error| format!("复制临时cookie文件失败：{error}"))?;
    Ok(temp_cookie_path)
}

pub(crate) fn cleanup_temp_cookie_file(temp_cookie_path: Option<PathBuf>) {
    if let Some(path) = temp_cookie_path {
        let _ = std::fs::remove_file(path);
    }
}
