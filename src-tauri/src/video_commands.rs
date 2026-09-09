use crate::xiaohongshu_cookie_support::{
    cleanup_temp_cookie_file, prepare_cookie_args, prepare_named_cookie_args,
};
use crate::xiaohongshu_guard::explain_parse_failure;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const DOUYIN_COOKIE_FILE_NAME: &str = "抖音cookie.txt";
const DOUYIN_BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

#[cfg(target_os = "windows")]
fn hide_child_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_child_window(_command: &mut Command) {}

fn resolve_external_binary_path(
    app: &AppHandle,
    binary_name: &str,
    fallback_name: &str,
) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    let mut candidates = vec![
        resource_dir.join(binary_name),
        resource_dir.join("binaries").join(binary_name),
    ];

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(binary_name));
            candidates.push(exe_dir.join("binaries").join(binary_name));
        }
    }

    for candidate in candidates {
        if candidate.exists() {
            println!(
                "✅ [resolve_external_binary_path] 命中二进制: {:?}",
                candidate
            );
            return Ok(candidate);
        }
    }

    println!(
        "⚠️ [resolve_external_binary_path] 未找到打包二进制，回退系统命令: {}",
        fallback_name
    );
    Ok(PathBuf::from(fallback_name))
}

// 获取打包的 FFmpeg 可执行文件路径
fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let ffmpeg_name = "ffmpeg-x86_64-pc-windows-msvc.exe";
    #[cfg(not(target_os = "windows"))]
    let ffmpeg_name = "ffmpeg-x86_64-unknown-linux-gnu";

    resolve_external_binary_path(app, ffmpeg_name, "ffmpeg")
}

// 获取打包的 yt-dlp 可执行文件路径
fn get_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let ytdlp_name = "yt-dlp-x86_64-pc-windows-msvc.exe";
    #[cfg(not(target_os = "windows"))]
    let ytdlp_name = "yt-dlp-x86_64-unknown-linux-gnu";

    resolve_external_binary_path(app, ytdlp_name, "yt-dlp")
}

// 视频路径配置
#[derive(Debug, Serialize, Deserialize, Default)]
struct VideoPathConfig {
    cache_path: Option<String>,
    export_path: Option<String>,
}

// 获取配置文件路径
fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取配置目录: {}", e))?;
    std::fs::create_dir_all(&config_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    Ok(config_dir.join("video_cache_config.json"))
}

// 读取缓存路径配置
fn read_path_config(app: &AppHandle) -> VideoPathConfig {
    let Ok(config_path) = get_config_path(app) else {
        return VideoPathConfig::default();
    };
    let Ok(content) = std::fs::read_to_string(&config_path) else {
        return VideoPathConfig::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_path_config(app: &AppHandle, config: &VideoPathConfig) -> Result<(), String> {
    let config_path = get_config_path(app)?;
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))?;
    Ok(())
}

// 读取缓存路径配置
fn read_cache_config(app: &AppHandle) -> Option<String> {
    read_path_config(app).cache_path
}

// 保存缓存路径配置
fn save_cache_config(app: &AppHandle, path: &str) -> Result<(), String> {
    let mut config = read_path_config(app);
    config.cache_path = Some(path.to_string());
    write_path_config(app, &config)?;
    println!("✅ [save_cache_config] 已保存缓存路径: {}", path);
    Ok(())
}

fn read_export_config(app: &AppHandle) -> Option<String> {
    read_path_config(app).export_path
}

fn save_export_config(app: &AppHandle, path: &str) -> Result<(), String> {
    let mut config = read_path_config(app);
    config.export_path = Some(path.to_string());
    write_path_config(app, &config)?;
    println!("✅ [save_export_config] 已保存导出路径: {}", path);
    Ok(())
}

