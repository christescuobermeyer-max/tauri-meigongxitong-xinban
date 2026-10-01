use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage};
use super::types::*;
use super::jpeg::flatten_to_white_rgb;

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
