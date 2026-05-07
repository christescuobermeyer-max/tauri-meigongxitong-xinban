//! 图像后处理：把模型输出的原图（1024×1024 或 1792×1024）按平台尺寸做整体缩放后写入磁盘。
//!
//! 关键点：
//! - 使用 `resize_exact` 拉伸到目标尺寸 → 保留完整图片内容、不裁剪。
//! - 滤镜使用 Lanczos3，保证缩放后清晰度。
//! - 产品图导出为 JPEG 时，会按质量递减方式压缩到目标大小上限内。

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{
    codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ImageFormat, Rgb, RgbImage,
};
use serde::Deserialize;
use serde::Serialize;
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

#[derive(Debug, Deserialize)]
pub struct CompressGeneratedImageRequest {
    pub base64_data: String,
    #[serde(default = "default_max_dimension")]
    pub max_dimension: u32,
    #[serde(default = "default_jpeg_quality")]
    pub quality: u8,
}

#[derive(Debug, Serialize)]
pub struct CompressGeneratedImageResponse {
    pub base64_data: String,
    pub mime_type: String,
    pub byte_size: usize,
    pub width: u32,
    pub height: u32,
}

/// 解码 base64 → 拉伸到目标尺寸 → 按扩展名保存
#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn resize_and_save_image(req: ResizeRequest) -> Result<String, String> {
    if req.target_width == 0 || req.target_height == 0 {
        return Err("目标尺寸不能为 0".into());
    }

    let bytes = STANDARD
        .decode(req.base64_data.as_bytes())
        .map_err(|e| format!("base64 解码失败：{e}"))?;

    let img = image::load_from_memory(&bytes).map_err(|e| format!("解析图片失败：{e}"))?;

    let resized = img.resize_exact(req.target_width, req.target_height, FilterType::Lanczos3);

    let path = Path::new(&req.output_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
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

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn compress_generated_image(
    req: CompressGeneratedImageRequest,
) -> Result<CompressGeneratedImageResponse, String> {
    if req.max_dimension == 0 {
        return Err("压缩尺寸不能为 0".into());
    }
    if !(1..=100).contains(&req.quality) {
        return Err("JPEG 质量必须在 1-100 之间".into());
    }

    let bytes = STANDARD
        .decode(req.base64_data.as_bytes())
        .map_err(|e| format!("base64 解码失败：{e}"))?;
    let image = image::load_from_memory(&bytes).map_err(|e| format!("解析图片失败：{e}"))?;
    let resized = image.resize(req.max_dimension, req.max_dimension, FilterType::Lanczos3);
    let rgb = flatten_to_white_rgb(&resized);
    let mut buffer = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, req.quality);
    encoder
        .encode_image(&DynamicImage::ImageRgb8(rgb))
        .map_err(|e| format!("JPEG 编码失败：{e}"))?;

    Ok(CompressGeneratedImageResponse {
        base64_data: STANDARD.encode(&buffer),
        mime_type: "image/jpeg".to_string(),
        byte_size: buffer.len(),
        width: resized.width(),
        height: resized.height(),
    })
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
    const LIMITED_QUALITIES: &[u8] = &[
        92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24,
    ];

    if max_bytes.is_some() {
        LIMITED_QUALITIES
    } else {
        DEFAULT_QUALITY
    }
}

fn flatten_to_white_rgb(image: &DynamicImage) -> RgbImage {
    let rgba = image.to_rgba8();
    let mut rgb = RgbImage::from_pixel(rgba.width(), rgba.height(), Rgb([255, 255, 255]));

    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = pixel[3] as u16;
        let inv = 255_u16.saturating_sub(alpha);
        let blended = [
            ((pixel[0] as u16 * alpha + 255 * inv) / 255) as u8,
            ((pixel[1] as u16 * alpha + 255 * inv) / 255) as u8,
            ((pixel[2] as u16 * alpha + 255 * inv) / 255) as u8,
        ];
        rgb.put_pixel(x, y, Rgb(blended));
    }

    rgb
}

fn default_max_dimension() -> u32 {
    768
}

fn default_jpeg_quality() -> u8 {
    82
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, RgbaImage};

    #[tokio::test]
    async fn compress_generated_image_outputs_small_jpeg() {
        let source = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            1024,
            1024,
            image::Rgba([255, 0, 0, 255]),
        ));
        let mut source_bytes = Vec::new();
        source
            .write_to(
                &mut std::io::Cursor::new(&mut source_bytes),
                ImageFormat::Png,
            )
            .unwrap();

        let result = compress_generated_image(CompressGeneratedImageRequest {
            base64_data: STANDARD.encode(source_bytes),
            max_dimension: 768,
            quality: 82,
        })
        .await
        .unwrap();

        assert_eq!(result.mime_type, "image/jpeg");
        assert_eq!(result.width, 768);
        assert_eq!(result.height, 768);
        assert!(result.byte_size > 0);
    }
}
