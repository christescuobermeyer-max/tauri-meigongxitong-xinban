use super::*;

pub(super) fn is_json_cookie_file(path: &Path) -> Result<bool, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("读取cookie文件失败: {}", e))?;
    Ok(content.trim_start().starts_with('['))
}

pub(super) fn convert_json_cookie_file(path: &Path, temp_prefix: &str) -> Result<PathBuf, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("读取cookie文件失败: {}", e))?;
    let cookies: Vec<BrowserCookie> =
        serde_json::from_str(&content).map_err(|e| format!("解析cookie JSON失败: {}", e))?;

    let mut lines = vec![NETSCAPE_HEADER.to_string()];
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

    let temp_cookie_path = std::env::temp_dir().join(format!(
        "{}-ytdlp-cookie-{}.txt",
        temp_prefix,
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&temp_cookie_path, lines.join("\n"))
        .map_err(|e| format!("写入临时cookie文件失败: {}", e))?;
    Ok(temp_cookie_path)
}
