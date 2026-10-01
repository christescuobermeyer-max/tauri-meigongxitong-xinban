use super::*;

pub(crate) fn extract_share_url(share_text: &str, predicate: fn(&str) -> bool) -> Option<String> {
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

pub(crate) fn normalize_share_url(url: &str) -> String {
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

pub(crate) fn is_douyin_url(url: &str) -> bool {
    url.contains("douyin.com/") || url.contains("iesdouyin.com/")
}

pub(crate) fn parse_ytdlp_json(json_str: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str(json_str).or_else(|_| {
        json_str
            .lines()
            .find_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
            .ok_or_else(|| "无法解析yt-dlp JSON输出".to_string())
    })
}

pub(crate) fn extract_url_from_ytdlp_value(value: &serde_json::Value) -> Result<String, String> {
    if let Some(url) = value
        .get("requested_downloads")
        .and_then(|items| items.as_array())
        .and_then(|items| items.iter().find_map(|item| http_url_field(item, "url")))
        .filter(|url| is_probably_direct_video_url(url))
    {
        return Ok(url);
    }

    if let Some(url) = http_url_field(value, "url").filter(|url| is_probably_direct_video_url(url))
    {
        return Ok(url);
    }

    if let Some(url) = best_format_url(value).filter(|url| is_probably_direct_video_url(url)) {
        return Ok(url);
    }

    http_url_field(value, "url")
        .or_else(|| best_format_url(value))
        .ok_or_else(|| "无法从yt-dlp输出中提取可下载视频URL".to_string())
}

pub(crate) fn best_format_url(value: &serde_json::Value) -> Option<String> {
    let formats = value.get("formats")?.as_array()?;
    formats
        .iter()
        .filter_map(|format| {
            let url = http_url_field(format, "url")?;
            let ext_score = if format.get("ext").and_then(|v| v.as_str()) == Some("mp4") {
                1_000_000
            } else {
                0
            };
            let video_score = if format
                .get("vcodec")
                .and_then(|v| v.as_str())
                .is_some_and(|codec| codec != "none")
            {
                100_000
            } else {
                0
            };
            let height_score = format.get("height").and_then(|v| v.as_i64()).unwrap_or(0);
            let bitrate_score = format.get("tbr").and_then(|v| v.as_f64()).unwrap_or(0.0) as i64;
            Some((ext_score + video_score + height_score + bitrate_score, url))
        })
        .max_by_key(|(score, _)| *score)
        .map(|(_, url)| url)
}

pub(crate) fn http_url_field(value: &serde_json::Value, key: &str) -> Option<String> {
    let url = value.get(key)?.as_str()?.trim();
    if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.to_string())
    } else {
        None
    }
}

pub(crate) fn is_probably_direct_video_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("http") && !lower.contains(".m3u8")
}

pub(crate) fn extract_title_from_ytdlp_value(value: &serde_json::Value) -> Option<String> {
    ["title", "fulltitle", "description"]
        .iter()
        .find_map(|key| value.get(*key)?.as_str())
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(|title| title.to_string())
}

pub(crate) fn extract_author_from_ytdlp_value(value: &serde_json::Value) -> Option<String> {
    ["uploader", "creator", "channel", "uploader_id"]
        .iter()
        .find_map(|key| value.get(*key)?.as_str())
        .map(str::trim)
        .filter(|author| !author.is_empty())
        .map(|author| author.to_string())
}

pub(crate) fn extract_safe_http_headers_from_ytdlp_value(
    value: &serde_json::Value,
) -> Option<HashMap<String, String>> {
    let mut headers = HashMap::new();

    if let Some(items) = value
        .get("requested_downloads")
        .and_then(|items| items.as_array())
    {
        for item in items {
            merge_safe_http_headers(item.get("http_headers"), &mut headers);
        }
    }
    merge_safe_http_headers(value.get("http_headers"), &mut headers);

    headers
        .entry("User-Agent".to_string())
        .or_insert_with(|| DOUYIN_BROWSER_USER_AGENT.to_string());
    headers
        .entry("Referer".to_string())
        .or_insert_with(|| "https://www.douyin.com/".to_string());

    if headers.is_empty() {
        None
    } else {
        Some(headers)
    }
}

pub(crate) fn merge_safe_http_headers(
    value: Option<&serde_json::Value>,
    headers: &mut HashMap<String, String>,
) {
    let Some(object) = value.and_then(|value| value.as_object()) else {
        return;
    };
    for (name, value) in object {
        let Some(header_value) = value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if is_safe_video_download_header(name) && header_value.len() <= 1024 {
            headers.insert(name.to_string(), header_value.to_string());
        }
    }
}

pub(crate) fn is_safe_video_download_header(name: &str) -> bool {
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

