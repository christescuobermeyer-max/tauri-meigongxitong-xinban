use super::*;

pub(super) fn is_exported_video_file_name(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    lower.ends_with(".mp4")
        && !lower.starts_with("preview_")
        && !lower.starts_with("local_preview_")
}

pub(super) fn system_time_sort_key(time: SystemTime) -> u128 {
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
