use image::{AnimationDecoder, ImageDecoder};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

pub const MAX_BYTES: usize = 5_000_000;
#[path = "product_animation/model.rs"]
pub mod model;

pub fn normalize_webp_duration(bytes: &mut [u8], duration_ms: u32) -> Result<(), String> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err("WebP文件头无效".into());
    }
    let mut offset = 12;
    let mut durations = Vec::new();
    while offset + 8 <= bytes.len() {
        let length = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let end = offset
            .checked_add(8)
            .and_then(|value| value.checked_add(length))
            .ok_or("WebP块长度无效")?;
        if end > bytes.len() {
            return Err("WebP块不完整".into());
        }
        if &bytes[offset..offset + 4] == b"ANMF" {
            if length < 16 {
                return Err("WebP动画帧头损坏".into());
            }
            durations.push(offset + 8 + 12);
        }
        offset = end + length % 2;
    }
    if durations.len() < 2 || durations.len() > 100 {
        return Err("WebP动画帧数无效".into());
    }
    let count = durations.len() as u32;
    for (index, offset) in durations.into_iter().enumerate() {
        let duration = duration_ms / count + u32::from((index as u32) < duration_ms % count);
        bytes[offset..offset + 3].copy_from_slice(&duration.to_le_bytes()[..3]);
    }
    Ok(())
}

/// Style id of animations cut from a video clip rather than drawn over a still image.
pub const VIDEO_STYLE: &str = "video";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationSpec {
    pub width: u32,
    pub height: u32,
    pub duration_ms: u32,
    pub format: String,
    pub style: String,
}

