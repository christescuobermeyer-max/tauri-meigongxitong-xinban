use super::*;

#[allow(dead_code)]
pub(super) fn extract_xhs_video_from_html(html: &str, note_id: &str) -> Result<String, String> {
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
pub(super) fn extract_video_from_json(json_str: &str, note_id: &str) -> Result<String, String> {
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
pub(super) fn extract_xhs_video_url(html: &str, note_id: &str) -> Result<String, String> {
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
