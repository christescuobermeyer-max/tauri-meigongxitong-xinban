//! GPT-Image-2 API 客户端封装
//!
//! 接口：POST https://api3.wlai.vip/v1/images/generations
//! 请求体：{ model, prompt, size, n, image: [base64|url] }
//!
//! 由于单次生成可能耗时较久（最多约 6-8 分钟），客户端超时设置为 600s。

use base64::{engine::general_purpose::STANDARD, Engine as _};
use crate::env_config::read_required_env;
use crate::gemini_response::truncate_for_msg;
use crate::http_client::{build_api_client, format_reqwest_error};
use crate::image_provider::{resolve_image_provider, ImageApiLine};
use crate::pockgo_chat::generate_pockgo_chat_image;
use crate::reference_image::{
    download_image_if_url, log_reference_image_diagnostics, reference_image_type,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAX_REFERENCE_IMAGES: usize = 5;

/// 前端调用入参（与 TypeScript 端 GenerateImageRequest 对齐）
#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
    /// 1024x1024 / 1024x1536 / 1536x1024 / 21:9 / 3:4
    pub size: String,
    /// 参考图列表：支持不含 data: 前缀的 base64，也支持可访问 URL；可为空
    pub product_images: Vec<String>,
    /// 生图线路：线路1为 yunwu，线路2为 pockgo
    #[serde(default)]
    pub api_line: ImageApiLine,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reject_more_than_five_reference_images() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "1024x1024".into(),
            product_images: vec!["x".into(); 6],
            api_line: ImageApiLine::Line1,
        };

        let err = validate_generate_request(&req).unwrap_err();

        assert_eq!(err, "产品图最多支持 5 张，请删除多余图片后重试");
    }

    #[test]
    fn use_wlai_api_endpoint() {
        let provider = resolve_image_provider(ImageApiLine::Line1);

        assert_eq!(provider.api_url, "https://api3.wlai.vip/v1/images/generations");
    }

    #[test]
    fn allow_generate_without_reference_images() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "1024x1024".into(),
            product_images: vec![],
            api_line: ImageApiLine::Line1,
        };

        assert!(validate_generate_request(&req).is_ok());
    }

    #[test]
    fn allow_poster_wide_ratio_size() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "21:9".into(),
            product_images: vec!["https://example.com/storefront.png".into()],
            api_line: ImageApiLine::Line1,
        };

        assert!(validate_generate_request(&req).is_ok());
    }

    #[test]
    fn default_to_line1_when_api_line_is_missing() {
        let req: GenerateRequest = serde_json::from_str(
            r#"{"prompt":"测试","size":"1024x1024","product_images":[]}"#,
        )
        .unwrap();

        assert_eq!(req.api_line, ImageApiLine::Line1);
    }

}

#[derive(Debug, Serialize)]
struct ApiPayload<'a> {
    model: &'a str,
    prompt: &'a str,
    size: &'a str,
    n: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<&'a [String]>,
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    #[serde(default)]
    data: Vec<ApiImageData>,
}

#[derive(Debug, Deserialize)]
struct ApiImageData {
    #[serde(default)]
    b64_json: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

/// 调用生图接口，返回图片的 base64（不含 data: 前缀）
#[tauri::command]
pub async fn generate_image(req: GenerateRequest) -> Result<String, String> {
    validate_generate_request(&req)?;
    let provider = resolve_image_provider(req.api_line);
    log_generate_request(&req, provider.log_label);
    let api_key = read_required_env(provider.api_key_env_keys)?;

    let client = build_api_client("image-2")?;
    log_reference_image_diagnostics(&client, &req.product_images).await;

    if req.api_line == ImageApiLine::Line2 {
        let image = generate_pockgo_chat_image(
            &client,
            provider.api_url,
            api_key,
            provider.model,
            &req.prompt,
            &req.size,
            &req.product_images,
        )
        .await?;
        return download_image_if_url(&client, image, "下载线路2 pockgo远端图片失败").await;
    }

    let payload = ApiPayload {
        model: provider.model,
        prompt: &req.prompt,
        size: &req.size,
        n: 1,
        image: (!req.product_images.is_empty()).then_some(req.product_images.as_slice()),
    };

    let response = client
        .post(provider.api_url)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            format!(
                "调用{}接口失败：{}",
                provider.user_label,
                format_reqwest_error(&e)
            )
        })?;

    let status = response.status();
    eprintln!("[{}] response_status={status}", provider.log_label);
    let body_text = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败：{e}"))?;
    eprintln!(
        "[{}] response_preview={}",
        provider.log_label,
        truncate_for_msg(&body_text, 240)
    );

    if !status.is_success() {
        return Err(format!(
            "{}接口返回 {status}: {}",
            provider.user_label,
            truncate_for_msg(&body_text, 600)
        ));
    }

    let parsed: ApiResponse = serde_json::from_str(&body_text)
        .map_err(|e| format!("解析响应 JSON 失败：{e}; 原始响应片段：{}", truncate_for_msg(&body_text, 400)))?;

    let first = parsed
        .data
        .into_iter()
        .next()
        .ok_or_else(|| "image-2 接口返回的 data 数组为空".to_string())?;

    if let Some(b64) = first.b64_json {
        return Ok(b64);
    }

    if let Some(url) = first.url {
        let bytes = client
            .get(&url)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| format!("下载远端图片失败：{}", format_reqwest_error(&e)))?
            .error_for_status()
            .map_err(|e| format!("下载远端图片失败：{e}"))?
            .bytes()
            .await
            .map_err(|e| format!("读取远端图片失败：{e}"))?;
        return Ok(STANDARD.encode(&bytes));
    }

    Err("image-2 接口响应中既无 b64_json 也无 url".into())
}

fn validate_generate_request(req: &GenerateRequest) -> Result<(), String> {
    if req.product_images.len() > MAX_REFERENCE_IMAGES {
        return Err(format!(
            "产品图最多支持 {MAX_REFERENCE_IMAGES} 张，请删除多余图片后重试"
        ));
    }
    if !matches!(req.size.as_str(), "1024x1024" | "1024x1536" | "1536x1024" | "21:9" | "3:4") {
        return Err(format!("不支持的尺寸：{}", req.size));
    }
    Ok(())
}

fn log_generate_request(req: &GenerateRequest, log_label: &str) {
    let refs = req
        .product_images
        .iter()
        .map(|image| format!("{}:{}", reference_image_type(image), image.len()))
        .collect::<Vec<_>>()
        .join(",");
    eprintln!(
        "[{}] image_count={} image_refs=[{}] prompt_chars={} size={}",
        log_label,
        req.product_images.len(),
        refs,
        req.prompt.chars().count(),
        req.size
    );
}