impl AnimationSpec {
    pub fn validate(&self) -> Result<(), String> {
        let ratio43 = self.width as u64 * 3 == self.height as u64 * 4;
        let ratio169 = self.width as u64 * 9 == self.height as u64 * 16;
        if !(ratio43 || ratio169)
            || self.width <= 750
            || self.height <= if ratio43 { 562 } else { 422 }
            || self.width > 2048
            || self.height > 1536
        {
            return Err(
                "尺寸必须为 4:3 或 16:9，宽大于750，满足平台高度限制，且不超过2048×1536".into(),
            );
        }
        if !matches!(self.duration_ms, 2000 | 3000 | 4000 | 5000) {
            return Err("时长只能为2、3、4或5秒".into());
        }
        if !matches!(self.format.as_str(), "gif" | "webp") {
            return Err("仅支持 GIF 和 WebP".into());
        }
        if !matches!(
            self.style.as_str(),
            // Retired styles stay valid so previously saved animations can still be exported.
            "gilded" | "wok" | "crush" | "signature" | "sparkle" | "heart" | "burst" | "swing"
                | "blaze" | "beat" | "stamp" | "flip" | "steam" | "smoke" | "aroma" | "flame"
                | "recommend" | VIDEO_STYLE
        ) {
            return Err("未知动图风格".into());
        }
        Ok(())
    }
    pub fn frame_count(&self) -> u32 {
        self.duration_ms / 50
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationMedia {
    pub width: u32,
    pub height: u32,
    pub duration_ms: u32,
    pub frames: u32,
    pub bytes: usize,
    pub format: String,
}

pub fn inspect_animation(bytes: &[u8], spec: &AnimationSpec) -> Result<AnimationMedia, String> {
    inspect_animation_with_limit(bytes, spec, MAX_BYTES)
}

pub(crate) fn inspect_animation_with_limit(bytes: &[u8], spec: &AnimationSpec, max_bytes: usize) -> Result<AnimationMedia, String> {
    spec.validate()?;
    if bytes.is_empty() || bytes.len() > max_bytes {
        return Err("动图超过大小限制，不能交付".into());
    }
    let cursor = Cursor::new(bytes);
    let (dimensions, frames) = if spec.format == "gif" {
        let decoder = image::codecs::gif::GifDecoder::new(cursor).map_err(|_| "GIF文件损坏")?;
        (decoder.dimensions(), decoder.into_frames())
    } else {
        let decoder = image::codecs::webp::WebPDecoder::new(cursor).map_err(|_| "WebP文件损坏")?;
        if !decoder.has_animation() {
            return Err("WebP不是动图".into());
        }
        (decoder.dimensions(), decoder.into_frames())
    };
    if dimensions != (spec.width, spec.height) {
        return Err("动图尺寸与选择的输出画布不一致".into());
    }
    let mut count = 0;
    let mut duration = 0.0;
    let mut first_digest = None;
    let mut changed = false;
    for frame in frames {
        use sha2::{Digest, Sha256};
        let frame = frame.map_err(|_| "动图帧解码失败")?;
        count += 1;
        if count > 100 {
            return Err("动图帧数超限".into());
        }
        let (numerator, denominator) = frame.delay().numer_denom_ms();
        if denominator == 0 || numerator == 0 {
            return Err("动图帧时长无效".into());
        }
        duration += numerator as f64 / denominator as f64;
        let digest = Sha256::digest(frame.buffer().as_raw()).to_vec();
        if let Some(first) = &first_digest {
            changed |= *first != digest;
        } else {
            first_digest = Some(digest);
        }
    }
    if count < 2 || !changed || !(2000.0..=5000.0).contains(&duration) {
        return Err("必须为有画面变化的2–5秒动图".into());
    }
    Ok(AnimationMedia {
        width: spec.width,
        height: spec.height,
        duration_ms: duration.round() as u32,
        frames: count,
        bytes: bytes.len(),
        format: spec.format.clone(),
    })
}

#[cfg(feature = "tauri-commands")]
pub mod commands;

#[cfg(test)]
mod tests {
    use super::*;
    fn spec() -> AnimationSpec {
        AnimationSpec {
            width: 1024,
            height: 768,
            duration_ms: 3000,
            format: "gif".into(),
            style: "steam".into(),
        }
    }
    #[test]
    fn platform_limits_are_strict() {
        assert!(spec().validate().is_ok());
        assert!(AnimationSpec { style: VIDEO_STYLE.into(), ..spec() }.validate().is_ok());
        assert!(AnimationSpec {
            height: 771,
            ..spec()
        }
        .validate()
        .is_err());
        assert!(AnimationSpec {
            width: 748,
            height: 561,
            ..spec()
        }
        .validate()
        .is_err());
        assert!(AnimationSpec {
            width: 768,
            height: 432,
            ..spec()
        }
        .validate()
        .is_ok());
        assert!(AnimationSpec {
            duration_ms: 5001,
            ..spec()
        }
        .validate()
        .is_err());
        assert!(AnimationSpec {
            format: "png".into(),
            ..spec()
        }
        .validate()
        .is_err());
        assert!(AnimationSpec {
            style: "unknown".into(),
            ..spec()
        }
        .validate()
        .is_err());
        assert!(inspect_animation(&vec![0; MAX_BYTES + 1], &spec()).is_err());
    }

    #[test]
    fn webp_timing_repair_rejects_invalid_data_and_preserves_total() {
        assert!(normalize_webp_duration(&mut b"not webp".to_vec(), 3000).is_err());
        let mut bytes = b"RIFF\0\0\0\0WEBP".to_vec();
        for _ in 0..3 {
            bytes.extend_from_slice(b"ANMF");
            bytes.extend_from_slice(&16_u32.to_le_bytes());
            bytes.extend_from_slice(&[0; 16]);
        }
        normalize_webp_duration(&mut bytes, 2000).unwrap();
        let total: u32 = [32, 56, 80]
            .into_iter()
            .map(|offset| {
                u32::from_le_bytes([bytes[offset], bytes[offset + 1], bytes[offset + 2], 0])
            })
            .sum();
        assert_eq!(total, 2000);
        bytes.truncate(50);
        assert!(normalize_webp_duration(&mut bytes, 2000).is_err());
    }
    #[test]
    fn verifies_decoded_motion_duration_and_dimensions() {
        use image::{Delay, Frame, Rgba, RgbaImage};
        let mut bytes = Vec::new();
        {
            let mut encoder = image::codecs::gif::GifEncoder::new(&mut bytes);
            for shade in [10, 200] {
                let image = RgbaImage::from_pixel(1024, 768, Rgba([shade, 0, 0, 255]));
                encoder
                    .encode_frame(Frame::from_parts(
                        image,
                        0,
                        0,
                        Delay::from_numer_denom_ms(1500, 1),
                    ))
                    .unwrap();
            }
        }
        let media = inspect_animation(&bytes, &spec()).unwrap();
        assert_eq!(media.duration_ms, 3000);
        assert_eq!(media.frames, 2);
        assert!(inspect_animation(
            &bytes,
            &AnimationSpec {
                width: 800,
                height: 600,
                ..spec()
            }
        )
        .is_err());
        assert!(inspect_animation(b"GIF89a broken", &spec()).is_err());
    }
}
