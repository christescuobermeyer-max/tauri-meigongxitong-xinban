use super::*;

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

pub(super) fn extract_share_url(share_text: &str, predicate: fn(&str) -> bool) -> Option<String> {
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

pub(super) fn normalize_share_url(url: &str) -> String {
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

pub(super) fn is_douyin_url(url: &str) -> bool {
    url.contains("douyin.com/") || url.contains("iesdouyin.com/")
}

// 解析小红书链接 - 使用 yt-dlp 获取视频URL
