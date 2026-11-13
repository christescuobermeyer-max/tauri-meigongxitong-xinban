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
    /// Video name or source image name, shown in records and the showcase.
    #[serde(default)]
    pub title: Option<String>,
    /// Set once the gateway has stored this animation in OSS.
    #[serde(default)]
    pub uploaded_at: Option<String>,
    /// Per-account running number of video animations, used for file names (视频动图_001).
    #[serde(default)]
    pub sequence: Option<u32>,
}

/// Next video animation number for this account. The counter file is not a UUID directory,
/// so clearing animations keeps it and numbers never repeat into a folder of earlier saves.
fn next_video_sequence(user_root: &Path) -> Result<u32, String> {
    fs::create_dir_all(user_root).map_err(|error| error.to_string())?;
    let file = user_root.join("video-sequence.txt");
    let last = fs::read_to_string(&file).ok().and_then(|text| text.trim().parse::<u32>().ok()).unwrap_or(0);
    let next = last.checked_add(1).ok_or("视频动图编号已用尽")?;
    fs::write(&file, next.to_string()).map_err(|_| "无法保存视频动图编号")?;
    Ok(next)
}

/// `name.ext`, or `name (2).ext`, `name (3).ext`… when the file already exists.
fn unused_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let extension = path.extension().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    (2..10_000)
        .map(|n| path.with_file_name(format!("{stem} ({n}).{extension}")))
        .find(|candidate| !candidate.exists())
        .unwrap_or(path)
}

fn clean_title(title: Option<String>) -> Option<String> {
    let title: String = title?.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(60).collect();
    (!title.is_empty()).then_some(title)
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
        let result = AnimationResult { id, style: "steam".into(), path: path.to_string_lossy().into(), poster_path: poster.to_string_lossy().into(), created_at: chrono::Utc::now().to_rfc3339(), media, title: None, uploaded_at: None, sequence: None };
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

/// One compression attempt: frame rate, GIF palette size, WebP quality, and optional denoise.
struct EncoderTier {
    rate: u32,
    colors: u32,
    quality: u32,
    denoise: bool,
}
const IMAGE_TIERS: [EncoderTier; 3] = [
    EncoderTier { rate: 20, colors: 256, quality: 82, denoise: false },
    EncoderTier { rate: 15, colors: 128, quality: 65, denoise: false },
    EncoderTier { rate: 10, colors: 64, quality: 45, denoise: false },
];
// Real footage changes every pixel when the camera moves, so video needs a deeper ladder to fit 5MB.
// Rates divide 100 evenly in GIF centiseconds (or round back to the exact total), keeping 2–5 s exact.
const VIDEO_TIERS: [EncoderTier; 4] = [
    EncoderTier { rate: 20, colors: 256, quality: 75, denoise: false },
    EncoderTier { rate: 15, colors: 128, quality: 60, denoise: false },
    EncoderTier { rate: 10, colors: 64, quality: 50, denoise: true },
    EncoderTier { rate: 6, colors: 32, quality: 40, denoise: true },
];
fn encoder_tiers(spec: &AnimationSpec) -> &'static [EncoderTier] {
    if spec.style == VIDEO_STYLE { &VIDEO_TIERS } else { &IMAGE_TIERS }
}

