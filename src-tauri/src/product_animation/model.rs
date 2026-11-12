//! Preserve model-generated frames and speed; fit the selected canvas and repeat whole cycles.
use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSourceMedia {
    pub width: u32,
    pub height: u32,
    pub frames: u32,
    pub duration_ms: u32,
    pub cycles: u32,
    pub upscaled: bool,
}
pub struct ModelExport {
    pub bytes: Vec<u8>,
    pub poster: Vec<u8>,
    pub media: AnimationMedia,
    pub source_media: ModelSourceMedia,
}

// libwebp may round the final timestamp by 1ms. Keep every other frame's duration intact.
fn repair_webp_rounding(bytes: &mut [u8], target: u32) -> Result<(), String> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err("WebP文件头无效".into());
    }
    let mut offset = 12;
    let mut total = 0u32;
    let mut last = None;
    while offset + 8 <= bytes.len() {
        let size = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let end = offset
            .checked_add(8)
            .and_then(|n| n.checked_add(size))
            .ok_or("WebP块长度无效")?;
        if end > bytes.len() {
            return Err("WebP块损坏".into());
        }
        if &bytes[offset..offset + 4] == b"ANMF" {
            if size < 16 {
                return Err("WebP帧头损坏".into());
            }
            let at = offset + 20;
            let duration = u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], 0]);
            total = total.checked_add(duration).ok_or("WebP时长溢出")?;
            last = Some((at, duration));
        }
        offset = end + size % 2;
    }
    if total.abs_diff(target) > 20 {
        return Err("WebP编码改变了播放速度".into());
    }
    let (at, duration) = last.ok_or("WebP没有动画帧")?;
    let duration = i64::from(duration) + i64::from(target) - i64::from(total);
    if !(1..=0xffffff).contains(&duration) {
        return Err("WebP末帧时长无效".into());
    }
    bytes[at..at + 3].copy_from_slice(&(duration as u32).to_le_bytes()[..3]);
    Ok(())
}

/// Scale to cover the canvas, then crop; keep 1/4 of the overflow above so top signage survives.
fn cover_crop(width: u32, height: u32, spec: &AnimationSpec) -> (u32, u32, u32, u32) {
    let scale = (spec.width as f64 / width as f64).max(spec.height as f64 / height as f64);
    let scaled_width = ((width as f64 * scale).ceil() as u32).max(spec.width);
    let scaled_height = ((height as f64 * scale).ceil() as u32).max(spec.height);
    let x = (scaled_width - spec.width) / 2;
    let y = (scaled_height - spec.height) / 4;
    (scaled_width, scaled_height, x, y)
}

fn inspect_source(original: &[u8], spec: &AnimationSpec) -> Result<ModelSourceMedia, String> {
    spec.validate()?;
    if original.is_empty() || original.len() > 32 * 1024 * 1024 {
        return Err("模型动图超过32MiB处理限制".into());
    }
    let decoder = image::codecs::gif::GifDecoder::new(Cursor::new(original))
        .map_err(|_| "模型没有返回有效GIF动图")?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 || width > 2048 || height > 1536 {
        return Err("模型动图画布超出处理限制".into());
    }
    let mut count = 0;
    let mut duration = 0u32;
    let mut first = None;
    let mut changed = false;
    for frame in decoder.into_frames() {
        count += 1;
        if count > 100 || u64::from(count) * u64::from(width) * u64::from(height) > 64_000_000 {
            return Err("模型动图解码预算超限".into());
        }
        let frame = frame.map_err(|_| "模型GIF帧损坏")?;
        let (numerator, denominator) = frame.delay().numer_denom_ms();
        if denominator == 0 || numerator == 0 {
            return Err("模型帧时长无效".into());
        }
        duration = duration
            .checked_add(numerator / denominator)
            .ok_or("模型时长无效")?;
        if duration > 5000 {
            return Err("模型单个循环超过5秒，未裁剪或改变速度".into());
        }
        let hash = Sha256::digest(frame.buffer().as_raw()).to_vec();
        if let Some(ref first) = first {
            changed |= *first != hash;
        } else {
            first = Some(hash);
        }
    }
    if count < 2 || !changed || duration == 0 {
        return Err("模型返回静态画面，未替换为本地模拟动效".into());
    }
    let max_cycles = (5000 / duration).min(100 / count);
    let cycles = (1..=max_cycles)
        .filter(|cycles| cycles * duration >= 2000)
        .min_by_key(|cycles| (cycles * duration).abs_diff(spec.duration_ms))
        .ok_or("完整重复循环后仍无法满足2–5秒和帧数限制")?;
    let scale = (spec.width as f64 / width as f64).max(spec.height as f64 / height as f64);
    Ok(ModelSourceMedia {
        width,
        height,
        frames: count,
        duration_ms: duration,
        cycles,
        upscaled: scale > 1.0,
    })
}

