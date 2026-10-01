use super::*;

pub(crate) async fn parse_douyin_video(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ParseDouyinVideoRequest>,
) -> Result<Json<ParsedVideoInfo>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    if req.share_text.trim().is_empty() {
        return Err(GatewayError::bad_request("抖音分享内容为空"));
    }

    parse_douyin_video_with_ytdlp(req.share_text)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

pub(crate) async fn parse_douyin_video_with_ytdlp(share_text: String) -> Result<ParsedVideoInfo, String> {
    tokio::task::spawn_blocking(move || parse_douyin_video_with_ytdlp_blocking(&share_text))
        .await
        .map_err(|error| format!("抖音解析任务异常：{error}"))?
}

pub(crate) fn parse_douyin_video_with_ytdlp_blocking(share_text: &str) -> Result<ParsedVideoInfo, String> {
    let url = extract_share_url(share_text, is_douyin_url).ok_or("未找到抖音链接")?;
    let ytdlp_path = resolve_gateway_ytdlp_path();
    let (ytdlp_program, mut ytdlp_args) = resolve_gateway_ytdlp_command(&ytdlp_path);
    let (cookie_args, temp_cookie_path, using_cookie) = prepare_gateway_douyin_cookie_args()?;

    ytdlp_args.extend(vec![
        "--no-check-certificate".to_string(),
        "--no-playlist".to_string(),
        "--referer".to_string(),
        "https://www.douyin.com/".to_string(),
        "--user-agent".to_string(),
        DOUYIN_BROWSER_USER_AGENT.to_string(),
        "-f".to_string(),
        "best[ext=mp4]/best".to_string(),
        "-j".to_string(),
    ]);
    ytdlp_args.extend(cookie_args);
    ytdlp_args.push(url);

    let output_result = Command::new(&ytdlp_program).args(&ytdlp_args).output();
    cleanup_temp_cookie_file(temp_cookie_path);
    let output = output_result.map_err(|error| format!("执行yt-dlp失败：{error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let lower = stderr.to_ascii_lowercase();
        let fresh_cookie_required = lower.contains("fresh cookies");
        let hint = if using_cookie && fresh_cookie_required {
            "云端已使用抖音 cookie，但抖音要求更新鲜 cookie。请更新服务器 DOUYIN_COOKIE_PATH 指向的抖音cookie.txt；也可能该视频不可见。"
        } else if using_cookie {
            "云端已使用抖音 cookie，但可能已过期或该视频不可见。"
        } else if fresh_cookie_required {
            "云端未找到抖音cookie.txt，且抖音要求 cookie。请在服务器配置 DOUYIN_COOKIE_PATH 或放置 /opt/csgh-gateway/secrets/抖音cookie.txt。"
        } else {
            "云端解析抖音失败。"
        };
        return Err(format!("yt-dlp解析抖音失败：{}{}", hint, stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let parsed = parse_ytdlp_json(&json_str)?;
    let video_url = extract_url_from_ytdlp_value(&parsed)?;
    let title = extract_title_from_ytdlp_value(&parsed).unwrap_or_else(|| "抖音视频".to_string());
    let author = extract_author_from_ytdlp_value(&parsed).unwrap_or_else(|| "抖音用户".to_string());
    let headers = extract_safe_http_headers_from_ytdlp_value(&parsed);

    eprintln!(
        "[video-parse:douyin] resolved direct url, title_chars={}, headers={}",
        title.chars().count(),
        headers.as_ref().map(|h| h.len()).unwrap_or(0)
    );

    Ok(ParsedVideoInfo {
        video_url,
        title,
        author,
        platform: "douyin".to_string(),
        headers,
    })
}

pub(crate) fn resolve_gateway_ytdlp_command(ytdlp_path: &Path) -> (PathBuf, Vec<String>) {
    for env_name in ["DOUYIN_YTDLP_PYTHON", "YTDLP_PYTHON_PATH"] {
        if let Ok(value) = env::var(env_name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return (
                    PathBuf::from(trimmed),
                    vec![ytdlp_path.to_string_lossy().to_string()],
                );
            }
        }
    }

    if cfg!(unix) {
        for candidate in ["/usr/bin/python3.11", "/usr/local/bin/python3.11"] {
            let python_path = PathBuf::from(candidate);
            if python_path.exists() {
                return (python_path, vec![ytdlp_path.to_string_lossy().to_string()]);
            }
        }
    }

    (ytdlp_path.to_path_buf(), Vec::new())
}

pub(crate) fn resolve_gateway_ytdlp_path() -> PathBuf {
    for env_name in ["DOUYIN_YTDLP_PATH", "YTDLP_PATH"] {
        if let Ok(value) = env::var(env_name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed);
            }
        }
    }

    let mut candidates = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("yt-dlp"));
            candidates.push(dir.join("yt-dlp-x86_64-unknown-linux-gnu"));
            candidates.push(dir.join("binaries").join("yt-dlp"));
            candidates.push(dir.join("binaries").join("yt-dlp-x86_64-unknown-linux-gnu"));
        }
    }
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(
            current_dir
                .join("src-tauri")
                .join("binaries")
                .join("yt-dlp-x86_64-unknown-linux-gnu"),
        );
        candidates.push(
            current_dir
                .join("binaries")
                .join("yt-dlp-x86_64-unknown-linux-gnu"),
        );
        for dir in current_dir.ancestors().take(6) {
            candidates.push(
                dir.join("src-tauri")
                    .join("binaries")
                    .join("yt-dlp-x86_64-unknown-linux-gnu"),
            );
        }
    }
    candidates.push(PathBuf::from(
        "/opt/csgh-image-studio/src-tauri/binaries/yt-dlp-x86_64-unknown-linux-gnu",
    ));
    candidates.push(PathBuf::from("/opt/csgh-gateway/bin/yt-dlp"));
    candidates.push(PathBuf::from("/usr/local/bin/yt-dlp"));
    candidates.push(PathBuf::from("/usr/bin/yt-dlp"));

    candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("yt-dlp"))
}
