//! 线路6 manxiaobai (满小白) 编辑接口。
//!
//! 协议与线路2 yunwu 一致：multipart/form-data 调用 OpenAI 兼容的
//! /v1/images/edits。区别是 manxiaobai 当前是"备用线路"，
//! 上游池经常出现 `insufficient_quota` / `model_cooldown` 429，
//! 因此在网关层直接做 3 次自动重试，失败间隔 1.5s。

use crate::gemini_response::truncate_for_msg;
use crate::http_client::format_reqwest_error;
use crate::image_api_response::extract_image_from_response_body;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::CONTENT_TYPE;
use reqwest::multipart::{Form, Part};
use std::time::Duration;
use tokio::time::sleep;

const MAX_ATTEMPTS: usize = 3;
const RETRY_BACKOFF_MS: u64 = 1500;

struct ReferenceImageFile {
    bytes: Vec<u8>,
    mime: String,
    file_name: String,
}

pub async fn generate_manxiaobai_edit_image(
    client: &reqwest::Client,
    api_url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
    size: &str,
    image_refs: &[String],
    quality: Option<&str>,
    format: Option<&str>,
) -> Result<String, String> {
    let mut last_error: Option<String> = None;

    let mut files: Vec<ReferenceImageFile> = Vec::with_capacity(image_refs.len());
    for (index, image_ref) in image_refs.iter().enumerate() {
        files.push(load_reference_image(client, image_ref, index).await?);
    }

    for attempt in 1..=MAX_ATTEMPTS {
        let mut form = Form::new()
            .text("model", model.to_string())
            .text("prompt", prompt.to_string())
            .text("size", size.to_string())
            .text("n", "1".to_string());

        if let Some(quality) = quality {
            form = form.text("quality", quality.to_string());
        }
        if let Some(format) = format {
            form = form.text("format", format.to_string());
        }

        for file in &files {
            let part = Part::bytes(file.bytes.clone())
                .file_name(file.file_name.clone())
                .mime_str(&file.mime)
                .map_err(|error| format!("构建线路6参考图表单失败：{error}"))?;
            form = form.part("image", part);
        }

        let response = client
            .post(api_url)
            .bearer_auth(api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|error| {
                format!(
                    "调用线路6编辑接口失败：{}",
                    format_reqwest_error(&error)
                )
            });

        let response = match response {
            Ok(r) => r,
            Err(err) => {
                last_error = Some(err);
                if attempt < MAX_ATTEMPTS {
                    sleep(Duration::from_millis(RETRY_BACKOFF_MS)).await;
                    continue;
                }
                break;
            }
        };

        let status = response.status();
        eprintln!(
            "[image-2:line6-edit] attempt={attempt}/{MAX_ATTEMPTS} response_status={status}"
        );
        let body_text = match response.text().await {
            Ok(t) => t,
            Err(error) => {
                last_error = Some(format!("读取线路6编辑响应失败：{error}"));
                if attempt < MAX_ATTEMPTS {
                    sleep(Duration::from_millis(RETRY_BACKOFF_MS)).await;
                    continue;
                }
                break;
            }
        };
        eprintln!(
            "[image-2:line6-edit] attempt={attempt}/{MAX_ATTEMPTS} response_preview={}",
            truncate_for_msg(&body_text, 240)
        );

        if status.is_success() {
            return extract_image_from_response_body(&body_text);
        }

        last_error = Some(format!(
            "线路6编辑接口返回 {status}: {}",
            truncate_for_msg(&body_text, 600)
        ));

        // 429/5xx 才重试；4xx（非 429）通常是参数问题，重试无意义。
        let should_retry =
            status.as_u16() == 429 || status.is_server_error();
        if !should_retry || attempt == MAX_ATTEMPTS {
            break;
        }
        sleep(Duration::from_millis(RETRY_BACKOFF_MS)).await;
    }

    Err(last_error.unwrap_or_else(|| "线路6编辑接口请求失败".to_string()))
}

async fn load_reference_image(
    client: &reqwest::Client,
    image_ref: &str,
    index: usize,
) -> Result<ReferenceImageFile, String> {
    if image_ref.starts_with("http://") || image_ref.starts_with("https://") {
        return download_reference_image(client, image_ref, index).await;
    }
    decode_reference_image(image_ref, index)
}

async fn download_reference_image(
    client: &reqwest::Client,
    url: &str,
    index: usize,
) -> Result<ReferenceImageFile, String> {
    let response = client
        .get(url)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|error| {
            format!(
                "下载线路6第 {} 张参考图失败：{}",
                index + 1,
                format_reqwest_error(&error)
            )
        })?;
    let mime = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .trim()
        .to_string();
    let bytes = response
        .error_for_status()
        .map_err(|error| format!("下载线路6第 {} 张参考图失败：{error}", index + 1))?
        .bytes()
        .await
        .map_err(|error| format!("读取线路6第 {} 张参考图失败：{error}", index + 1))?;

    Ok(ReferenceImageFile {
        bytes: bytes.to_vec(),
        file_name: format!("reference-{}.{}", index + 1, extension_from_mime(&mime)),
        mime,
    })
}

fn decode_reference_image(image_ref: &str, index: usize) -> Result<ReferenceImageFile, String> {
    let (mime, b64) = split_data_url(image_ref).unwrap_or(("image/png", image_ref));
    let bytes = STANDARD
        .decode(b64.trim())
        .map_err(|error| format!("解析线路6第 {} 张 base64 参考图失败：{error}", index + 1))?;
    Ok(ReferenceImageFile {
        bytes,
        mime: mime.to_string(),
        file_name: format!("reference-{}.{}", index + 1, extension_from_mime(mime)),
    })
}

fn split_data_url(value: &str) -> Option<(&str, &str)> {
    let rest = value.strip_prefix("data:")?;
    let (mime, b64) = rest.split_once(";base64,")?;
    Some((mime, b64))
}

fn extension_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    }
}

#[cfg(test)]
mod tests {
    use super::{extension_from_mime, split_data_url, MAX_ATTEMPTS};

    #[test]
    fn three_attempts_for_backup_line() {
        assert_eq!(MAX_ATTEMPTS, 3);
    }

    #[test]
    fn split_png_data_url() {
        assert_eq!(
            split_data_url("data:image/png;base64,abc"),
            Some(("image/png", "abc"))
        );
    }

    #[test]
    fn map_image_extensions() {
        assert_eq!(extension_from_mime("image/jpeg"), "jpg");
        assert_eq!(extension_from_mime("image/webp"), "webp");
        assert_eq!(extension_from_mime("image/png"), "png");
    }
}
