use crate::gemini_response::truncate_for_msg;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Url;
use std::time::Duration;

#[path = "reference_image/download.rs"]
pub mod download;

/// HTTP 拉取 OSS 图片的总尝试次数。
/// 上午统计显示 ~20% 的生图 attempt 失败在 `.bytes().await: error decoding response body`，
/// 阿里云 OSS CDN 偶发提前 EOF / stale connection，立刻重试一般就成功。
const DOWNLOAD_ATTEMPTS: usize = 3;
const DOWNLOAD_RETRY_DELAY: Duration = Duration::from_millis(800);

pub async fn download_image_if_url(
    client: &reqwest::Client,
    value: String,
    error_label: &str,
) -> Result<String, String> {
    if !(value.starts_with("http://") || value.starts_with("https://")) {
        return Ok(value);
    }

    let mut last_error: Option<String> = None;
    for attempt in 0..DOWNLOAD_ATTEMPTS {
        match fetch_image_bytes_once(client, &value, error_label).await {
            Ok(bytes) => {
                if attempt > 0 {
                    eprintln!("[ref-download] {error_label} 第 {} 次重试成功", attempt);
                }
                return Ok(STANDARD.encode(&bytes));
            }
            Err(error) => {
                last_error = Some(error);
                if attempt + 1 < DOWNLOAD_ATTEMPTS {
                    tokio::time::sleep(DOWNLOAD_RETRY_DELAY).await;
                }
            }
        }
    }
    Err(format!("上游任务已提交，结果下载失败：{}", last_error.unwrap_or_else(|| format!("{error_label}：unknown"))))
}

async fn fetch_image_bytes_once(
    _client: &reqwest::Client,
    url: &str,
    error_label: &str,
) -> Result<Vec<u8>, String> {
    download::download(url, Duration::from_secs(180)).await
        .map(|(bytes, _)| bytes)
        .map_err(|error| format!("{error_label}：{error}"))
}

pub async fn log_reference_image_diagnostics(_client: &reqwest::Client, images: &[String]) {
    for (index, image) in images.iter().enumerate() {
        if reference_image_type(image) == "base64" {
            eprintln!("[image-2] ref[{index}] type=base64 chars={}", image.len());
        } else {
            eprintln!("[image-2] ref[{index}] type=url {}", summarize_reference_url(image));
        }
    }
}

pub fn reference_image_type(value: &str) -> &'static str {
    if value.starts_with("http://") || value.starts_with("https://") {
        "url"
    } else {
        "base64"
    }
}

fn summarize_reference_url(value: &str) -> String {
    match Url::parse(value) {
        Ok(url) => {
            let host = url.host_str().unwrap_or("-");
            let query_chars = url.query().map(|query| query.len()).unwrap_or(0);
            format!(
                "host={} path={} query_chars={} total_chars={}",
                host,
                truncate_for_msg(url.path(), 120),
                query_chars,
                value.len()
            )
        }
        Err(_) => "invalid_url".to_string(),
    }
}
