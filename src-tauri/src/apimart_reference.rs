use crate::http_client::format_reqwest_error;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, Rgb, RgbImage};
use std::time::Duration;

const REFERENCE_MAX_DIMENSION: u32 = 1024;
const REFERENCE_JPEG_QUALITY: u8 = 82;

pub async fn build_apimart_image_urls(
    client: &reqwest::Client,
    images: &[String],
) -> Result<Vec<String>, String> {
    let mut image_urls = Vec::with_capacity(images.len());
    for (index, image) in images.iter().enumerate() {
        let bytes = load_reference_bytes(client, image, index).await?;
        image_urls.push(compress_reference_to_data_url(&bytes, index)?);
    }
    Ok(image_urls)
}

async fn load_reference_bytes(
    client: &reqwest::Client,
    value: &str,
    index: usize,
) -> Result<Vec<u8>, String> {
    if value.starts_with("http://") || value.starts_with("https://") {
        return download_reference_bytes(client, value, index).await;
    }

    let raw = value
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(value)
        .trim();
    STANDARD
        .decode(raw.as_bytes())
        .map_err(|error| format!("解析线路5第 {} 张参考图 base64 失败：{error}", index + 1))
}

async fn download_reference_bytes(
    client: &reqwest::Client,
    url: &str,
    index: usize,
) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|error| {
            format!(
                "下载线路5第 {} 张参考图失败：{}",
                index + 1,
                format_reqwest_error(&error)
            )
        })?
        .error_for_status()
        .map_err(|error| format!("下载线路5第 {} 张参考图失败：{error}", index + 1))?;
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("读取线路5第 {} 张参考图失败：{error}", index + 1))
}

fn compress_reference_to_data_url(bytes: &[u8], index: usize) -> Result<String, String> {
    let image = image::load_from_memory(bytes)
        .map_err(|error| format!("解析线路5第 {} 张参考图失败：{error}", index + 1))?;
    let resized = image.resize(
        REFERENCE_MAX_DIMENSION,
        REFERENCE_MAX_DIMENSION,
        FilterType::Lanczos3,
    );
    let rgb = flatten_to_white_rgb(&resized);
    let mut buffer = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, REFERENCE_JPEG_QUALITY);
    encoder
        .encode_image(&DynamicImage::ImageRgb8(rgb))
        .map_err(|error| format!("压缩线路5第 {} 张参考图失败：{error}", index + 1))?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(buffer)))
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
