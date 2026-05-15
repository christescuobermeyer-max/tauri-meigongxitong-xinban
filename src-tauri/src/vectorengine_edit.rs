use crate::gemini_response::truncate_for_msg;
use crate::http_client::format_reqwest_error;
use crate::image_api_response::extract_image_from_response_body;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::CONTENT_TYPE;
use reqwest::multipart::{Form, Part};
use std::time::Duration;

struct ReferenceImageFile {
    bytes: Vec<u8>,
    mime: String,
    file_name: String,
}

pub async fn generate_vectorengine_edit_image(
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

    for (index, image_ref) in image_refs.iter().enumerate() {
        let file = load_reference_image(client, image_ref, index).await?;
        let part = Part::bytes(file.bytes)
            .file_name(file.file_name)
            .mime_str(&file.mime)
            .map_err(|error| format!("构建线路3参考图表单失败：{error}"))?;
        form = form.part("image", part);
    }

    let response = client
        .post(api_url)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("调用线路3编辑接口失败：{}", format_reqwest_error(&error)))?;

    let status = response.status();
    eprintln!("[image-2:line3-edit] response_status={status}");
    let body_text = response
        .text()
        .await
        .map_err(|error| format!("读取线路3编辑响应失败：{error}"))?;
    eprintln!(
        "[image-2:line3-edit] response_preview={}",
        truncate_for_msg(&body_text, 240)
    );

    if !status.is_success() {
        return Err(format!(
            "线路3编辑接口返回 {status}: {}",
            truncate_for_msg(&body_text, 600)
        ));
    }

    extract_image_from_response_body(&body_text)
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
                "下载线路3第 {} 张参考图失败：{}",
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
        .map_err(|error| format!("下载线路3第 {} 张参考图失败：{error}", index + 1))?
        .bytes()
        .await
        .map_err(|error| format!("读取线路3第 {} 张参考图失败：{error}", index + 1))?;

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
        .map_err(|error| format!("解析线路3第 {} 张 base64 参考图失败：{error}", index + 1))?;
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
    use super::{extension_from_mime, split_data_url};

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
