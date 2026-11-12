use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

struct Session {
    directory: PathBuf,
    user_id: String,
    spec: AnimationSpec,
    received: u32,
    encoding: bool,
    cancelled: Arc<AtomicBool>,
    started: Instant,
}
static SESSIONS: OnceLock<Mutex<HashMap<String, Session>>> = OnceLock::new();
fn sessions() -> &'static Mutex<HashMap<String, Session>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationResult {
    pub id: String,
    pub style: String,
    pub path: String,
    pub poster_path: String,
    pub created_at: String,
    pub media: AnimationMedia,
}

fn user_directory(app: &AppHandle, user_id: &str) -> Result<PathBuf, String> {
    let user_id = uuid::Uuid::parse_str(user_id).map_err(|_| "用户标识无效")?;
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("product-animations")
        .join(user_id.to_string()))
}

#[tauri::command]
pub async fn import_model_animation(app: AppHandle, user_id: String, id: String, data: String, spec: AnimationSpec, sha256: String) -> Result<AnimationResult, String> {
    let id = uuid::Uuid::parse_str(&id).map_err(|_| "无效动图任务")?.to_string();
    let directory = user_directory(&app, &user_id)?.join(&id);
    if data.len() > 6_700_000 { return Err("动图超过5M".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        use sha2::{Digest, Sha256};
        let bytes = STANDARD.decode(data).map_err(|_| "动图数据无效")?;
        if format!("{:x}", Sha256::digest(&bytes)) != sha256 { return Err("动图下载摘要校验失败".into()); }
        let media = inspect_animation(&bytes, &spec)?;
        if spec.style != "steam" { return Err("模型动图风格无效".into()); }
        fs::create_dir_all(&directory).map_err(|_| "无法创建动图保存目录")?;
        let path = directory.join(format!("result.{}", spec.format));
        let poster = directory.join("poster.jpg");
        let first = if spec.format == "gif" {
            image::codecs::gif::GifDecoder::new(Cursor::new(&bytes)).map_err(|_| "GIF损坏")?.into_frames().next()
        } else {
            image::codecs::webp::WebPDecoder::new(Cursor::new(&bytes)).map_err(|_| "WebP损坏")?.into_frames().next()
        }.ok_or("动图缺少首帧")?.map_err(|_| "动图首帧损坏")?;
        image::DynamicImage::ImageRgba8(first.into_buffer()).to_rgb8().save(&poster).map_err(|_| "无法保存动图封面")?;
        fs::write(&path, &bytes).map_err(|_| "无法保存动图")?;
        let result = AnimationResult { id, style: "steam".into(), path: path.to_string_lossy().into(), poster_path: poster.to_string_lossy().into(), created_at: chrono::Utc::now().to_rfc3339(), media };
        fs::write(directory.join("result.json"), serde_json::to_vec(&result).map_err(|_| "动图记录编码失败")?).map_err(|_| "无法保存动图记录")?;
        Ok(result)
    }).await.map_err(|_| "保存模型动图失败")?
}

#[tauri::command]
pub async fn begin_product_animation(
    app: AppHandle,
    user_id: String,
    spec: AnimationSpec,
) -> Result<String, String> {
    spec.validate()?;
    user_directory(&app, &user_id)?;
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("product-animation-frames");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let mut registry = sessions().lock().map_err(|_| "任务锁不可用")?;
    registry.retain(|_, session| {
        if !session.encoding && session.started.elapsed() > Duration::from_secs(3600) {
            let _ = fs::remove_dir_all(&session.directory);
            false
        } else {
            true
        }
    });
    if !registry.is_empty() {
        return Err("已有动图正在处理，请先完成或取消".into());
    }
    for entry in fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        if uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_ok()
            && entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
            && entry
                .metadata()
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|time| time.elapsed().ok())
                .map(|age| age > Duration::from_secs(86400))
                .unwrap_or(false)
        {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    let directory = directory.join(&id);
    fs::create_dir(&directory).map_err(|error| error.to_string())?;
    registry.insert(
        id.clone(),
        Session {
            directory,
            user_id,
            spec,
            received: 0,
            encoding: false,
            cancelled: Arc::new(AtomicBool::new(false)),
            started: Instant::now(),
        },
    );
    Ok(id)
}

