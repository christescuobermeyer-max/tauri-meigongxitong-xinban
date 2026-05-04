//! 图像后处理：把模型输出的原图（1024×1024 或 1536×1024）按平台尺寸做整体缩放后写入磁盘。
//!
//! 关键点：
//! - 使用 `resize_exact` 拉伸到目标尺寸 → 保留完整图片内容、不裁剪。
//! - 滤镜使用 Lanczos3，保证缩放后清晰度。
//! - 产品图导出为 JPEG 时，会按质量递减方式压缩到目标大小上限内。

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ImageFormat};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct ResizeRequest {
    pub base64_data: String,
    pub target_width: u32,
    pub target_height: u32,
    pub output_path: String,
    #[serde(default)]
    pub max_bytes: Option<u64>,
}

/// 解码 base64 → 拉伸到目标尺寸 → 按扩展名保存
#[tauri::command]
pub async fn resize_and_save_image(req: ResizeRequest) -> Result<String, String> {
    if req.target_width == 0 || req.target_height == 0 {
        return Err("目标尺寸不能为 0".into());
    }

    let bytes = STANDARD
        .decode(req.base64_data.as_bytes())
        .map_err(|e| format!("base64 解码失败：{e}"))?;

    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("解析图片失败：{e}"))?;

    let resized = img.resize_exact(
        req.target_width,
        req.target_height,
        FilterType::Lanczos3,
    );

    let path = Path::new(&req.output_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败：{e}"))?;
        }
    }

    let format = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => ImageFormat::Png,
        Some("jpg") | Some("jpeg") => ImageFormat::Jpeg,
        Some("webp") => ImageFormat::WebP,
        _ => ImageFormat::Png,
    };

    // JPEG 不支持 alpha；先转换为 RGB8
    let to_save = match format {
        ImageFormat::Jpeg => DynamicImage::ImageRgb8(resized.to_rgb8()),
        _ => resized,
    };

    if matches!(format, ImageFormat::Jpeg) {
        save_jpeg_with_limit(&to_save, path, req.max_bytes)?;
    } else {
        to_save
            .save_with_format(path, format)
            .map_err(|e| format!("写入磁盘失败：{e}"))?;
    }

    Ok(req.output_path)
}

fn save_jpeg_with_limit(
    image: &DynamicImage,
    path: &Path,
    max_bytes: Option<u64>,
) -> Result<(), String> {
    let mut last_bytes = None;

    for quality in jpeg_quality_candidates(max_bytes) {
        let mut buffer = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut buffer, *quality);
        encoder
            .encode_image(image)
            .map_err(|e| format!("JPEG 编码失败：{e}"))?;

        if max_bytes.is_none_or(|limit| buffer.len() as u64 <= limit) {
            std::fs::write(path, buffer).map_err(|e| format!("写入磁盘失败：{e}"))?;
            return Ok(());
        }

        last_bytes = Some(buffer);
    }

    if let Some(buffer) = last_bytes {
        std::fs::write(path, buffer).map_err(|e| format!("写入磁盘失败：{e}"))?;
        return Ok(());
    }

    Err("未能生成 JPEG 图片".into())
}

fn jpeg_quality_candidates(max_bytes: Option<u64>) -> &'static [u8] {
    const DEFAULT_QUALITY: &[u8] = &[92];
    const LIMITED_QUALITIES: &[u8] = &[92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24];

    if max_bytes.is_some() {
        LIMITED_QUALITIES
    } else {
        DEFAULT_QUALITY
    }
}
