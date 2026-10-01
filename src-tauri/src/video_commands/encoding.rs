use super::*;

pub(super) fn parse_video_dimensions(ffmpeg_output: &str) -> Option<(i32, i32)> {
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

pub(super) fn read_video_dimensions(ffmpeg_path: &PathBuf, input_path: &str) -> Result<(i32, i32), String> {
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

pub(super) fn run_ffmpeg_export(
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

pub(super) fn build_ffmpeg_export_args(
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