fn hide_window(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = command;
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
    let tier = encoder_tiers(spec).get(attempt).ok_or("压缩档位无效")?;
    let rate = tier.rate;
    let denoise = if tier.denoise { "hqdn3d=4:3:6:4," } else { "" };
    if spec.format == "gif" {
        let colors = tier.colors;
        let bayer = if tier.denoise { 5 } else { 3 };
        command.args(["-filter_complex", &format!("{denoise}fps={rate},split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale={bayer}:diff_mode=rectangle"), "-loop", "0"]);
    } else {
        command.args([
            "-vf",
            &format!("{denoise}fps={rate}"),
            "-c:v",
            "libwebp_anim",
            "-lossless",
            "0",
            "-quality",
            &tier.quality.to_string(),
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
    title: Option<String>,
) -> Result<AnimationResult, String> {
    let title = clean_title(title);
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
        for attempt in 0..encoder_tiers(&spec).len() {
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
            let user_root = user_directory(&app, &user_id)?;
            let sequence = if spec.style == VIDEO_STYLE { Some(next_video_sequence(&user_root)?) } else { None };
            let folder = user_root.join(&id);
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
                title: title.clone(),
                uploaded_at: None,
                sequence,
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

/// Video files the user may pick; anything else is refused before FFmpeg sees it.
const VIDEO_EXTENSIONS: [&str; 6] = ["mp4", "mov", "m4v", "mkv", "webm", "avi"];

fn checked_video_path(input: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(input);
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .unwrap_or_default();
    if !path.is_absolute() || !path.is_file() || !VIDEO_EXTENSIONS.contains(&extension.as_str()) {
        return Err("请选择本机的 MP4 / MOV / MKV / WebM / AVI 视频文件".into());
    }
    Ok(path)
}

/// Lets the preview <video> read the picked file through the asset protocol.
#[tauri::command]
pub async fn allow_animation_video(app: AppHandle, path: String) -> Result<String, String> {
    let checked = checked_video_path(&path)?;
    app.asset_protocol_scope()
        .allow_file(&checked)
        .map_err(|error| format!("授权视频预览失败：{error}"))?;
    Ok(path)
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoClip {
    pub input_path: String,
    pub start_ms: u32,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Makes sure frames 0..expected exist. A clip that ends a few frames early (rounding at the
/// end of the file) repeats its last frame; a clip that is mostly missing is an error.
fn complete_frame_sequence(directory: &Path, expected: u32) -> Result<u32, String> {
    let frame = |index: u32| directory.join(format!("{index:04}.png"));
    let found = (0..expected).take_while(|index| frame(*index).is_file()).count() as u32;
    if found == 0 {
        return Err("没有从所选片段读到画面，请换一个起点或换一个视频".into());
    }
    if found * 10 < expected * 9 {
        return Err("所选片段超出了视频结尾，请把片段往前移".into());
    }
    for index in found..expected {
        fs::copy(frame(found - 1), frame(index)).map_err(|error| error.to_string())?;
    }
    Ok(expected)
}

fn extract_video_frames(
    binary: &Path,
    directory: &Path,
    spec: &AnimationSpec,
    clip: &VideoClip,
    cancelled: &AtomicBool,
) -> Result<u32, String> {
    let input = checked_video_path(&clip.input_path)?;
    if clip.width < 64 || clip.height < 64 {
        return Err("取景框太小，请放大后再生成".into());
    }
    // The crop must already have the output ratio (within 2%), otherwise the dish would be stretched.
    let (wide, tall) = (clip.width as u64 * spec.height as u64, clip.height as u64 * spec.width as u64);
    if wide.abs_diff(tall) * 50 > tall {
        return Err("取景框比例与输出比例不一致".into());
    }
    let expected = spec.frame_count();
    let mut command = Command::new(binary);
    command.current_dir(directory).args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        &format!("{:.3}", clip.start_ms as f64 / 1000.0),
        "-i",
    ]);
    command.arg(&input).args([
        "-an",
        "-sn",
        "-dn",
        "-frames:v",
        &expected.to_string(),
        "-vf",
        &format!(
            "fps=20,crop={}:{}:{}:{},scale={}:{}:flags=lanczos,setsar=1,format=rgb24",
            clip.width, clip.height, clip.x, clip.y, spec.width, spec.height
        ),
        "-start_number",
        "0",
        "%04d.png",
    ]);
    let log = fs::File::create(directory.join("extract.log")).map_err(|error| error.to_string())?;
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(log);
    hide_window(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "无法启动FFmpeg，请使用包含媒体工具的桌面安装包")?;
    let started = Instant::now();
    loop {
        if cancelled.load(Ordering::Relaxed) || started.elapsed() > Duration::from_secs(180) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("视频截取已取消或超时".into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => {
                let detail = fs::read_to_string(directory.join("extract.log")).unwrap_or_default();
                let tail: String = detail.trim().chars().rev().take(200).collect::<Vec<_>>().into_iter().rev().collect();
                return Err(format!("读取视频画面失败：{tail}"));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
    }
    let _ = fs::remove_file(directory.join("extract.log"));
    let count = complete_frame_sequence(directory, expected)?;
    let dimensions = image::image_dimensions(directory.join("0000.png")).map_err(|_| "视频画面损坏")?;
    if dimensions != (spec.width, spec.height) {
        return Err("视频画面尺寸与输出不一致".into());
    }
    Ok(count)
}

/// Fills a "video" session with frames cut from the picked clip; finish_product_animation encodes them.
#[tauri::command]
pub async fn extract_product_animation_video(
    app: AppHandle,
    id: String,
    clip: VideoClip,
) -> Result<(), String> {
    let (directory, spec, cancelled) = {
        let mut registry = sessions().lock().map_err(|_| "任务锁不可用")?;
        let session = registry.get_mut(&id).ok_or("动图任务不存在")?;
        if session.spec.style != VIDEO_STYLE || session.encoding || session.received != 0 {
            return Err("视频动图任务状态无效".into());
        }
        // Reuses the encoding flag so cancel only signals while FFmpeg runs.
        session.encoding = true;
        (session.directory.clone(), session.spec.clone(), session.cancelled.clone())
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        let binary = ffmpeg(&app)?;
        extract_video_frames(&binary, &directory, &spec, &clip, &cancelled)
    })
    .await
    .map_err(|error| error.to_string())
    .and_then(|result| result);
    let mut registry = sessions().lock().map_err(|_| "任务锁不可用")?;
    if let Some(session) = registry.get_mut(&id) {
        session.encoding = false;
        let stopped = session.cancelled.load(Ordering::Relaxed);
        match (&result, stopped) {
            (Ok(count), false) => session.received = *count,
            _ => {
                let _ = fs::remove_dir_all(&session.directory);
                registry.remove(&id);
            }
        }
    }
    match result {
        Ok(_) if registry.contains_key(&id) => Ok(()),
        Ok(_) => Err("已取消视频动图制作".into()),
        Err(error) => Err(error),
    }
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

fn saved_result(app: &AppHandle, user_id: &str, id: &str) -> Result<(PathBuf, AnimationResult), String> {
    let id = uuid::Uuid::parse_str(id).map_err(|_| "结果标识无效")?;
    let directory = user_directory(app, user_id)?.join(id.to_string());
    let result: AnimationResult = serde_json::from_slice(&fs::read(directory.join("result.json")).map_err(|_| "本机找不到这个动图")?)
        .map_err(|_| "动图记录损坏")?;
    if !matches!(result.media.format.as_str(), "gif" | "webp") {
        return Err("动图格式无效".into());
    }
    Ok((directory, result))
}

#[derive(Serialize)]
pub struct AnimationUploadPayload {
    data: String,
    poster: String,
}

/// Base64 animation and first-frame poster for the gateway upload.
#[tauri::command]
pub async fn read_animation_upload(app: AppHandle, user_id: String, id: String) -> Result<AnimationUploadPayload, String> {
    let (directory, result) = saved_result(&app, &user_id, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(directory.join(format!("result.{}", result.media.format))).map_err(|_| "本机动图文件缺失")?;
        if bytes.len() > MAX_BYTES {
            return Err("动图超过5M，不能上传".into());
        }
        let poster = fs::read(directory.join("poster.jpg")).map_err(|_| "本机动图封面缺失")?;
        Ok(AnimationUploadPayload { data: STANDARD.encode(bytes), poster: STANDARD.encode(poster) })
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Records that the gateway accepted this animation, so records show it as uploaded after restarts.
#[tauri::command]
pub async fn mark_animation_uploaded(app: AppHandle, user_id: String, id: String) -> Result<AnimationResult, String> {
    let (directory, mut result) = saved_result(&app, &user_id, &id)?;
    result.uploaded_at.get_or_insert_with(|| chrono::Utc::now().to_rfc3339());
    fs::write(directory.join("result.json"), serde_json::to_vec(&result).map_err(|error| error.to_string())?)
        .map_err(|_| "无法保存上传状态")?;
    result.path = directory.join(format!("result.{}", result.media.format)).to_string_lossy().into();
    result.poster_path = directory.join("poster.jpg").to_string_lossy().into();
    Ok(result)
}

#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationCleanup {
    pub removed: u32,
    pub bytes: u64,
}

fn directory_size(path: &Path) -> u64 {
    fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| match entry.file_type() {
                    Ok(kind) if kind.is_dir() => directory_size(&entry.path()),
                    Ok(_) => entry.metadata().map(|meta| meta.len()).unwrap_or(0),
                    Err(_) => 0,
                })
                .sum()
        })
        .unwrap_or(0)
}

/// Removes only UUID-named subdirectories, which this module creates; anything else is left alone.
fn remove_animation_directories(root: &Path) -> Result<AnimationCleanup, String> {
    let mut cleanup = AnimationCleanup::default();
    let Ok(entries) = fs::read_dir(root) else {
        return Ok(cleanup);
    };
    for entry in entries.flatten() {
        let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
        if !is_dir || uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err() {
            continue;
        }
        let bytes = directory_size(&entry.path());
        fs::remove_dir_all(entry.path()).map_err(|error| format!("清理动图失败：{error}"))?;
        cleanup.removed += 1;
        cleanup.bytes += bytes;
    }
    Ok(cleanup)
}

/// Deletes every animation stored for this account plus leftover frame caches.
#[tauri::command]
pub async fn clear_product_animations(app: AppHandle, user_id: String) -> Result<AnimationCleanup, String> {
    let directory = user_directory(&app, &user_id)?;
    let frames = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("product-animation-frames");
    tauri::async_runtime::spawn_blocking(move || {
        // Hold the session lock so no new render can start while files are removed.
        let registry = sessions().lock().map_err(|_| "任务锁不可用")?;
        if !registry.is_empty() {
            return Err("有动图正在生成，请等待完成或取消后再清空".into());
        }
        let mut cleanup = remove_animation_directories(&directory)?;
        let cache = remove_animation_directories(&frames)?;
        cleanup.bytes += cache.bytes;
        drop(registry);
        Ok(cleanup)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_product_animation(
    app: AppHandle,
    user_id: String,
    id: String,
    destination: String,
    keep_existing: Option<bool>,
) -> Result<String, String> {
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
        // Saving many into one folder must never overwrite earlier files; the single
        // "save as" dialog already asks the user before replacing.
        let path = if keep_existing == Some(true) { unused_path(path) } else { path };
        fs::write(&path, bytes).map_err(|error| error.to_string())?;
        Ok(path.to_string_lossy().into_owned())
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
        for style in ["gilded", "wok", "crush", "signature", "sparkle", "heart", "burst", "swing", "blaze", "beat", "stamp", "flip"] {
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
    fn clearing_removes_only_animation_directories() {
        let root = std::env::temp_dir().join(format!("csgh-animation-clear-{}", uuid::Uuid::new_v4()));
        let first = root.join(uuid::Uuid::new_v4().to_string());
        let second = root.join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(first.join("nested")).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("result.gif"), vec![0u8; 1000]).unwrap();
        fs::write(first.join("nested/poster.jpg"), vec![0u8; 24]).unwrap();
        fs::write(second.join("result.webp"), vec![0u8; 500]).unwrap();
        fs::create_dir_all(root.join("keep-me")).unwrap();
        fs::write(root.join("notes.txt"), b"keep").unwrap();
        let cleanup = remove_animation_directories(&root).unwrap();
        assert_eq!(cleanup, AnimationCleanup { removed: 2, bytes: 1524 });
        assert!(!first.exists() && !second.exists());
        assert!(root.join("keep-me").exists() && root.join("notes.txt").exists());
        assert_eq!(remove_animation_directories(&root.join("missing")).unwrap(), AnimationCleanup::default());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn video_numbers_continue_and_folder_saves_never_overwrite() {
        let root = std::env::temp_dir().join(format!("csgh-animation-names-{}", uuid::Uuid::new_v4()));
        assert_eq!(next_video_sequence(&root).unwrap(), 1);
        assert_eq!(next_video_sequence(&root).unwrap(), 2);
        // Clearing removes only UUID directories, so numbering carries on.
        fs::create_dir_all(root.join(uuid::Uuid::new_v4().to_string())).unwrap();
        remove_animation_directories(&root).unwrap();
        assert_eq!(next_video_sequence(&root).unwrap(), 3);
        let target = root.join("招牌牛肉面.gif");
        assert_eq!(unused_path(target.clone()), target);
        fs::write(&target, b"1").unwrap();
        assert_eq!(unused_path(target.clone()), root.join("招牌牛肉面 (2).gif"));
        fs::write(root.join("招牌牛肉面 (2).gif"), b"2").unwrap();
        assert_eq!(unused_path(target), root.join("招牌牛肉面 (3).gif"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn titles_are_cleaned_and_old_records_still_load() {
        assert_eq!(clean_title(Some("  抖音 · 招牌牛肉面\n".into())).as_deref(), Some("抖音 · 招牌牛肉面"));
        assert_eq!(clean_title(Some("   ".into())), None);
        assert_eq!(clean_title(Some("菜".repeat(80))).unwrap().chars().count(), 60);
        // result.json written before titles and upload state existed.
        let old = r#"{"id":"a","style":"burst","path":"p","posterPath":"q","createdAt":"t","media":{"width":768,"height":576,"durationMs":3000,"frames":60,"bytes":1,"format":"gif"}}"#;
        let parsed: AnimationResult = serde_json::from_str(old).unwrap();
        assert_eq!((parsed.title, parsed.uploaded_at, parsed.sequence), (None, None, None));
    }

    #[test]
    fn frame_sequence_pads_a_short_tail_and_rejects_missing_clips() {
        let folder = std::env::temp_dir().join(format!("csgh-video-frames-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&folder).unwrap();
        assert!(complete_frame_sequence(&folder, 60).unwrap_err().contains("没有"));
        for index in 0..30 {
            fs::write(folder.join(format!("{index:04}.png")), [index as u8]).unwrap();
        }
        assert!(complete_frame_sequence(&folder, 60).unwrap_err().contains("结尾"));
        for index in 30..57 {
            fs::write(folder.join(format!("{index:04}.png")), [index as u8]).unwrap();
        }
        assert_eq!(complete_frame_sequence(&folder, 60).unwrap(), 60);
        assert_eq!(fs::read(folder.join("0059.png")).unwrap(), [56u8]);
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn video_paths_must_be_local_video_files() {
        assert!(checked_video_path("relative.mp4").is_err());
        assert!(checked_video_path("-i.mp4").is_err());
        let folder = std::env::temp_dir().join(format!("csgh-video-path-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("clip.MOV"), b"x").unwrap();
        fs::write(folder.join("notes.txt"), b"x").unwrap();
        assert!(checked_video_path(folder.join("clip.MOV").to_str().unwrap()).is_ok());
        assert!(checked_video_path(folder.join("notes.txt").to_str().unwrap()).is_err());
        assert!(checked_video_path(folder.join("missing.mp4").to_str().unwrap()).is_err());
        fs::remove_dir_all(folder).unwrap();
    }

    /// Cuts a moving, grainy 1080p clip and checks the video ladder still fits the platform limits.
    #[test]
    fn real_video_clip_is_cut_and_compressed_within_limits() {
        let Some(binary) = std::env::var_os("CSGH_TEST_FFMPEG").map(PathBuf::from) else {
            return;
        };
        let root = std::env::temp_dir().join(format!("csgh-video-clip-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let source = root.join("source.mp4");
        let status = Command::new(&binary)
            .args(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                "testsrc2=size=1920x1080:rate=30:duration=7,noise=alls=4:allf=t", "-pix_fmt", "yuv420p"])
            .arg(&source)
            .status()
            .unwrap();
        assert!(status.success());
        let cancelled = AtomicBool::new(false);
        for (format, ratio) in [("gif", (768, 576, 1440, 1080)), ("webp", (768, 432, 1920, 1080))] {
            let frames = root.join(format!("frames-{format}"));
            fs::create_dir(&frames).unwrap();
            let spec = AnimationSpec { width: ratio.0, height: ratio.1, duration_ms: 5000, format: format.into(), style: VIDEO_STYLE.into() };
            let clip = VideoClip { input_path: source.to_string_lossy().into(), start_ms: 1500, x: 1920 - ratio.2, y: 0, width: ratio.2, height: ratio.3 };
            assert_eq!(extract_video_frames(&binary, &frames, &spec, &clip, &cancelled).unwrap(), 100);
            let delivered = (0..encoder_tiers(&spec).len()).find_map(|attempt| {
                let path = run_encoder(&binary, &frames, &spec, attempt, &cancelled).unwrap();
                inspect_animation(&fs::read(path).unwrap(), &spec).ok()
            });
            let media = delivered.unwrap_or_else(|| panic!("{format} video clip cannot fit 5MB"));
            assert_eq!(media.duration_ms, 5000);
            // A clip starting too close to the end is refused instead of padding most of it.
            let late = root.join(format!("late-{format}"));
            fs::create_dir(&late).unwrap();
            let tail = VideoClip { start_ms: 6000, ..clip.clone() };
            assert!(extract_video_frames(&binary, &late, &spec, &tail, &cancelled).unwrap_err().contains("结尾"));
            // A crop that does not match the output ratio would stretch the dish.
            let skewed = VideoClip { width: 1000, ..clip };
            assert!(extract_video_frames(&binary, &late, &spec, &skewed, &cancelled).unwrap_err().contains("比例"));
        }
        fs::remove_dir_all(root).unwrap();
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