#[tauri::command]
pub async fn append_product_animation_frame(
    id: String,
    index: u32,
    png: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if png.len() > 12_000_000 {
            return Err("动画帧过大".into());
        }
        let mut registry = sessions().lock().map_err(|_| "任务锁不可用")?;
        let session = registry.get_mut(&id).ok_or("动图任务不存在")?;
        if session.encoding || index != session.received || index >= session.spec.frame_count() {
            return Err("动画帧顺序或数量错误".into());
        }
        let bytes = STANDARD.decode(png).map_err(|_| "帧数据不是有效Base64")?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("动画帧必须为PNG".into());
        }
        let dimensions =
            image::ImageReader::with_format(Cursor::new(&bytes), image::ImageFormat::Png)
                .into_dimensions()
                .map_err(|_| "动画帧损坏")?;
        if dimensions != (session.spec.width, session.spec.height) {
            return Err("动画帧尺寸不一致".into());
        }
        fs::write(session.directory.join(format!("{index:04}.png")), bytes)
            .map_err(|error| error.to_string())?;
        session.received += 1;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn ffmpeg(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let names = if cfg!(target_os = "windows") {
        vec!["ffmpeg.exe", "ffmpeg-x86_64-pc-windows-msvc.exe"]
    } else if cfg!(target_os = "macos") {
        vec![
            "ffmpeg",
            "ffmpeg-aarch64-apple-darwin",
            "ffmpeg-x86_64-apple-darwin",
        ]
    } else {
        vec!["ffmpeg", "ffmpeg-x86_64-unknown-linux-gnu"]
    };
    for base in [
        directory.clone(),
        directory.join("binaries"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries"),
    ] {
        for name in &names {
            let candidate = base.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    if cfg!(target_os = "macos") && Path::new("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg").is_file()
    {
        return Ok(PathBuf::from("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"));
    }
    if cfg!(target_os = "macos") && Path::new("/opt/homebrew/bin/ffmpeg").is_file() {
        return Ok(PathBuf::from("/opt/homebrew/bin/ffmpeg"));
    }
    Ok(PathBuf::from("ffmpeg"))
}

fn run_encoder(
    binary: &Path,
    directory: &Path,
    spec: &AnimationSpec,
    attempt: usize,
    cancelled: &AtomicBool,
) -> Result<PathBuf, String> {
    let output = directory.join(format!("encoded.{}", spec.format));
    let mut command = Command::new(binary);
    command.current_dir(directory).args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        "20",
        "-i",
        "%04d.png",
        "-an",
    ]);
    let rate = [20, 15, 10][attempt];
    if spec.format == "gif" {
        let colors = [256, 128, 64][attempt];
        command.args(["-filter_complex", &format!("fps={rate},split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle"), "-loop", "0"]);
    } else {
        command.args([
            "-vf",
            &format!("fps={rate}"),
            "-c:v",
            "libwebp_anim",
            "-lossless",
            "0",
            "-quality",
            &[82, 65, 45][attempt].to_string(),
            "-loop",
            "0",
        ]);
    }
    command
        .arg(&output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "无法启动FFmpeg，请使用包含媒体工具的桌面安装包")?;
    let started = Instant::now();
    loop {
        if cancelled.load(Ordering::Relaxed)
            || started.elapsed() > Duration::from_secs(120)
            || fs::metadata(&output)
                .map(|meta| meta.len() > 64_000_000)
                .unwrap_or(false)
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("动图处理已取消或超时".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return Err("动图编码失败；请检查安装包媒体组件是否支持所选格式".into());
                }
                break;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
    }
    if spec.format == "webp" {
        let mut bytes = fs::read(&output).map_err(|error| error.to_string())?;
        normalize_webp_duration(&mut bytes, spec.duration_ms)?;
        fs::write(&output, bytes).map_err(|error| error.to_string())?;
    }
    Ok(output)
}

#[tauri::command]
pub async fn finish_product_animation(
    app: AppHandle,
    id: String,
) -> Result<AnimationResult, String> {
    let (directory, user_id, spec, cancelled) = {
        let mut registry = sessions().lock().map_err(|_| "任务锁不可用")?;
        let session = registry.get_mut(&id).ok_or("动图任务不存在")?;
        if session.encoding || session.received != session.spec.frame_count() {
            return Err("动画帧不完整或正在编码".into());
        }
        session.encoding = true;
        (
            session.directory.clone(),
            session.user_id.clone(),
            session.spec.clone(),
            session.cancelled.clone(),
        )
    };
    let cleanup_id = id.clone();
    let cleanup_directory = directory.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let binary = ffmpeg(&app)?;
        let mut last_error = "无法在选定尺寸下压缩到5M，请尝试WebP或缩短时长".to_string();
        for attempt in 0..3 {
            let output = run_encoder(&binary, &directory, &spec, attempt, &cancelled)?;
            if cancelled.load(Ordering::Relaxed) {
                return Err("已取消动图制作".into());
            }
            let bytes = fs::read(&output).map_err(|error| error.to_string())?;
            let media = match inspect_animation(&bytes, &spec) {
                Ok(media) => media,
                Err(error) => {
                    last_error = error;
                    continue;
                }
            };
            if cancelled.load(Ordering::Relaxed) {
                return Err("已取消动图制作".into());
            }
            let folder = user_directory(&app, &user_id)?.join(&id);
            fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
            let path = folder.join(format!("result.{}", spec.format));
            let poster = folder.join("poster.jpg");
            fs::write(&path, &bytes).map_err(|error| error.to_string())?;
            image::open(directory.join("0000.png"))
                .map_err(|error| error.to_string())?
                .to_rgb8()
                .save(&poster)
                .map_err(|error| error.to_string())?;
            let result = AnimationResult {
                id: id.clone(),
                style: spec.style.clone(),
                path: path.to_string_lossy().into(),
                poster_path: poster.to_string_lossy().into(),
                created_at: chrono::Utc::now().to_rfc3339(),
                media,
            };
            fs::write(
                folder.join("result.json"),
                serde_json::to_vec(&result).map_err(|error| error.to_string())?,
            )
            .map_err(|error| error.to_string())?;
            return Ok(result);
        }
        Err(format!(
            "导出未通过平台校验：{last_error}。可尝试WebP或缩短时长，尺寸不会自动缩小。"
        ))
    })
    .await
    .map_err(|error| error.to_string())
    .and_then(|result| result);
    if let Ok(mut registry) = sessions().lock() {
        registry.remove(&cleanup_id);
    }
    let _ = fs::remove_dir_all(cleanup_directory);
    result
}

