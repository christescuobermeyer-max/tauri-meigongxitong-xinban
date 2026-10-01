use super::*;

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
pub(super) fn extract_url_from_ytdlp_json(json_str: &str) -> Result<String, String> {
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
pub(super) fn extract_title_from_ytdlp_json(json_str: &str) -> Option<String> {
    let re = regex::Regex::new(r#""title"\s*:\s*"([^"]+)"#).ok()?;
    let caps = re.captures(json_str)?;
    Some(caps.get(1)?.as_str().to_string())
}

pub(super) fn looks_like_html_response(bytes: &[u8], content_type: Option<&str>) -> bool {
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

pub(super) fn is_safe_video_download_header(name: &str) -> bool {
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