fn resolve_export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(saved_path) = read_export_config(app) {
        let export_dir = PathBuf::from(saved_path);
        std::fs::create_dir_all(&export_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;
        return Ok(export_dir);
    }

    use tauri_plugin_dialog::DialogExt;

    let selected = app
        .dialog()
        .file()
        .set_title("选择视频导出保存位置")
        .blocking_pick_folder();

    let selected_path = selected
        .ok_or_else(|| "请选择视频导出保存位置后再导出视频".to_string())?
        .to_string();
    let export_dir = PathBuf::from(&selected_path);
    std::fs::create_dir_all(&export_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;
    save_export_config(app, &selected_path)?;
    Ok(export_dir)
}

#[tauri::command]
pub async fn get_video_export_path(app: AppHandle) -> Result<Option<String>, String> {
    Ok(read_export_config(&app))
}

// 视频文件信息结构体
#[derive(Debug, Serialize, Clone)]
pub struct VideoFileInfo {
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub created_at: String,
}

fn is_exported_video_file_name(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    lower.ends_with(".mp4")
        && !lower.starts_with("preview_")
        && !lower.starts_with("local_preview_")
}

fn system_time_sort_key(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

// 列出导出文件夹中的视频
#[tauri::command]
pub async fn list_exported_videos(
    export_path: String,
    _app: AppHandle,
) -> Result<Vec<VideoFileInfo>, String> {
    println!(
        "📁 [list_exported_videos] 列出导出文件夹中的视频: {}",
        export_path
    );

    let folder_path = std::path::PathBuf::from(&export_path);

    // 检查文件夹是否存在
    if !folder_path.exists() {
        return Err(format!("文件夹不存在: {}", export_path));
    }

    let mut videos = Vec::new();

    // 读取文件夹中的所有mp4文件
    let entries = std::fs::read_dir(&folder_path).map_err(|e| format!("读取文件夹失败: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();

            let file_name = entry
                .file_name()
                .into_string()
                .unwrap_or_else(|_| String::from("未命名"));

            // 只展示裁剪导出结果。下载/预览缓存视频会以 preview_ / local_preview_ 命名，
            // 当用户把缓存目录和导出目录选成同一个文件夹时不应出现在导出列表里。
            if !is_exported_video_file_name(&file_name) {
                continue;
            }

            let metadata = std::fs::metadata(&path).ok();
            let file_size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .unwrap_or(UNIX_EPOCH);

            // Windows 上创建时间和拷贝行为差异较大，列表按修改时间排序更符合“最新导出”。
            let datetime: chrono::DateTime<chrono::Local> = modified.into();
            let created_at = datetime.format("%Y-%m-%d %H:%M").to_string();

            videos.push((
                system_time_sort_key(modified),
                VideoFileInfo {
                    file_name,
                    file_path: path.to_string_lossy().to_string(),
                    file_size,
                    created_at,
                },
            ));
        }
    }

    videos.sort_by(|left, right| right.0.cmp(&left.0));
    let videos = videos
        .into_iter()
        .map(|(_, video)| video)
        .collect::<Vec<_>>();

    println!("✅ [list_exported_videos] 找到 {} 个视频", videos.len());
    Ok(videos)
}

// 打开导出文件夹
#[tauri::command]
pub async fn open_export_folder(export_path: String, _app: AppHandle) -> Result<(), String> {
    println!("📂 [open_export_folder] 打开文件夹: {}", export_path);

    let folder_path = std::path::PathBuf::from(&export_path);

    if !folder_path.exists() {
        return Err(format!("文件夹不存在: {}", export_path));
    }

    if cfg!(target_os = "windows") {
        Command::new("explorer")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    } else if cfg!(target_os = "macos") {
        Command::new("open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    } else {
        Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    println!("✅ [open_export_folder] 已打开文件夹");
    Ok(())
}

// 删除导出的视频
#[tauri::command]
pub async fn delete_exported_video(file_path: String, _app: AppHandle) -> Result<(), String> {
    println!("🗑️ [delete_exported_video] 删除视频: {}", file_path);

    let path = std::path::PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    std::fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))?;

    println!("✅ [delete_exported_video] 已删除视频");
    Ok(())
}

// 视频信息结构
#[derive(Debug, Serialize, Clone)]
pub struct VideoInfo {
    #[serde(rename = "videoUrl")]
    pub video_url: String,
    pub title: String,
    pub author: String,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
}

// 裁剪参数
#[derive(Debug, Deserialize)]
pub struct CropParams {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(rename = "startTime")]
    pub start_time: f64,
    #[serde(rename = "endTime")]
    pub end_time: f64,
}

#[derive(Clone, Copy)]
struct VideoExportSpec {
    label: &'static str,
    width: i32,
    height: i32,
    min_duration_seconds: Option<f64>,
    max_duration_seconds: Option<f64>,
    max_file_size_bytes: Option<u64>,
    max_video_bitrate: Option<&'static str>,
    buffer_size: Option<&'static str>,
}

fn resolve_export_spec(export_target: &str) -> Result<VideoExportSpec, String> {
    match export_target {
        "meituan" => Ok(VideoExportSpec {
            label: "美团视频店招",
            width: 692,
            height: 390,
            min_duration_seconds: None,
            max_duration_seconds: None,
            max_file_size_bytes: None,
            max_video_bitrate: None,
            buffer_size: None,
        }),
        "taobaoFlash" => Ok(VideoExportSpec {
            label: "淘宝闪购视频店招",
            width: 1280,
            height: 720,
            min_duration_seconds: Some(5.0),
            max_duration_seconds: Some(90.0),
            max_file_size_bytes: Some(200 * 1024 * 1024),
            max_video_bitrate: Some("8000k"),
            buffer_size: Some("16000k"),
        }),
        other => Err(format!("不支持的导出规格: {}", other)),
    }
}

fn validate_export_duration(crop: &CropParams, spec: VideoExportSpec) -> Result<f64, String> {
    let duration = crop.end_time - crop.start_time;
    if duration <= 0.0 {
        return Err("时间范围无效：结束时间必须大于开始时间".to_string());
    }
    if let Some(min_duration) = spec.min_duration_seconds {
        if duration < min_duration {
            return Err(format!(
                "{}时长不能少于{}秒",
                spec.label, min_duration as i32
            ));
        }
    }
    if let Some(max_duration) = spec.max_duration_seconds {
        if duration > max_duration {
            return Err(format!(
                "{}时长不能超过{}秒",
                spec.label, max_duration as i32
            ));
        }
    }
    Ok(duration)
}

fn ensure_mp4_file_name(file_name: &str) -> String {
    let trimmed = file_name.trim();
    let base = if trimmed.is_empty() {
        "店招视频"
    } else {
        trimmed
    };
    let safe_name = base
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>();
    if safe_name.to_ascii_lowercase().ends_with(".mp4") {
        safe_name
    } else {
        format!("{}.mp4", safe_name)
    }
}

fn make_even_dimension(value: i32) -> i32 {
    let even = if value % 2 == 0 { value } else { value - 1 };
    even.max(2)
}

fn normalize_crop_for_video(
    crop: &CropParams,
    video_width: i32,
    video_height: i32,
) -> Result<CropParams, String> {
    if video_width < 2 || video_height < 2 {
        return Err(format!(
            "视频尺寸过小，无法裁剪：{}x{}",
            video_width, video_height
        ));
    }

    let max_x = (video_width - 2).max(0);
    let max_y = (video_height - 2).max(0);
    let mut x = crop.x.clamp(0, max_x);
    let mut y = crop.y.clamp(0, max_y);
    if x % 2 != 0 {
        x -= 1;
    }
    if y % 2 != 0 {
        y -= 1;
    }

    let max_width = make_even_dimension(video_width - x);
    let max_height = make_even_dimension(video_height - y);
    let raw_width = if crop.width <= 0 {
        max_width
    } else {
        crop.width.min(max_width)
    };
    let raw_height = if crop.height <= 0 {
        max_height
    } else {
        crop.height.min(max_height)
    };
    let width = make_even_dimension(raw_width).min(max_width);
    let height = make_even_dimension(raw_height).min(max_height);

    if width < 2 || height < 2 || x + width > video_width || y + height > video_height {
        return Err(format!(
            "裁剪区域超出视频范围：视频 {}x{}，裁剪 x={} y={} w={} h={}",
            video_width, video_height, x, y, width, height
        ));
    }

    Ok(CropParams {
        x,
        y,
        width,
        height,
        start_time: crop.start_time,
        end_time: crop.end_time,
    })
}

fn parse_video_dimensions(ffmpeg_output: &str) -> Option<(i32, i32)> {
    let re = regex::Regex::new(r"(?:,|\s)([1-9]\d{1,4})x([1-9]\d{1,4})(?:\s|\[|,)").ok()?;
    for line in ffmpeg_output.lines() {
        if !line.contains("Video:") {
            continue;
        }
        let Some(caps) = re.captures(line) else {
            continue;
        };
        let width = caps.get(1)?.as_str().parse::<i32>().ok()?;
        let height = caps.get(2)?.as_str().parse::<i32>().ok()?;
        return Some((width, height));
    }
    None
}

fn read_video_dimensions(ffmpeg_path: &PathBuf, input_path: &str) -> Result<(i32, i32), String> {
    let mut command = Command::new(ffmpeg_path);
    command.args(["-hide_banner", "-i", input_path]);
    hide_child_window(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("读取视频尺寸失败: {}", e))?;
    let mut combined = String::from_utf8_lossy(&output.stderr).to_string();
    combined.push_str(&String::from_utf8_lossy(&output.stdout));
    parse_video_dimensions(&combined).ok_or_else(|| "无法读取视频尺寸".to_string())
}

fn run_ffmpeg_export(
    ffmpeg_path: &PathBuf,
    input_path: &str,
    save_path: &PathBuf,
    crop: &CropParams,
    spec: VideoExportSpec,
    include_audio: bool,
) -> Result<(), String> {
    let (video_width, video_height) = read_video_dimensions(ffmpeg_path, input_path)?;
    let crop = normalize_crop_for_video(crop, video_width, video_height)?;
    let duration = validate_export_duration(&crop, spec)?;
    let args =
        build_ffmpeg_export_args(input_path, save_path, &crop, spec, duration, include_audio);

    let mut command = Command::new(ffmpeg_path);
    command.args(&args);
    hide_child_window(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("FFmpeg启动失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg处理失败: {}", stderr));
    }

    if let Some(max_file_size) = spec.max_file_size_bytes {
        let file_size = std::fs::metadata(save_path)
            .map_err(|e| format!("读取导出文件大小失败: {}", e))?
            .len();
        if file_size > max_file_size {
            let _ = std::fs::remove_file(save_path);
            return Err(format!(
                "{}导出文件超过200M，请缩短时长或缩小裁剪内容后重试",
                spec.label
            ));
        }
    }

    Ok(())
}

