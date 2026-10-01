use super::*;

#[cfg(target_os = "windows")]
pub(super) fn hide_child_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
pub(super) fn hide_child_window(_command: &mut Command) {}

pub(super) fn resolve_external_binary_path(
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
pub(super) fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let ffmpeg_name = "ffmpeg-x86_64-pc-windows-msvc.exe";
    #[cfg(not(target_os = "windows"))]
    let ffmpeg_name = "ffmpeg-x86_64-unknown-linux-gnu";

    resolve_external_binary_path(app, ffmpeg_name, "ffmpeg")
}

// 获取打包的 yt-dlp 可执行文件路径
pub(super) fn get_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let ytdlp_name = "yt-dlp-x86_64-pc-windows-msvc.exe";
    #[cfg(not(target_os = "windows"))]
    let ytdlp_name = "yt-dlp-x86_64-unknown-linux-gnu";

    resolve_external_binary_path(app, ytdlp_name, "yt-dlp")
}

// 视频路径配置
