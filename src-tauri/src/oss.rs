use aliyun_oss_rust_sdk::{
    oss::OSS,
    request::RequestBuilder,
    url::UrlApi,
};
use crate::env_config::read_required_env;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const DOWNLOAD_URL_EXPIRE_SECONDS: i64 = 60 * 60 * 24 * 7;
const UPLOAD_FOLDERS: [&str; 2] = ["uploads", "generated"];

#[derive(Debug, Deserialize)]
pub struct UploadImageToOssRequest {
    pub base64_data: String,
    pub mime_type: Option<String>,
    pub folder: String,
    pub file_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UploadImageToOssResponse {
    pub key: String,
    pub url: String,
}

#[tauri::command]
pub async fn upload_image_to_oss(
    req: UploadImageToOssRequest,
) -> Result<UploadImageToOssResponse, String> {
    validate_upload_request(&req)?;

    let bytes = STANDARD
        .decode(req.base64_data.trim())
        .map_err(|error| format!("解析图片 base64 失败：{error}"))?;
    let mime = normalize_mime_type(req.mime_type.as_deref(), &bytes);
    let key = build_object_key(&req.folder, req.file_name.as_deref(), &mime);
    let oss = build_oss_client()?;

    let upload_builder = RequestBuilder::new()
        .with_content_type(&mime)
        .with_expire(600);
    oss.pub_object_from_buffer(&key, &bytes, upload_builder)
        .await
        .map_err(|error| format!("上传图片到 OSS 失败：{error}"))?;

    let signed_url =
        oss.sign_download_url(&key, &RequestBuilder::new().with_expire(DOWNLOAD_URL_EXPIRE_SECONDS));
    eprintln!(
        "[oss] folder={} key={} bytes={} mime={}",
        req.folder,
        key,
        bytes.len(),
        mime
    );

    Ok(UploadImageToOssResponse {
        key,
        url: signed_url,
    })
}

fn validate_upload_request(req: &UploadImageToOssRequest) -> Result<(), String> {
    if req.base64_data.trim().is_empty() {
        return Err("上传到 OSS 的图片内容不能为空".into());
    }
    if !UPLOAD_FOLDERS.contains(&req.folder.as_str()) {
        return Err(format!(
            "不支持的 OSS 目录：{}，仅支持 {}",
            req.folder,
            UPLOAD_FOLDERS.join(" / ")
        ));
    }
    Ok(())
}

fn build_oss_client() -> Result<OSS, String> {
    let region = read_required_env(&["ALI_OSS_REGION", "OSS_REGION"])?;
    let access_key_id = read_required_env(&["ALI_OSS_ACCESS_KEY_ID", "OSS_KEY_ID"])?;
    let access_key_secret = read_required_env(&["ALI_OSS_ACCESS_KEY_SECRET", "OSS_KEY_SECRET"])?;
    let bucket = read_required_env(&["ALI_OSS_BUCKET", "OSS_BUCKET"])?;
    let endpoint = normalize_endpoint(&region);

    Ok(OSS::new(
        access_key_id,
        access_key_secret,
        endpoint,
        bucket,
    ))
}

fn normalize_endpoint(region_or_endpoint: &str) -> String {
    if region_or_endpoint.contains("aliyuncs.com") {
        region_or_endpoint
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .to_string()
    } else {
        format!("{region_or_endpoint}.aliyuncs.com")
    }
}

fn normalize_mime_type(mime_type: Option<&str>, bytes: &[u8]) -> String {
    let normalized = mime_type.unwrap_or("").trim().to_ascii_lowercase();
    if matches!(
        normalized.as_str(),
        "image/png" | "image/jpeg" | "image/jpg" | "image/webp"
    ) {
        return if normalized == "image/jpg" {
            "image/jpeg".to_string()
        } else {
            normalized
        };
    }

    detect_mime_type(bytes).to_string()
}

fn detect_mime_type(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/png"
    }
}

fn build_object_key(folder: &str, file_name: Option<&str>, mime_type: &str) -> String {
    let date = Local::now().format("%Y-%m-%d");
    let timestamp = Local::now().format("%Y%m%d-%H%M%S");
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let stem = sanitize_file_stem(file_name.unwrap_or("image"));
    let ext = extension_from_mime_type(mime_type);

    format!("{folder}/{date}/{timestamp}-{millis}-{stem}.{ext}")
}

fn sanitize_file_stem(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let sanitized = stem
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') || !ch.is_ascii() {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        "image".to_string()
    } else {
        sanitized
    }
}

fn extension_from_mime_type(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefer_explicit_supported_mime_type() {
        let mime = normalize_mime_type(Some("image/jpeg"), b"png");
        assert_eq!(mime, "image/jpeg");
    }

    #[test]
    fn build_object_key_contains_folder_and_extension() {
        let key = build_object_key("uploads", Some("招牌图.png"), "image/png");
        assert!(key.starts_with("uploads/"));
        assert!(key.ends_with(".png"));
        assert!(key.contains("招牌图"));
    }

    #[test]
    fn normalize_region_to_endpoint() {
        assert_eq!(
            normalize_endpoint("oss-cn-hangzhou"),
            "oss-cn-hangzhou.aliyuncs.com"
        );
        assert_eq!(
            normalize_endpoint("https://oss-cn-hangzhou.aliyuncs.com"),
            "oss-cn-hangzhou.aliyuncs.com"
        );
    }

    #[tokio::test]
    #[ignore = "需要真实 OSS 凭据与网络环境"]
    async fn upload_and_fetch_signed_url() {
        let one_pixel_png =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pH3sAAAAASUVORK5CYII=";
        let uploaded = upload_image_to_oss(UploadImageToOssRequest {
            base64_data: one_pixel_png.to_string(),
            mime_type: Some("image/png".to_string()),
            folder: "uploads".to_string(),
            file_name: Some("live-test.png".to_string()),
        })
        .await
        .unwrap();

        assert!(uploaded.key.starts_with("uploads/"));
        assert!(uploaded.url.contains("Signature="));

        let response = reqwest::get(&uploaded.url).await.unwrap();
        assert!(response.status().is_success());
    }
}