pub fn export_model_gif(
    original: &[u8],
    spec: &AnimationSpec,
    directory: &Path,
    ffmpeg: &Path,
) -> Result<ModelExport, String> {
    let source_media = inspect_source(original, spec)?;
    if u64::from(source_media.frames)
        * u64::from(source_media.cycles)
        * u64::from(spec.width)
        * u64::from(spec.height)
        > 64_000_000
    {
        return Err("所选画布与帧数超过导出处理预算，请选择较小画布或更短目标时长".into());
    }
    let target_duration = source_media.duration_ms * source_media.cycles;
    let decoder =
        image::codecs::gif::GifDecoder::new(Cursor::new(original)).map_err(|_| "模型GIF损坏")?;
    let first = decoder
        .into_frames()
        .next()
        .ok_or("模型GIF无帧")?
        .map_err(|_| "模型GIF首帧损坏")?;
    let (scaled_width, scaled_height, crop_x, crop_y) =
        cover_crop(source_media.width, source_media.height, spec);
    let canvas = image::DynamicImage::ImageRgba8(first.into_buffer())
        .resize_exact(
            scaled_width,
            scaled_height,
            image::imageops::FilterType::Lanczos3,
        )
        .crop_imm(crop_x, crop_y, spec.width, spec.height)
        .to_rgb8();
    let mut poster = Cursor::new(Vec::new());
    canvas
        .write_to(&mut poster, image::ImageFormat::Jpeg)
        .map_err(|_| "动图封面生成失败")?;
    if spec.format == "gif"
        && original.len() <= MAX_BYTES
        && source_media.width == spec.width
        && source_media.height == spec.height
        && source_media.cycles == 1
    {
        let media = inspect_animation(original, spec)?;
        return Ok(ModelExport {
            bytes: original.to_vec(),
            poster: poster.into_inner(),
            media,
            source_media,
        });
    }
    fs::create_dir_all(directory).map_err(|_| "无法创建动图处理目录")?;
    fs::write(directory.join("source.gif"), original).map_err(|_| "无法暂存模型动图")?;
    let output = directory.join(format!("result.{}", spec.format));
    let version = Command::new(ffmpeg)
        .arg("-version")
        .output()
        .map_err(|_| "无法读取FFmpeg版本")?;
    let version = String::from_utf8_lossy(&version.stdout);
    let legacy = version
        .split_whitespace()
        .nth(2)
        .is_some_and(|version| version.starts_with("4.") || version.starts_with("3."));
    let (scaled_width, scaled_height, crop_x, crop_y) =
        cover_crop(source_media.width, source_media.height, spec);
    let fit=format!("scale={scaled_width}:{scaled_height}:flags=lanczos,crop={}:{}:{crop_x}:{crop_y},setsar=1",spec.width,spec.height);
    for quality in 0..4 {
        let mut command = Command::new(ffmpeg);
        command.current_dir(directory).args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-stream_loop",
            &(source_media.cycles - 1).to_string(),
            "-ignore_loop",
            "1",
            "-i",
            "source.gif",
        ]);
        if spec.format == "gif" {
            // Later tiers denoise over time so static areas repeat exactly and diff-encode cheaply.
            let filter = match quality {
                0 => format!("[0:v]{fit},split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=bayer:bayer_scale=3"),
                _ => {
                    let colors = [256, 256, 128, 96][quality];
                    format!("[0:v]{fit},hqdn3d=0:0:6:6,split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle")
                }
            };
            command.args(["-filter_complex",&filter,"-loop","0"]);
        } else {
            command.args([
                "-vf",
                &fit,
                "-c:v",
                "libwebp_anim",
                "-quality",
                &[82, 65, 45, 35][quality].to_string(),
                "-loop",
                "0",
            ]);
        }
        command
            .args(if legacy {
                ["-vsync", "0"]
            } else {
                ["-fps_mode", "passthrough"]
            })
            .args(["-threads", "2"])
            .arg(&output)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|_| "未找到支持GIF/WebP的FFmpeg")?;
        let start = Instant::now();
        loop {
            if start.elapsed() > Duration::from_secs(120)
                || fs::metadata(&output).is_ok_and(|m| m.len() > 64 * 1024 * 1024)
            {
                let _ = child.kill();
                let _ = child.wait();
                return Err("模型动图压缩超出处理预算".into());
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        return Err("模型动图编码失败，请检查FFmpeg编码器".into());
                    }
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("动图编码进程异常".into());
                }
            }
        }
        let mut bytes = fs::read(&output).map_err(|_| "无法读取模型动图导出文件")?;
        if spec.format == "webp" {
            repair_webp_rounding(&mut bytes, target_duration)?;
        }
        if let Ok(media) = inspect_animation(&bytes, spec) {
            if media.duration_ms.abs_diff(target_duration) > 20 {
                return Err("编码后播放速度发生变化，未交付".into());
            }
            return Ok(ModelExport {
                bytes,
                poster: poster.into_inner(),
                media,
                source_media,
            });
        }
    }
    Err("模型动图压缩后仍超过5M，请选择更短的循环时长或改用WebP".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(width: u32, height: u32, delay: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = image::codecs::gif::GifEncoder::new(&mut bytes);
            encoder
                .set_repeat(image::codecs::gif::Repeat::Infinite)
                .unwrap();
            for color in [[120, 50, 0, 255], [150, 60, 0, 255], [180, 70, 0, 255]] {
                encoder
                    .encode_frame(image::Frame::from_parts(
                        image::RgbaImage::from_pixel(width, height, image::Rgba(color)),
                        0,
                        0,
                        image::Delay::from_numer_denom_ms(delay, 1),
                    ))
                    .unwrap();
            }
        }
        bytes
    }
    fn spec() -> AnimationSpec {
        AnimationSpec {
            width: 768,
            height: 576,
            duration_ms: 3000,
            format: "gif".into(),
            style: "steam".into(),
        }
    }
    #[test]
    fn keeps_compliant_model_gif_byte_exact_and_rejects_static() {
        let bytes = fixture(768, 576, 1000);
        let output =
            export_model_gif(&bytes, &spec(), Path::new("unused"), Path::new("unused")).unwrap();
        assert_eq!(output.bytes, bytes);
        assert_eq!(output.media.duration_ms, 3000);
        assert!(inspect_source(b"PNG", &spec()).is_err());
        assert!(inspect_source(&fixture(32, 32, 2000), &spec()).is_err());
    }
    #[test]
    fn covers_canvas_and_keeps_top_of_narrow_model_output() {
        let spec = AnimationSpec { width: 1024, height: 768, ..spec() };
        let (w, h, x, y) = cover_crop(439, 390, &spec);
        assert_eq!(w, 1024);
        assert!(h >= 768 && x == 0);
        assert_eq!(y, (h - 768) / 4);
        let (w, h, x, y) = cover_crop(1024, 512, &spec);
        assert_eq!((h, y), (768, 0));
        assert_eq!(x, (w - 1024) / 2);
        assert_eq!(cover_crop(1024, 768, &spec), (1024, 768, 0, 0));
    }
    #[test]
    fn repeats_whole_cycles_without_changing_speed() {
        let media = inspect_source(&fixture(439, 389, 540), &spec()).unwrap();
        assert_eq!(media.duration_ms, 1620);
        assert_eq!(media.cycles, 2);
        assert!(media.upscaled);
    }
    #[test]
    fn actual_conversion_fits_canvas_and_preserves_cycle_speed() {
        let Some(binary) = std::env::var_os("CSGH_TEST_FFMPEG") else {
            return;
        };
        let bytes = fixture(439, 389, 540);
        for format in ["gif", "webp"] {
            let spec = AnimationSpec {
                format: format.into(),
                ..spec()
            };
            let dir = std::env::temp_dir().join(format!("model-gif-test-{}", uuid::Uuid::new_v4()));
            let result = export_model_gif(&bytes, &spec, &dir, Path::new(&binary));
            let _ = fs::remove_dir_all(dir);
            let result = result.unwrap();
            assert_eq!(result.media.frames, 6);
            assert!(result.media.duration_ms.abs_diff(3240) <= 20);
        }
    }
    #[test]
    fn export_actual_provider_result_when_supplied() {
        let Some(path) = std::env::var_os("CSGH_TEST_MODEL_GIF") else {
            return;
        };
        let bytes = fs::read(&path).unwrap();
        let binary = std::env::var_os("CSGH_TEST_FFMPEG").unwrap();
        let root = Path::new(&path).parent().unwrap();
        let mut results = Vec::new();
        for format in ["gif", "webp"] {
            let spec = AnimationSpec {
                format: format.into(),
                ..spec()
            };
            let dir = root.join(format!("encode-{format}"));
            let result = export_model_gif(&bytes, &spec, &dir, Path::new(&binary)).unwrap();
            fs::write(root.join(format!("model-platform.{format}")), &result.bytes).unwrap();
            fs::write(root.join("model-poster.jpg"), &result.poster).unwrap();
            results.push(serde_json::json!({"media":result.media,"source":result.source_media}));
            fs::remove_dir_all(dir).unwrap();
        }
        fs::write(
            root.join("export-validation.json"),
            serde_json::to_vec_pretty(&results).unwrap(),
        )
        .unwrap();
    }
}
