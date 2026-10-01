use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, GenericImageView, RgbImage};
use std::path::Path;
use super::types::*;
use super::jpeg::flatten_to_white_rgb;

#[cfg(feature = "tauri-commands")]
#[tauri::command]
pub async fn process_images(
    image_paths: Vec<String>,
    output_dir: String,
    platform: String,
) -> Result<Vec<ImageResizeResult>, String> {
    tokio::task::spawn_blocking(move || process_images_blocking(image_paths, output_dir, platform))
        .await
        .map_err(|error| format!("尺寸调整任务失败：{error}"))?
}

#[cfg(feature = "tauri-commands")]
fn process_images_blocking(
    image_paths: Vec<String>,
    output_dir: String,
    platform: String,
) -> Result<Vec<ImageResizeResult>, String> {
    let output_path = Path::new(&output_dir);
    std::fs::create_dir_all(output_path).map_err(|error| format!("创建输出目录失败：{error}"))?;

    let (target_width, target_height, max_bytes) = match platform.as_str() {
        "eleme" => (800_u32, 800_u32, None),
        _ => (600_u32, 450_u32, Some(512_000_u64)),
    };
    let output_dimensions = format!("{target_width}×{target_height}");

    Ok(image_paths
        .into_iter()
        .map(|input_path| {
            process_single_image_resize(
                Path::new(&input_path),
                output_path,
                target_width,
                target_height,
                max_bytes,
                &output_dimensions,
            )
        })
        .collect())
}

#[cfg(feature = "tauri-commands")]
fn process_single_image_resize(
    input_path: &Path,
    output_dir: &Path,
    target_width: u32,
    target_height: u32,
    max_bytes: Option<u64>,
    output_dimensions: &str,
) -> ImageResizeResult {
    let file_name = input_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("未知文件")
        .to_string();
    let input_path_string = input_path.to_string_lossy().to_string();
    let input_size = std::fs::metadata(input_path).map(|metadata| metadata.len()).unwrap_or(0);
    let output_path = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let output_path = output_dir.join(format!("{output_path}.jpg"));
    let output_path_string = output_path.to_string_lossy().to_string();

    let image = match image::open(input_path) {
        Ok(image) => image,
        Err(error) => {
            return ImageResizeResult {
                file_name,
                input_path: input_path_string,
                output_path: String::new(),
                input_size,
                output_size: 0,
                input_dimensions: "未知".to_string(),
                output_dimensions: output_dimensions.to_string(),
                status: "error".to_string(),
                error: Some(format!("读取图片失败：{error}")),
            };
        }
    };

    let (input_width, input_height) = image.dimensions();
    let input_dimensions = format!("{input_width}×{input_height}");
    let rgb = flatten_to_white_rgb(&image);
    let resized = image::imageops::resize(
        &rgb,
        target_width,
        target_height,
        FilterType::Lanczos3,
    );

    let output_size = match max_bytes {
        Some(limit) => match encode_resize_jpeg_with_limit(&resized, &output_path, limit) {
            Ok(size) => size,
            Err(error) => {
                return ImageResizeResult {
                    file_name,
                    input_path: input_path_string,
                    output_path: String::new(),
                    input_size,
                    output_size: 0,
                    input_dimensions,
                    output_dimensions: output_dimensions.to_string(),
                    status: "error".to_string(),
                    error: Some(error),
                };
            }
        },
        None => match encode_resize_jpeg(&resized, &output_path, 95) {
            Ok(size) => size,
            Err(error) => {
                return ImageResizeResult {
                    file_name,
                    input_path: input_path_string,
                    output_path: String::new(),
                    input_size,
                    output_size: 0,
                    input_dimensions,
                    output_dimensions: output_dimensions.to_string(),
                    status: "error".to_string(),
                    error: Some(error),
                };
            }
        },
    };

    ImageResizeResult {
        file_name,
        input_path: input_path_string,
        output_path: output_path_string,
        input_size,
        output_size,
        input_dimensions,
        output_dimensions: output_dimensions.to_string(),
        status: "success".to_string(),
        error: None,
    }
}

#[cfg(feature = "tauri-commands")]
fn encode_resize_jpeg(
    image: &RgbImage,
    output_path: &Path,
    quality: u8,
) -> Result<u64, String> {
    let mut buffer = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
    encoder
        .encode_image(&DynamicImage::ImageRgb8(image.clone()))
        .map_err(|error| format!("JPEG 编码失败：{error}"))?;
    std::fs::write(output_path, &buffer).map_err(|error| format!("写入图片失败：{error}"))?;
    Ok(buffer.len() as u64)
}

#[cfg(feature = "tauri-commands")]
fn encode_resize_jpeg_with_limit(
    image: &RgbImage,
    output_path: &Path,
    max_bytes: u64,
) -> Result<u64, String> {
    const QUALITIES: [u8; 16] = [
        95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20,
    ];

    for quality in QUALITIES {
        let mut buffer = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
        encoder
            .encode_image(&DynamicImage::ImageRgb8(image.clone()))
            .map_err(|error| format!("JPEG 编码失败：{error}"))?;
        if (buffer.len() as u64) <= max_bytes {
            std::fs::write(output_path, &buffer)
                .map_err(|error| format!("写入图片失败：{error}"))?;
            return Ok(buffer.len() as u64);
        }
    }

    encode_resize_jpeg(image, output_path, 20)
}
