use super::*;

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
    app.asset_protocol_scope().allow_file(&preview_path)
        .map_err(|error| format!("授权视频预览失败：{error}"))?;
    Ok(preview_path_string)
}

// FFmpeg视频处理命令
