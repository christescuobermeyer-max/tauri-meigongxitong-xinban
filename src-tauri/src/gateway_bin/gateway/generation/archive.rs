use super::*;

pub(crate) async fn archive_generated_image(
    state: &AppState,
    req: ArchiveGeneratedImageRequest,
    raw_base64: &str,
) -> Result<ArchiveGeneratedImageResult, String> {
    let _permit = state
        .oss_archive_limiter
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "OSS 归档队列已关闭".to_string())?;
    let config = compression_config_for_asset_kind(&req.asset_kind)?;
    let compressed =
        image_proc::compress_generated_image(image_proc::CompressGeneratedImageRequest {
            base64_data: raw_base64.to_string(),
            max_dimension: config.max_dimension,
            quality: config.quality,
        })
        .await?;
    let uploaded = oss::upload_image_to_oss(oss::UploadImageToOssRequest {
        base64_data: compressed.base64_data,
        mime_type: Some(compressed.mime_type),
        folder: "generated".to_string(),
        file_name: Some(format!("{}.jpg", req.file_name_stem)),
    })
    .await?;

    Ok(ArchiveGeneratedImageResult {
        url: uploaded.url,
        key: uploaded.key,
    })
}

pub(crate) async fn record_generation_log(
    state: &AppState,
    user_token: &str,
    user_id: &str,
    req: &ArchiveGeneratedImageRequest,
    generation_line: &str,
    archive: &ArchiveGeneratedImageResult,
    elapsed_ms: u64,
) -> Result<(), String> {
    let (shop_name, platform) = history_metadata(req)
        .ok_or_else(|| "缺少 shop_name/platform，网关无法写入云端生图记录".to_string())?;
    record_generation_log_with_auth(
        state,
        Some(user_token),
        user_id,
        &shop_name,
        &req.asset_kind,
        req.product_name.as_deref(),
        &platform,
        generation_line,
        archive,
        elapsed_ms,
    )
    .await
}

pub(crate) async fn record_generation_log_with_auth(
    state: &AppState,
    user_token: Option<&str>,
    user_id: &str,
    shop_name: &str,
    asset_kind: &str,
    product_name: Option<&str>,
    platform: &str,
    generation_line: &str,
    archive: &ArchiveGeneratedImageResult,
    elapsed_ms: u64,
) -> Result<(), String> {
    let (api_key, bearer) = match state.supabase_service_role_key.as_deref() {
        Some(service_key) if !service_key.trim().is_empty() => (service_key, service_key),
        _ => (
            state.supabase_anon_key.as_str(),
            user_token.ok_or_else(|| {
                "缺少 SUPABASE_SERVICE_ROLE_KEY，无法恢复写入历史记录".to_string()
            })?,
        ),
    };
    let response = state
        .client
        .post(format!("{}/rest/v1/generation_logs", state.supabase_url))
        .header("apikey", api_key)
        .bearer_auth(bearer)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&json!({
            "user_id": user_id,
            "shop_name": normalize_shop_name(shop_name),
            "product_name": normalize_optional_product_name(product_name),
            "asset_kind": asset_kind,
            "platform": platform,
            "generation_line": generation_line,
            "oss_url": archive.url,
            "oss_key": archive.key,
            "elapsed_ms": elapsed_ms,
        }))
        .send()
        .await
        .map_err(|error| format!("请求 Supabase 写入 generation_logs 失败：{error}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(format!(
        "Supabase 写入 generation_logs 返回 {status}: {}",
        gemini_response::truncate_for_msg(&body, 500)
    ))
}

pub(crate) fn history_metadata(req: &ArchiveGeneratedImageRequest) -> Option<(String, String)> {
    let platform = req.platform.as_deref()?.trim();
    if !matches!(platform, "meituan" | "taobao") {
        return None;
    }
    Some((
        normalize_shop_name(req.shop_name.as_deref().unwrap_or("")),
        platform.to_string(),
    ))
}

pub(crate) fn normalize_shop_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "未命名店铺".to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn normalize_optional_product_name(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) struct ArchiveCompressionConfig {
    pub(crate) max_dimension: u32,
    pub(crate) quality: u8,
}

pub(crate) fn compression_config_for_asset_kind(kind: &str) -> Result<ArchiveCompressionConfig, String> {
    let config = match kind {
        "avatar" => ArchiveCompressionConfig {
            max_dimension: 1024,
            quality: 90,
        },
        "storefront" => ArchiveCompressionConfig {
            max_dimension: 1536,
            quality: 90,
        },
        "poster" => ArchiveCompressionConfig {
            max_dimension: 2048,
            quality: 92,
        },
        "p_signboard" => ArchiveCompressionConfig {
            max_dimension: 1792,
            quality: 92,
        },
        "product" => ArchiveCompressionConfig {
            max_dimension: 1024,
            quality: 90,
        },
        "picture_wall" => ArchiveCompressionConfig {
            max_dimension: 1536,
            quality: 92,
        },
        "detail_page" => ArchiveCompressionConfig {
            max_dimension: 2048,
            quality: 92,
        },
        "menu_design" => ArchiveCompressionConfig { max_dimension: 4096, quality: 95 },
        "brand_story" | "data_analysis" | "patrol_script" => ArchiveCompressionConfig {
            max_dimension: 1792,
            quality: 90,
        },
        _ => return Err(format!("不支持的归档图片类型：{kind}")),
    };
    Ok(config)
}
