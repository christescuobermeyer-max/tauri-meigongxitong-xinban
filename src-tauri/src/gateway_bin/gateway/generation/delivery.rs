use super::*;

pub(crate) fn resolve_gateway_prompt(
    state: &AppState,
    req: &GatewayGenerateImageRequest,
) -> Result<String, GatewayError> {
    if let Some(prompt_config) = req.prompt_config.as_ref() {
        let prompt = state.prompt_templates.render(prompt_config).map_err(|error| {
            GatewayError::bad_gateway(format!("云端 prompt 渲染失败：{error}"))
        })?;
        if prompt.trim().is_empty() {
            return Err(GatewayError::bad_gateway("云端 prompt 渲染为空"));
        }
        return Ok(prompt);
    }

    let prompt = req.prompt.as_deref().unwrap_or("");
    if prompt.trim().is_empty() {
        return Err(GatewayError::bad_request(
            "缺少 prompt 或 prompt_config，无法生成图片",
        ));
    }
    Ok(prompt.to_string())
}

pub(crate) fn validate_result_delivery_request(req: &GatewayGenerateImageRequest) -> Result<(), GatewayError> {
    if req.result_delivery == ResultDelivery::OssUrl && req.archive.is_none() {
        return Err(GatewayError::bad_request(
            "result_delivery=oss_url 时必须提供 archive 归档参数",
        ));
    }
    Ok(())
}

pub(crate) fn select_result_delivery(
    requested: ResultDelivery,
    image: String,
    archive_url: Option<String>,
) -> DeliveredImage {
    let usable_archive_url = archive_url.filter(|url| !url.trim().is_empty());
    if requested == ResultDelivery::OssUrl {
        if let Some(image_url) = usable_archive_url {
            return DeliveredImage {
                image: None,
                image_url: Some(image_url),
                result_delivery: ResultDelivery::OssUrl,
            };
        }
    }

    DeliveredImage {
        image: Some(image),
        image_url: None,
        result_delivery: ResultDelivery::InlineBase64,
    }
}

pub(crate) struct GeneratedImageOutcome {
    pub(crate) image: String,
    pub(crate) apimart_task_id: Option<String>,
}

pub(crate) fn log_gateway_generate_request(req: &api::GenerateRequest, log_label: &str) {
    let refs = req
        .product_images
        .iter()
        .map(|image| {
            format!(
                "{}:{}",
                reference_image::reference_image_type(image),
                image.len()
            )
        })
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
