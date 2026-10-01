use image::{codecs::jpeg::JpegEncoder, DynamicImage, Rgb, RgbImage};
use std::path::Path;

pub(super) fn save_jpeg_with_limit(
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

pub(super) fn flatten_to_white_rgb(image: &DynamicImage) -> RgbImage {
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
