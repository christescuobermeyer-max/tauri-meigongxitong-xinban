use super::*;

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
