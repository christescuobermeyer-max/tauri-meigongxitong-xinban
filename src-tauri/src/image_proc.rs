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
pub struct SaveBase64ImageRequest {
    pub base64_data: String,
    pub output_path: String,
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

/// 解码 base64 图片并把原始编码字节写入磁盘，不改变尺寸、比例或压缩格式。
#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn save_base64_image(req: SaveBase64ImageRequest) -> Result<String, String> {
    let output_path = req.output_path.trim();
    if output_path.is_empty() {
        return Err("输出路径不能为空".into());
    }

    let base64_data = req.base64_data.trim();
    let payload = if base64_data.starts_with("data:") {
        base64_data
            .split_once(',')
            .map(|(_, data)| data)
            .unwrap_or(base64_data)
    } else {
        base64_data
    };
    let bytes = STANDARD
        .decode(payload.as_bytes())
        .map_err(|e| format!("base64 解码失败：{e}"))?;

    image::load_from_memory(&bytes).map_err(|e| format!("解析图片失败：{e}"))?;

    let path = Path::new(output_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
        }
    }

    std::fs::write(path, &bytes).map_err(|e| format!("写入磁盘失败：{e}"))?;

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

    // 解码 + resize + JPEG encode 都是 CPU 密集同步操作；
    // 3 路网关 archive 并发就足以把 tokio runtime 的所有工作线程占满，
    // 进而阻塞同期的上游 LLM polling / 其它 HTTP 请求。
    // 全部丢到 blocking pool。
    tokio::task::spawn_blocking(move || compress_blocking(req))
        .await
        .map_err(|e| format!("压缩任务调度失败：{e}"))?
}

fn compress_blocking(
    req: CompressGeneratedImageRequest,
) -> Result<CompressGeneratedImageResponse, String> {
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
    }

    if let Some(limit) = max_bytes {
        return Err(format!(
            "JPEG 图片无法压缩到 {}KB 以内，请降低目标尺寸或更换图片",
            limit / 1024
        ));
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

    #[tokio::test]
    async fn save_base64_image_writes_original_bytes() {
        let source = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            64,
            32,
            image::Rgba([0, 128, 255, 255]),
        ));
        let mut source_bytes = Vec::new();
        source
            .write_to(
                &mut std::io::Cursor::new(&mut source_bytes),
                ImageFormat::Png,
            )
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "csgh-original-image-test-{}.png",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);

        let result = save_base64_image(SaveBase64ImageRequest {
            base64_data: STANDARD.encode(&source_bytes),
            output_path: path.to_string_lossy().to_string(),
        })
        .await
        .unwrap();

        assert_eq!(result, path.to_string_lossy());
        assert_eq!(std::fs::read(&path).unwrap(), source_bytes);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_jpeg_with_limit_errors_when_limit_cannot_be_met() {
        let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            64,
            64,
            image::Rgba([128, 64, 32, 255]),
        ));
        let path =
            std::env::temp_dir().join(format!("csgh-jpeg-limit-test-{}.jpg", std::process::id()));
        let _ = std::fs::remove_file(&path);

        let result = save_jpeg_with_limit(&image, &path, Some(1));

        assert!(result.is_err());
        assert!(!path.exists());
    }
}