fn build_ffmpeg_export_args(
    input_path: &str,
    save_path: &PathBuf,
    crop: &CropParams,
    spec: VideoExportSpec,
    duration: f64,
    include_audio: bool,
) -> Vec<String> {
    let video_filter = format!(
        "crop={}:{}:{}:{},scale={}:{}",
        crop.width, crop.height, crop.x, crop.y, spec.width, spec.height
    );

    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        crop.start_time.to_string(),
        "-i".to_string(),
        input_path.to_string(),
        "-t".to_string(),
        duration.to_string(),
        "-map".to_string(),
        "0:v:0".to_string(),
        "-vf".to_string(),
        video_filter,
    ];

    if include_audio {
        // 可选映射音轨：没有声音的源视频也应能正常导出。
        args.extend([
            "-map".to_string(),
            "0:a:0?".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "128k".to_string(),
        ]);
    } else {
        args.push("-an".to_string());
    }

    args.extend([
        "-c:v".to_string(),
        "libx264".to_string(),
        "-preset".to_string(),
        "fast".to_string(),
        "-crf".to_string(),
        "23".to_string(),
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-f".to_string(),
        "mp4".to_string(),
    ]);

    if let Some(maxrate) = spec.max_video_bitrate {
        args.push("-maxrate".to_string());
        args.push(maxrate.to_string());
    }
    if let Some(bufsize) = spec.buffer_size {
        args.push("-bufsize".to_string());
        args.push(bufsize.to_string());
    }

    args.push(save_path.to_string_lossy().to_string());
    args
}

