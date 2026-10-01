use std::path::Path;

pub(super) fn validate_https(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() != "https" { return Err("安装包及重定向必须使用 HTTPS 地址".to_string()); }
    Ok(())
}

pub(super) fn validate_redirect(url: &reqwest::Url, hops: usize) -> Result<(), String> {
    validate_https(url)?;
    if hops >= 10 { return Err("安装包重定向次数过多".to_string()); }
    Ok(())
}

pub(super) fn validate_installer_url(url: &reqwest::Url) -> Result<(), String> {
    validate_https(url)?;
    let name = installer_file_name(url)?;
    let extension = Path::new(&name).extension().and_then(|value| value.to_str()).unwrap_or("");
    if !matches!(extension.to_ascii_lowercase().as_str(), "exe" | "msi") {
        return Err("安装包只支持 .msi 或 .exe 文件".to_string());
    }
    Ok(())
}

pub(super) fn validate_version(version: &str) -> Result<(), String> {
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit())) {
        return Err("更新版本号格式无效".to_string());
    }
    Ok(())
}

pub(super) fn validate_sha256(digest: &str) -> Result<String, String> {
    if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("安装包缺少有效的 SHA-256 摘要，拒绝自动安装".to_string());
    }
    Ok(digest.to_ascii_lowercase())
}

pub(super) fn installer_file_name(url: &reqwest::Url) -> Result<String, String> {
    let file_name = url.path_segments().and_then(|segments| segments.last()).unwrap_or("").trim();
    if file_name.is_empty() { return Err("安装包地址缺少文件名".to_string()); }
    Ok(safe_path_segment(&decode_percent_encoded_ascii(file_name)))
}

pub(super) fn safe_path_segment(input: &str) -> String {
    let segment: String = input.chars().map(|ch| {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') { ch } else { '_' }
    }).collect();
    if matches!(segment.as_str(), "" | "." | "..") { "_".to_string() } else { segment }
}

fn decode_percent_encoded_ascii(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[index + 1]), hex_value(bytes[index + 2])) {
                let decoded = high * 16 + low;
                output.push(if decoded.is_ascii() { decoded as char } else { '_' });
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
    match byte { b'0'..=b'9' => Some(byte - b'0'), b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10), _ => None }
}