#[tauri::command]
pub async fn cancel_product_animation(id: String) -> Result<(), String> {
    let mut registry = sessions().lock().map_err(|_| "任务锁不可用")?;
    if let Some(session) = registry.get(&id) {
        session.cancelled.store(true, Ordering::Relaxed);
        if !session.encoding {
            let _ = fs::remove_dir_all(&session.directory);
            registry.remove(&id);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn list_product_animations(
    app: AppHandle,
    user_id: String,
) -> Result<Vec<AnimationResult>, String> {
    let directory = user_directory(&app, &user_id)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut results = Vec::new();
    for entry in fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        if uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err() {
            continue;
        }
        if let Ok(bytes) = fs::read(entry.path().join("result.json")) {
            if let Ok(mut result) = serde_json::from_slice::<AnimationResult>(&bytes) {
                let path = entry.path().join(format!("result.{}", result.media.format));
                if !matches!(result.media.format.as_str(), "gif" | "webp") || !path.is_file() {
                    continue;
                }
                result.path = path.to_string_lossy().into();
                result.poster_path = entry.path().join("poster.jpg").to_string_lossy().into();
                results.push(result);
            }
        }
    }
    results.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    results.truncate(50);
    Ok(results)
}

#[tauri::command]
pub async fn save_product_animation(
    app: AppHandle,
    user_id: String,
    id: String,
    destination: String,
) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(&id).map_err(|_| "结果标识无效")?;
    let directory = user_directory(&app, &user_id)?.join(id.to_string());
    tauri::async_runtime::spawn_blocking(move || {
        let result: AnimationResult = serde_json::from_slice(
            &fs::read(directory.join("result.json")).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        let spec = AnimationSpec {
            width: result.media.width,
            height: result.media.height,
            duration_ms: 3000,
            format: result.media.format.clone(),
            style: result.style,
        };
        let bytes = fs::read(directory.join(format!("result.{}", spec.format)))
            .map_err(|error| error.to_string())?;
        inspect_animation(&bytes, &spec)?;
        let path = PathBuf::from(destination);
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            != Some(spec.format)
        {
            return Err("文件扩展名必须与动图格式一致".into());
        }
        fs::write(path, bytes).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_actual_workspace_frames_with_platform_validation() {
        let Some(root) = std::env::var_os("CSGH_TEST_ANIMATION_FRAMES").map(PathBuf::from) else {
            return;
        };
        let binary = PathBuf::from(
            std::env::var_os("CSGH_TEST_FFMPEG").expect("FFmpeg required for rendered frame test"),
        );
        let output = root.parent().unwrap();
        let mut results = Vec::new();
        // steam is generated by the model, so only locally rendered styles are exported here.
        for style in ["smoke", "gilded", "wok", "crush", "signature", "aroma", "sparkle", "flame", "heart", "recommend"] {
            for format in ["gif", "webp"] {
                let spec = AnimationSpec {
                    width: 1024,
                    height: 768,
                    duration_ms: 3000,
                    format: format.into(),
                    style: style.into(),
                };
                let mut delivered = false;
                for attempt in 0..3 {
                    let path = run_encoder(
                        &binary,
                        &root.join(style),
                        &spec,
                        attempt,
                        &AtomicBool::new(false),
                    )
                    .unwrap();
                    let bytes = fs::read(path).unwrap();
                    if let Ok(media) = inspect_animation(&bytes, &spec) {
                        fs::write(output.join(format!("{style}.{format}")), &bytes).unwrap();
                        results.push(
                            serde_json::json!({"style": style,"attempt":attempt,"media":media}),
                        );
                        delivered = true;
                        break;
                    }
                }
                assert!(
                    delivered,
                    "{style}.{format} cannot satisfy platform requirements"
                );
            }
        }
        fs::write(
            output.join("实际导出验证.json"),
            serde_json::to_vec_pretty(&results).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn real_encoder_outputs_valid_gif_and_webp_and_obeys_cancellation() {
        let Some(binary) = std::env::var_os("CSGH_TEST_FFMPEG").map(PathBuf::from) else {
            return;
        };
        let folder =
            std::env::temp_dir().join(format!("csgh-animation-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&folder).unwrap();
        let mut image = image::RgbImage::from_pixel(768, 576, image::Rgb([35, 20, 13]));
        for frame_index in 0..40 {
            for horizontal in 100..300 {
                for vertical in 200..350 {
                    image.put_pixel(
                        horizontal,
                        vertical,
                        image::Rgb([frame_index * 5 + 30, 160, 30]),
                    );
                }
            }
            image
                .save(folder.join(format!("{frame_index:04}.png")))
                .unwrap();
        }
        let cancelled = AtomicBool::new(false);
        for format in ["gif", "webp"] {
            let spec = AnimationSpec {
                width: 768,
                height: 576,
                duration_ms: 2000,
                format: format.into(),
                style: "steam".into(),
            };
            for attempt in 0..3 {
                let path = run_encoder(&binary, &folder, &spec, attempt, &cancelled).unwrap();
                let bytes = fs::read(path).unwrap();
                let media = inspect_animation(&bytes, &spec).unwrap();
                assert!((2000..=2050).contains(&media.duration_ms));
                assert!(media.frames >= 2);
            }
            cancelled.store(true, Ordering::Relaxed);
            assert!(run_encoder(&binary, &folder, &spec, 0, &cancelled).is_err());
            cancelled.store(false, Ordering::Relaxed);
        }
        fs::remove_dir_all(folder).unwrap();
    }
}
