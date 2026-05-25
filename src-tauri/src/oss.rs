use crate::env_config::read_required_env;
use aliyun_oss_rust_sdk::{oss::OSS, request::RequestBuilder, url::UrlApi};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const DOWNLOAD_URL_EXPIRE_SECONDS: i64 = 60 * 60 * 24 * 7;
const PUT_URL_EXPIRE_SECONDS: i64 = 600;
const UPLOAD_FOLDERS: [&str; 2] = ["uploads", "generated"];

/// 单次 OSS PUT 的硬超时。SDK 内部用 reqwest 默认超时（=无限），
/// OSS 偶发卡住会拖死整个网关 HTTP 请求，因此外层包一层 timeout。
const OSS_PUT_TIMEOUT_SECS: u64 = 30;
/// PUT 失败时的重试次数（含首次共 1 + N 次）。
const OSS_PUT_RETRY_ATTEMPTS: usize = 2;

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

#[cfg_attr(feature = "tauri-commands", tauri::command)]
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

    put_object_with_retry(&oss, &key, &bytes, &mime).await?;

    let signed_url = oss.sign_download_url(
        &key,
        &RequestBuilder::new().with_expire(DOWNLOAD_URL_EXPIRE_SECONDS),
    );
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

#[derive(Debug, Deserialize)]
pub struct PresignOssUrlsRequest {
    pub folder: String,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PresignOssUrlsResponse {
    pub key: String,
    pub put_url: String,
    pub get_url: String,
    pub content_type: String,
    pub put_expires_in_seconds: i64,
}

/// 同时签发上传 URL（短期）与下载 URL（7 天）。
///
/// 客户端拿到 put_url 后直接 PUT 到 OSS，绕开网关；get_url 写库用于历史展示。
/// 上传时客户端必须用 `content_type` 字段返回的值作为 `Content-Type`，否则签名校验会失败。
#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn presign_oss_urls(
    req: PresignOssUrlsRequest,
) -> Result<PresignOssUrlsResponse, String> {
    if !UPLOAD_FOLDERS.contains(&req.folder.as_str()) {
        return Err(format!(
            "不支持的 OSS 目录：{}，仅支持 {}",
            req.folder,
            UPLOAD_FOLDERS.join(" / ")
        ));
    }
    let content_type = normalize_presign_mime_type(req.mime_type.as_deref());
    let key = build_object_key(&req.folder, req.file_name.as_deref(), &content_type);
    let oss = build_oss_client()?;

    let put_url = oss.sign_upload_url(
        &key,
        &RequestBuilder::new()
            .with_content_type(&content_type)
            .with_expire(PUT_URL_EXPIRE_SECONDS),
    );
    let get_url = oss.sign_download_url(
        &key,
        &RequestBuilder::new().with_expire(DOWNLOAD_URL_EXPIRE_SECONDS),
    );

    eprintln!(
        "[oss-presign] folder={} key={} mime={} put_expire={}s",
        req.folder, key, content_type, PUT_URL_EXPIRE_SECONDS
    );

    Ok(PresignOssUrlsResponse {
        key,
        put_url,
        get_url,
        content_type,
        put_expires_in_seconds: PUT_URL_EXPIRE_SECONDS,
    })
}

fn normalize_presign_mime_type(mime_type: Option<&str>) -> String {
    let normalized = mime_type.unwrap_or("").trim().to_ascii_lowercase();
    match normalized.as_str() {
        "image/png" | "image/jpeg" | "image/webp" => normalized,
        "image/jpg" => "image/jpeg".to_string(),
        _ => "image/jpeg".to_string(),
    }
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

/// 包了硬超时 + 指数退避重试的 OSS PUT。
///
/// 失败模式分两类：
/// - timeout / 网络错误：值得重试（OSS 偶发抖动 200ms 内恢复）
/// - 4xx 鉴权 / bucket 不存在：重试也没用，但 SDK 返回的是同一种 `OssError`，
///   无从区分，且生产里这类错误意味着配置坏了——多重试 2 次也不会让事情更糟，
///   先简单按"统一重试"处理，未来需要精细化再拆。
async fn put_object_with_retry(
    oss: &OSS,
    key: &str,
    bytes: &[u8],
    mime: &str,
) -> Result<(), String> {
    let mut last_error: Option<String> = None;
    for attempt in 0..=OSS_PUT_RETRY_ATTEMPTS {
        let builder = RequestBuilder::new().with_content_type(mime).with_expire(600);
        let fut = oss.pub_object_from_buffer(key, bytes, builder);
        match tokio::time::timeout(Duration::from_secs(OSS_PUT_TIMEOUT_SECS), fut).await {
            Ok(Ok(())) => {
                if attempt > 0 {
                    eprintln!(
                        "[oss] put_object succeeded on retry {} key={}",
                        attempt, key
                    );
                }
                return Ok(());
            }
            Ok(Err(error)) => {
                last_error = Some(format!("上传图片到 OSS 失败：{error}"));
            }
            Err(_) => {
                last_error = Some(format!(
                    "上传图片到 OSS 超时（>{OSS_PUT_TIMEOUT_SECS}s）key={key}"
                ));
            }
        }
        if attempt < OSS_PUT_RETRY_ATTEMPTS {
            // 500ms / 1500ms 指数退避
            let backoff = Duration::from_millis(500 * (1 << attempt));
            eprintln!(
                "[oss] put_object attempt {}/{} failed, retrying in {:?}: {}",
                attempt + 1,
                OSS_PUT_RETRY_ATTEMPTS + 1,
                backoff,
                last_error.as_deref().unwrap_or("(unknown)")
            );
            tokio::time::sleep(backoff).await;
        }
    }
    Err(last_error.unwrap_or_else(|| "上传图片到 OSS 失败：unknown".into()))
}

fn build_oss_client() -> Result<OSS, String> {
    let region = read_required_env(&["ALI_OSS_REGION", "OSS_REGION"])?;
    let access_key_id = read_required_env(&["ALI_OSS_ACCESS_KEY_ID", "OSS_KEY_ID"])?;
    let access_key_secret = read_required_env(&["ALI_OSS_ACCESS_KEY_SECRET", "OSS_KEY_SECRET"])?;
    let bucket = read_required_env(&["ALI_OSS_BUCKET", "OSS_BUCKET"])?;
    let endpoint = normalize_endpoint(&region);

    Ok(OSS::new(access_key_id, access_key_secret, endpoint, bucket))
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
