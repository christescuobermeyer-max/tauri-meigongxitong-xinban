use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{imageops::FilterType, DynamicImage, ImageFormat};
use std::path::Path;
use super::types::*;
use super::jpeg::save_jpeg_with_limit;

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
