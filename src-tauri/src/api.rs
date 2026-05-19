//! GPT-Image-2 API 客户端封装
//!
//! 接口：POST https://api3.wlai.vip/v1/images/generations
//! 请求体：{ model, prompt, size, n, image: [base64|url] }
//!
//! 由于单次生成可能耗时较久，客户端超时设置为 350s。

use crate::api_validation::validate_generate_request;
use crate::apimart::generate_apimart_image;
use crate::env_config::read_required_env;
use crate::gemini_response::truncate_for_msg;
use crate::http_client::{build_api_client, format_reqwest_error};
use crate::image_api_response::extract_image_from_response_body;
use crate::image_generation_payload::build_json_payload;
use crate::image_provider::{resolve_image_provider, ImageApiLine};
use crate::manxiaobai_edit::generate_manxiaobai_edit_image;
use crate::pockgo_chat::generate_pockgo_chat_image;
use crate::reference_image::{
    download_image_if_url, log_reference_image_diagnostics, reference_image_type,
};
use crate::vectorengine_edit::generate_vectorengine_edit_image;
use crate::yunwu_edit::generate_yunwu_edit_image;
use serde::Deserialize;

/// 前端调用入参（与 TypeScript 端 GenerateImageRequest 对齐）
#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
    /// 线路1/3支持 "1024x1024" / "1024x1536" / "1536x1024" / "21:9" / "3:4"；线路2海报使用 "1792x768"；线路4额外支持 "16:9" / "1792x1024"；线路5使用比例值，门头 "auto" 会转为 "3:2"
    pub size: String,
    /// 参考图列表：支持不含 data: 前缀的 base64，也支持可访问 URL；可为空
    pub product_images: Vec<String>,
    /// 生图线路：线路1为 yunwu，线路2为 yunwu，线路3为 vectorengine，线路4为 pockgo，线路5为 APIMart
    #[serde(default)]
    pub api_line: ImageApiLine,
}

/// 调用生图接口，返回图片的 base64（不含 data: 前缀）
#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn generate_image(req: GenerateRequest) -> Result<String, String> {
    validate_generate_request(&req)?;
    let provider = resolve_image_provider(req.api_line);
    log_generate_request(&req, provider.log_label);
    let api_key = read_required_env(provider.api_key_env_keys)?;

    let client = build_api_client("image-2")?;
    log_reference_image_diagnostics(&client, &req.product_images).await;

    if req.api_line == ImageApiLine::Line5 {
        let image = generate_apimart_image(
            &client,
            provider.api_url,
            &api_key,
            provider.model,
            &req.prompt,
            &req.size,
            &req.product_images,
        )
        .await?;
        return download_image_if_url(&client, image, "下载线路5 APIMart远端图片失败").await;
    }

    if req.api_line == ImageApiLine::Line4 {
        let image = generate_pockgo_chat_image(
            provider.api_url,
            api_key,
            provider.model,
            &req.prompt,
            &req.size,
            &req.product_images,
        )
        .await?;
        return download_image_if_url(&client, image, "下载线路4 pockgo远端图片失败").await;
    }

    if req.api_line == ImageApiLine::Line2 && !req.product_images.is_empty() {
        let edit_api_url = provider
            .edit_api_url
            .ok_or_else(|| "线路2编辑接口未配置".to_string())?;
        let image = generate_yunwu_edit_image(
            &client,
            edit_api_url,
            &api_key,
            provider.model,
            &req.prompt,
            &req.size,
            &req.product_images,
            provider.quality,
            provider.format,
        )
        .await?;
        return download_image_if_url(&client, image, "下载线路2编辑远端图片失败").await;
    }

    if req.api_line == ImageApiLine::Line3 && !req.product_images.is_empty() {
        let edit_api_url = provider
            .edit_api_url
            .ok_or_else(|| "线路3编辑接口未配置".to_string())?;
        let image = generate_vectorengine_edit_image(
            &client,
            edit_api_url,
            &api_key,
            provider.model,
            &req.prompt,
            &req.size,
            &req.product_images,
            provider.quality,
            provider.format,
        )
        .await?;
        return download_image_if_url(&client, image, "下载线路3编辑远端图片失败").await;
    }

    if req.api_line == ImageApiLine::Line6 && !req.product_images.is_empty() {
        let edit_api_url = provider
            .edit_api_url
            .ok_or_else(|| "线路6编辑接口未配置".to_string())?;
        let image = generate_manxiaobai_edit_image(
            &client,
            edit_api_url,
            &api_key,
            provider.model,
            &req.prompt,
            &req.size,
            &req.product_images,
            provider.quality,
            provider.format,
        )
        .await?;
        return download_image_if_url(&client, image, "下载线路6编辑远端图片失败").await;
    }

    let payload = build_json_payload(&provider, &req);

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

    let image = extract_image_from_response_body(&body_text)?;
    download_image_if_url(&client, image, "下载 image-2 远端图片失败").await
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