// 解析抖音链接
#[tauri::command]
pub async fn parse_douyin(share_text: String, app: AppHandle) -> Result<VideoInfo, String> {
    let url = extract_share_url(&share_text, is_douyin_url).ok_or("未找到抖音链接")?;

    println!("🎬 [parse_douyin] 解析抖音链接: {}", url);

    let ytdlp_path = get_ytdlp_path(&app)?;
    println!("🔧 [parse_douyin] yt-dlp路径: {:?}", ytdlp_path);

    let (cookie_args, temp_cookie_path) =
        prepare_named_cookie_args(&app, DOUYIN_COOKIE_FILE_NAME, "douyin")?;
    let using_cookie = !cookie_args.is_empty();
    let mut ytdlp_args = vec![
        "--no-check-certificate".to_string(),
        "--no-playlist".to_string(),
        "--referer".to_string(),
        "https://www.douyin.com/".to_string(),
        "--user-agent".to_string(),
        DOUYIN_BROWSER_USER_AGENT.to_string(),
        "-j".to_string(),
    ];
    ytdlp_args.extend(cookie_args);
    ytdlp_args.push(url);

    let mut command = Command::new(&ytdlp_path);
    command.args(&ytdlp_args);
    hide_child_window(&mut command);
    let output_result = command.output();
    cleanup_temp_cookie_file(temp_cookie_path);
    let output = output_result.map_err(|e| format!("执行yt-dlp失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("❌ [parse_douyin] yt-dlp错误: {}", stderr);
        let fresh_cookie_required = stderr.to_ascii_lowercase().contains("fresh cookies");
        let hint = if using_cookie && fresh_cookie_required {
            "已使用抖音cookie.txt，但抖音返回需要更新鲜的 cookie。请用已登录抖音的浏览器重新导出抖音cookie.txt，替换到软件目录后重试；也可能该视频不可见。"
        } else if using_cookie {
            "已使用抖音cookie.txt，但可能已过期或该视频不可见。"
        } else {
            "未发现抖音cookie.txt；如果该视频需要登录访问，请更新后放到应用目录。"
        };
        return Err(format!("yt-dlp解析抖音失败：{}{}", hint, stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    println!("📄 [parse_douyin] yt-dlp输出长度: {}", json_str.len());

    let video_url = extract_url_from_ytdlp_json(&json_str)?;
    let title = extract_title_from_ytdlp_json(&json_str).unwrap_or_else(|| "抖音视频".to_string());

    println!("✅ [parse_douyin] 视频URL: {}", video_url);
    println!("✅ [parse_douyin] 标题: {}", title);

    Ok(VideoInfo {
        video_url,
        title,
        author: "抖音用户".to_string(),
        platform: "douyin".to_string(),
        headers: None,
    })
}

fn extract_share_url(share_text: &str, predicate: fn(&str) -> bool) -> Option<String> {
    let url_pattern = regex::Regex::new(r"https?://[^\s]+").ok()?;
    let found = url_pattern.find_iter(share_text).find_map(|matched| {
        let url = normalize_share_url(matched.as_str());
        if predicate(&url) {
            Some(url)
        } else {
            None
        }
    });
    found
}

fn normalize_share_url(url: &str) -> String {
    url.trim_matches(|ch: char| {
        matches!(
            ch,
            '"' | '\''
                | '<'
                | '>'
                | '，'
                | '。'
                | ','
                | '.'
                | '！'
                | '!'
                | '？'
                | '?'
                | ')'
                | '）'
                | ']'
                | '】'
        )
    })
    .to_string()
}

fn is_douyin_url(url: &str) -> bool {
    url.contains("douyin.com/") || url.contains("iesdouyin.com/")
}

// 解析小红书链接 - 使用 yt-dlp 获取视频URL
#[tauri::command]
pub async fn parse_xiaohongshu(share_text: String, app: AppHandle) -> Result<VideoInfo, String> {
    let url_pattern = regex::Regex::new(r"https?://[^\s]+").map_err(|e| e.to_string())?;

    let url = url_pattern.find(&share_text).ok_or("未找到链接")?.as_str();

    println!("🎬 [parse_xiaohongshu] 解析小红书链接: {}", url);

    // 获取打包的 yt-dlp 路径
    let ytdlp_path = get_ytdlp_path(&app)?;
    println!("🔧 [parse_xiaohongshu] yt-dlp路径: {:?}", ytdlp_path);

    let (cookie_args, temp_cookie_path) = prepare_cookie_args(&app)?;
    let mut ytdlp_args = vec!["--no-check-certificate".to_string(), "-j".to_string()];
    ytdlp_args.extend(cookie_args);
    ytdlp_args.push(url.to_string());

    // 使用 yt-dlp 获取视频信息
    let mut command = Command::new(&ytdlp_path);
    command.args(&ytdlp_args);
    hide_child_window(&mut command);
    let output_result = command.output();
    cleanup_temp_cookie_file(temp_cookie_path);
    let output = output_result.map_err(|e| format!("执行yt-dlp失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("❌ [parse_xiaohongshu] yt-dlp错误: {}", stderr);
        if let Some(message) = explain_parse_failure(url, stderr.as_ref()).await {
            return Err(message);
        }
        return Err(format!("yt-dlp解析失败: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    println!("📄 [parse_xiaohongshu] yt-dlp输出长度: {}", json_str.len());

    // 从JSON中提取视频URL
    let video_url = extract_url_from_ytdlp_json(&json_str)?;

    // 提取标题
    let title =
        extract_title_from_ytdlp_json(&json_str).unwrap_or_else(|| "小红书视频".to_string());

    println!("✅ [parse_xiaohongshu] 视频URL: {}", video_url);
    println!("✅ [parse_xiaohongshu] 标题: {}", title);

    Ok(VideoInfo {
        video_url,
        title,
        author: "小红书用户".to_string(),
        platform: "xiaohongshu".to_string(),
        headers: None,
    })
}

// 从yt-dlp JSON输出中提取视频URL
fn extract_url_from_ytdlp_json(json_str: &str) -> Result<String, String> {
    // 尝试匹配 "url" 字段
    let patterns = [
        r#""url"\s*:\s*"([^"]+\.mp4[^"]*)"#,
        r#""url"\s*:\s*"(https://[^"]+)"#,
    ];

    for pattern in patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(json_str) {
                if let Some(url) = caps.get(1) {
                    return Ok(url.as_str().replace("\\u002F", "/").replace("\\/", "/"));
                }
            }
        }
    }

    Err("无法从yt-dlp输出中提取视频URL".to_string())
}

// 从yt-dlp JSON输出中提取标题
fn extract_title_from_ytdlp_json(json_str: &str) -> Option<String> {
    let re = regex::Regex::new(r#""title"\s*:\s*"([^"]+)"#).ok()?;
    let caps = re.captures(json_str)?;
    Some(caps.get(1)?.as_str().to_string())
}

fn looks_like_html_response(bytes: &[u8], content_type: Option<&str>) -> bool {
    if let Some(content_type) = content_type {
        let lower = content_type.to_ascii_lowercase();
        if lower.contains("text/html")
            || lower.contains("application/json")
            || lower.contains("text/plain")
            || lower.contains("application/xml")
        {
            return true;
        }
    }

    let sample_len = bytes.len().min(512);
    let sample = String::from_utf8_lossy(&bytes[..sample_len])
        .trim_start()
        .to_ascii_lowercase();
    sample.starts_with("<!doctype html")
        || sample.starts_with("<html")
        || sample.starts_with("{")
        || sample.starts_with("[")
        || sample.starts_with("<?xml")
}

fn is_safe_video_download_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "accept"
            | "accept-language"
            | "cache-control"
            | "pragma"
            | "referer"
            | "origin"
            | "user-agent"
            | "sec-fetch-dest"
            | "sec-fetch-mode"
            | "sec-fetch-site"
            | "sec-ch-ua"
            | "sec-ch-ua-mobile"
            | "sec-ch-ua-platform"
    )
}

// 从小红书HTML中提取视频URL（通过__INITIAL_STATE__）
#[allow(dead_code)]
fn extract_xhs_video_from_html(html: &str, note_id: &str) -> Result<String, String> {
    println!("🔍 [extract_xhs_video_from_html] 开始从HTML提取视频URL");

    // 方法1: 提取__INITIAL_STATE__中的数据
    if let Some(start) = html.find("__INITIAL_STATE__=") {
        let json_start = start + "__INITIAL_STATE__=".len();
        // 找到JSON结束位置（</script>之前）
        if let Some(end_offset) = html[json_start..].find("</script>") {
            let json_str = &html[json_start..json_start + end_offset];
            println!(
                "🔍 [extract_xhs_video_from_html] 找到__INITIAL_STATE__，长度: {}",
                json_str.len()
            );

            // 打印部分内容用于调试
            let preview = if json_str.len() > 300 {
                &json_str[..300]
            } else {
                json_str
            };
            println!("🔍 [extract_xhs_video_from_html] JSON预览: {}", preview);

            // 在JSON中搜索视频URL
            return extract_video_from_json(json_str, note_id);
        }
    }

    // 方法2: 直接在HTML中搜索视频URL模式
    println!("🔍 [extract_xhs_video_from_html] 未找到__INITIAL_STATE__，尝试直接匹配");

    let patterns = [
        r#"originVideoKey['":\s]+([a-zA-Z0-9/._-]+)"#,
        r#"videoKey['":\s]+([a-zA-Z0-9/._-]+)"#,
        r#"(https://sns-video[^"'\s<>\\]+)"#,
        r#"stream[^}]*master_url['":\s]+([^"']+)"#,
    ];

    for (i, pattern) in patterns.iter().enumerate() {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(html) {
                if let Some(key) = caps.get(1) {
                    let key_str = key.as_str().replace("\\u002F", "/").replace("\\/", "/");
                    println!(
                        "✅ [extract_xhs_video_from_html] 模式 {} 匹配: {}",
                        i + 1,
                        key_str
                    );

                    if key_str.starts_with("http") {
                        return Ok(key_str);
                    } else if !key_str.is_empty() {
                        return Ok(format!("https://sns-video-bd.xhscdn.com/{}", key_str));
                    }
                }
            }
        }
    }

    println!("❌ [extract_xhs_video_from_html] 所有模式都未匹配");
    Err(format!(
        "无法提取视频URL，该笔记可能是图文笔记 (笔记ID: {})",
        note_id
    ))
}

// 从JSON字符串中提取视频URL
#[allow(dead_code)]
fn extract_video_from_json(json_str: &str, note_id: &str) -> Result<String, String> {
    let patterns = [
        r#""originVideoKey"\s*:\s*"([^"]+)"#,
        r#""videoKey"\s*:\s*"([^"]+)"#,
        r#"(https://sns-video[^"'\\]+)"#,
        r#""master_url"\s*:\s*"([^"]+)"#,
        r#""url"\s*:\s*"(https://[^"]*xhscdn[^"]*)"#,
    ];

    for (i, pattern) in patterns.iter().enumerate() {
        println!(
            "🔍 [extract_video_from_json] 尝试模式 {}: {}",
            i + 1,
            pattern
        );
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(json_str) {
                if let Some(key) = caps.get(1) {
                    let key_str = key.as_str().replace("\\u002F", "/").replace("\\/", "/");
                    println!(
                        "✅ [extract_video_from_json] 模式 {} 匹配成功: {}",
                        i + 1,
                        key_str
                    );

                    if key_str.starts_with("http") {
                        return Ok(key_str);
                    } else {
                        return Ok(format!("https://sns-video-bd.xhscdn.com/{}", key_str));
                    }
                }
            }
        }
    }

    // 检查是否是图文笔记
    if !json_str.contains("video") && !json_str.contains("Video") {
        return Err("该笔记是图文笔记，不包含视频".to_string());
    }

    Err(format!("无法从JSON提取视频URL (笔记ID: {})", note_id))
}

// 从小红书HTML中提取视频URL
#[allow(dead_code)]
fn extract_xhs_video_url(html: &str, note_id: &str) -> Result<String, String> {
    println!(
        "🔍 [extract_xhs_video_url] 开始提取视频URL, HTML长度: {}",
        html.len()
    );

    // 检查是否被反爬虫拦截
    if html.contains("验证") || html.contains("captcha") || html.len() < 1000 {
        println!("⚠️ [extract_xhs_video_url] 可能被反爬虫拦截，HTML长度过短或包含验证码");
    }

    // 搜索HTML中包含video相关的内容
    if let Some(pos) = html.find("sns-video") {
        let start = if pos > 50 { pos - 50 } else { 0 };
        let end = if pos + 200 < html.len() {
            pos + 200
        } else {
            html.len()
        };
        println!(
            "🔍 [extract_xhs_video_url] 找到sns-video: {}",
            &html[start..end]
        );
    }

    // 搜索xhscdn相关内容
    if let Some(pos) = html.find("xhscdn") {
        let start = if pos > 50 { pos - 50 } else { 0 };
        let end = if pos + 200 < html.len() {
            pos + 200
        } else {
            html.len()
        };
        println!(
            "🔍 [extract_xhs_video_url] 找到xhscdn: {}",
            &html[start..end]
        );
    }

    let patterns = [
        r#"originVideoKey":"([^"]+)"#,
        r#""videoKey":"([^"]+)"#,
        r#"video.*?src="(https://[^"]+\.mp4[^"]*)"#,
        r#""url":"(https://sns-video[^"]+)"#,
    ];

    for (i, pattern) in patterns.iter().enumerate() {
        println!("🔍 [extract_xhs_video_url] 尝试模式 {}: {}", i + 1, pattern);
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(html) {
                if let Some(key) = caps.get(1) {
                    let key_str = key.as_str();
                    println!(
                        "✅ [extract_xhs_video_url] 模式 {} 匹配成功: {}",
                        i + 1,
                        key_str
                    );
                    if key_str.starts_with("http") {
                        return Ok(key_str.to_string());
                    } else {
                        return Ok(format!("https://sns-video-bd.xhscdn.com/{}", key_str));
                    }
                }
            }
        }
    }

    // 打印HTML片段帮助调试
    let preview = if html.len() > 500 { &html[..500] } else { html };
    println!(
        "❌ [extract_xhs_video_url] 所有模式都未匹配，HTML预览: {}...",
        preview
    );

    Err(format!("无法从页面提取视频URL (笔记ID: {})", note_id))
}

// 下载视频到本地
#[tauri::command]
pub async fn download_video(
    url: String,
    platform: String,
    headers: Option<HashMap<String, String>>,
    app: AppHandle,
) -> Result<String, String> {
    use std::io::Write;
    use tauri_plugin_dialog::DialogExt;

    println!("📥 [download_video] 开始下载: {}", url);

    // 获取缓存目录：优先使用用户配置的路径
    let cache_dir = if let Some(saved_path) = read_cache_config(&app) {
        println!("📁 [download_video] 使用已保存的缓存路径: {}", saved_path);
        PathBuf::from(saved_path)
    } else {
        // 第一次使用，弹窗让用户选择路径
        println!("📁 [download_video] 首次使用，弹窗选择缓存路径...");

        let selected = app
            .dialog()
            .file()
            .set_title("选择视频缓存保存位置")
            .blocking_pick_folder();

        match selected {
            Some(path) => {
                let path_str = path.to_string();
                // 保存用户选择的路径
                save_cache_config(&app, &path_str)?;
                PathBuf::from(path_str)
            }
            None => {
                // 用户取消选择，使用默认路径
                println!("📁 [download_video] 用户取消选择，使用默认路径");
                let default_dir = app
                    .path()
                    .app_cache_dir()
                    .map_err(|e| format!("无法获取缓存目录: {}", e))?;
                // 保存默认路径
                save_cache_config(&app, &default_dir.to_string_lossy())?;
                default_dir
            }
        }
    };

    // 确保目录存在
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;

    let filename = format!("preview_{}.mp4", uuid::Uuid::new_v4());
    let file_path = cache_dir.join(&filename);

    // 设置Referer
    let referer = if platform == "douyin" {
        "https://www.douyin.com/"
    } else {
        "https://www.xiaohongshu.com/"
    };

    // 下载视频
    let client = reqwest::Client::new();
    let mut request = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .header("Referer", referer);

    if let Some(headers) = headers {
        for (name, value) in headers {
            if !is_safe_video_download_header(&name) {
                continue;
            }
            let Ok(header_name) = name.parse::<reqwest::header::HeaderName>() else {
                continue;
            };
            let Ok(header_value) = value.parse::<reqwest::header::HeaderValue>() else {
                continue;
            };
            request = request.header(header_name, header_value);
        }
    }

    let resp = request
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {}", e))?;
    let status = resp.status();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取视频数据失败: {}", e))?;
    if !status.is_success() {
        return Err(format!("下载视频失败：HTTP {}", status));
    }
    if looks_like_html_response(&bytes, content_type.as_deref()) {
        return Err("下载到的不是视频文件，可能是平台拦截页或链接已失效".to_string());
    }

    // 写入文件
    let mut file = std::fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    println!("✅ [download_video] 下载完成: {:?}", file_path);

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn prepare_local_video_preview(
    input_path: String,
    app: AppHandle,
) -> Result<String, String> {
    println!(
        "🎞️ [prepare_local_video_preview] 准备本地视频预览: {}",
        input_path
    );
    if input_path.trim().is_empty() {
        return Err("输入路径为空".to_string());
    }

    let input_path_buf = PathBuf::from(&input_path);
    if !input_path_buf.exists() {
        return Err(format!("输入文件不存在: {}", input_path));
    }

    let cache_dir = if let Some(saved_path) = read_cache_config(&app) {
        PathBuf::from(saved_path)
    } else {
        let default_dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| format!("无法获取缓存目录: {}", e))?;
        save_cache_config(&app, &default_dir.to_string_lossy())?;
        default_dir
    };
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;

    let preview_path = cache_dir.join(format!("local_preview_{}.mp4", uuid::Uuid::new_v4()));
    let ffmpeg_path = get_ffmpeg_path(&app)?;
    let args = [
        "-y",
        "-i",
        &input_path,
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
    ];
    let preview_path_string = preview_path.to_string_lossy().to_string();
    let mut command = Command::new(&ffmpeg_path);
    command.args(args).arg(&preview_path_string);
    hide_child_window(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("FFmpeg预览转码启动失败: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_file(&preview_path);
        return Err(format!("本地视频预览转码失败: {}", stderr));
    }

    println!(
        "✅ [prepare_local_video_preview] 预览文件: {:?}",
        preview_path
    );
    Ok(preview_path_string)
}

// FFmpeg视频处理命令
#[tauri::command]
pub async fn process_video(
    video_url: String,
    platform: String,
    headers: Option<HashMap<String, String>>,
    crop: CropParams,
    file_name: String, // 自定义文件名
    export_target: Option<String>,
    include_audio: Option<bool>,
    app: AppHandle,
) -> Result<String, String> {
    println!("🎬 [process_video] 开始处理视频");
    println!(
        "📐 裁剪参数: x={}, y={}, w={}, h={}",
        crop.x, crop.y, crop.width, crop.height
    );
    println!(
        "⏱️ 时间范围: {:.2}s - {:.2}s",
        crop.start_time, crop.end_time
    );
    let spec = resolve_export_spec(export_target.as_deref().unwrap_or("meituan"))?;
    let include_audio = include_audio.unwrap_or(false);
    println!(
        "📦 导出规格: {} ({}x{})",
        spec.label, spec.width, spec.height
    );
    println!(
        "🔊 导出声音: {}",
        if include_audio { "开启" } else { "关闭" }
    );
    validate_export_duration(&crop, spec)?;

    // 先下载视频
    let input_path = download_video(video_url, platform, headers, app.clone()).await?;

    let export_dir = resolve_export_dir(&app)?;

    // 生成安全的文件名
    let safe_name = ensure_mp4_file_name(&file_name);

    let save_path = export_dir.join(&safe_name);
    println!("📁 [process_video] 保存路径: {:?}", save_path);

    // 获取打包的 FFmpeg 路径
    let ffmpeg_path = get_ffmpeg_path(&app)?;
    println!("🔧 [process_video] FFmpeg路径: {:?}", ffmpeg_path);

    run_ffmpeg_export(
        &ffmpeg_path,
        &input_path,
        &save_path,
        &crop,
        spec,
        include_audio,
    )?;

    println!("✅ [process_video] 处理完成: {:?}", save_path);

    Ok(save_path.to_string_lossy().to_string())
}

// FFmpeg处理本地视频文件
// 说明：用于支持“上传本地视频 -> 裁剪 -> 按平台规格导出 MP4”的工作流
#[tauri::command]
pub async fn process_local_video(
    input_path: String,
    crop: CropParams,
    file_name: String,
    export_target: Option<String>,
    include_audio: Option<bool>,
    app: AppHandle,
) -> Result<String, String> {
    println!("🎬 [process_local_video] 开始处理本地视频");
    println!("📁 输入路径: {}", input_path);
    println!(
        "📐 裁剪参数: x={}, y={}, w={}, h={}",
        crop.x, crop.y, crop.width, crop.height
    );
    println!(
        "⏱️ 时间范围: {:.2}s - {:.2}s",
        crop.start_time, crop.end_time
    );
    let spec = resolve_export_spec(export_target.as_deref().unwrap_or("meituan"))?;
    let include_audio = include_audio.unwrap_or(false);
    println!(
        "📦 导出规格: {} ({}x{})",
        spec.label, spec.width, spec.height
    );
    println!(
        "🔊 导出声音: {}",
        if include_audio { "开启" } else { "关闭" }
    );
    validate_export_duration(&crop, spec)?;

    if input_path.trim().is_empty() {
        return Err("输入路径为空".to_string());
    }

    let input_path_buf = std::path::PathBuf::from(&input_path);
    if !input_path_buf.exists() {
        return Err(format!("输入文件不存在: {}", input_path));
    }

    let export_dir = resolve_export_dir(&app)?;

    // 生成安全的文件名
    let safe_name = ensure_mp4_file_name(&file_name);

    let save_path = export_dir.join(&safe_name);
    println!("📁 [process_local_video] 保存路径: {:?}", save_path);

    // 获取打包的 FFmpeg 路径
    let ffmpeg_path = get_ffmpeg_path(&app)?;
    println!("🔧 [process_local_video] FFmpeg路径: {:?}", ffmpeg_path);

    run_ffmpeg_export(
        &ffmpeg_path,
        &input_path,
        &save_path,
        &crop,
        spec,
        include_audio,
    )?;

    println!("✅ [process_local_video] 处理完成: {:?}", save_path);

    Ok(save_path.to_string_lossy().to_string())
}

// 复制视频文件到用户选择的位置
#[tauri::command]
pub async fn copy_video_file(source_path: String, dest_path: String) -> Result<String, String> {
    println!("📋 [copy_video_file] 复制文件");
    println!("   源路径: {}", source_path);
    println!("   目标路径: {}", dest_path);

    std::fs::copy(&source_path, &dest_path).map_err(|e| format!("复制文件失败: {}", e))?;

    println!("✅ [copy_video_file] 复制完成");
    Ok(dest_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_spec() -> VideoExportSpec {
        VideoExportSpec {
            label: "测试视频",
            width: 692,
            height: 390,
            min_duration_seconds: None,
            max_duration_seconds: None,
            max_file_size_bytes: None,
            max_video_bitrate: None,
            buffer_size: None,
        }
    }

    fn test_crop() -> CropParams {
        CropParams {
            x: 0,
            y: 0,
            width: 692,
            height: 390,
            start_time: 0.0,
            end_time: 10.0,
        }
    }

    #[test]
    fn muted_export_removes_audio_stream() {
        let args = build_ffmpeg_export_args(
            "input.mp4",
            &PathBuf::from("output.mp4"),
            &test_crop(),
            test_spec(),
            10.0,
            false,
        );

        assert!(args.iter().any(|arg| arg == "-an"));
        assert!(!args.iter().any(|arg| arg == "0:a:0?"));
        assert!(!args.iter().any(|arg| arg == "-c:a"));
    }

    #[test]
    fn audio_export_maps_optional_audio_and_encodes_aac() {
        let args = build_ffmpeg_export_args(
            "input.mp4",
            &PathBuf::from("output.mp4"),
            &test_crop(),
            test_spec(),
            10.0,
            true,
        );

        assert!(!args.iter().any(|arg| arg == "-an"));
        assert!(args.iter().any(|arg| arg == "0:a:0?"));
        assert!(args.iter().any(|arg| arg == "-c:a"));
        assert!(args.iter().any(|arg| arg == "aac"));
        assert!(args.iter().any(|arg| arg == "128k"));
    }

    #[test]
    fn export_history_excludes_preview_source_videos() {
        assert!(!is_exported_video_file_name("preview_123.mp4"));
        assert!(!is_exported_video_file_name("local_preview_123.mp4"));
        assert!(is_exported_video_file_name("门店视频店招.mp4"));
    }
}
