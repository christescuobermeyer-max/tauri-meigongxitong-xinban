use crate::gemini_response::truncate_for_msg;
use crate::http_client::format_reqwest_error;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::{header::CONTENT_TYPE, Url};
use std::time::Duration;

/// HTTP 拉取 OSS 图片的总尝试次数。
/// 上午统计显示 ~20% 的生图 attempt 失败在 `.bytes().await: error decoding response body`，
/// 阿里云 OSS CDN 偶发提前 EOF / stale connection，立刻重试一般就成功。
const DOWNLOAD_ATTEMPTS: usize = 2;
const DOWNLOAD_RETRY_DELAY: Duration = Duration::from_millis(300);

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
    Err(last_error.unwrap_or_else(|| format!("{error_label}：unknown")))
}

async fn fetch_image_bytes_once(
    client: &reqwest::Client,
    url: &str,
    error_label: &str,
) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|error| format!("{error_label}：{}", format_reqwest_error(&error)))?
        .error_for_status()
        .map_err(|error| format!("{error_label}：{error}"))?;
    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|error| format!("{error_label}：{error}"))
}

pub async fn log_reference_image_diagnostics(client: &reqwest::Client, images: &[String]) {
    for (index, image) in images.iter().enumerate() {
        let image_type = reference_image_type(image);
        if image_type == "base64" {
            eprintln!("[image-2] ref[{index}] type=base64 chars={}", image.len());
            continue;
        }

        let url_summary = summarize_reference_url(image);
        match client
            .get(image)
            .header("Range", "bytes=0-0")
            .timeout(Duration::from_secs(20))
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                let content_type = response
                    .headers()
                    .get(CONTENT_TYPE)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or("-");
                eprintln!(
                    "[image-2] ref[{index}] type=url status={} content_type={} {}",
                    status, content_type, url_summary
                );
            }
            Err(error) => {
                eprintln!(
                    "[image-2] ref[{index}] type=url fetch_error={} {}",
                    error, url_summary
                );
            }
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
        Err(_) => format!("invalid_url_preview={}", truncate_for_msg(value, 160)),
    }
}
