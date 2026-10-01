use super::*;

pub(super) fn score_cookie_file_candidate(
    path: &Path,
    cookie_file_name: &str,
    now_secs: i64,
) -> Result<CookieCandidateScore, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("读取cookie文件失败: {}", e))?;
    let cookies = parse_cookie_metadata(&content)?;
    let modified_secs = std::fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let relevant: Vec<&CookieMeta> = cookies
        .iter()
        .filter(|cookie| is_relevant_cookie(cookie_file_name, &cookie.domain))
        .collect();
    let fresh_relevant_count = relevant
        .iter()
        .filter(|cookie| is_fresh_cookie(cookie.expires, now_secs))
        .count();
    let fresh_important_count = relevant
        .iter()
        .filter(|cookie| {
            is_important_cookie(cookie_file_name, &cookie.name)
                && is_fresh_cookie(cookie.expires, now_secs)
        })
        .count();

    Ok(CookieCandidateScore {
        fresh_important_count,
        fresh_relevant_count,
        relevant_count: relevant.len(),
        modified_secs,
    })
}

pub(super) fn parse_cookie_metadata(content: &str) -> Result<Vec<CookieMeta>, String> {
    if content.trim_start().starts_with('[') {
        let cookies: Vec<BrowserCookie> =
            serde_json::from_str(content).map_err(|e| format!("解析cookie JSON失败: {}", e))?;
        return Ok(cookies
            .into_iter()
            .map(|cookie| CookieMeta {
                domain: cookie.domain,
                name: cookie.name,
                expires: cookie_expiration_secs(cookie.expiration_date, cookie.session),
            })
            .collect());
    }

    let cookies = content
        .lines()
        .filter_map(|line| {
            let line = line.trim_end();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 7 {
                return None;
            }
            let expires = parts[4].parse::<i64>().unwrap_or(0);
            Some(CookieMeta {
                domain: parts[0].to_string(),
                name: parts[5].to_string(),
                expires,
            })
        })
        .collect();
    Ok(cookies)
}

pub(super) fn cookie_expiration_secs(expiration_date: Option<f64>, session: Option<bool>) -> i64 {
    if session.unwrap_or(false) {
        0
    } else {
        expiration_date.unwrap_or(0.0) as i64
    }
}

pub(super) fn is_fresh_cookie(expires: i64, now_secs: i64) -> bool {
    expires == 0 || expires > now_secs
}

pub(super) fn is_relevant_cookie(cookie_file_name: &str, domain: &str) -> bool {
    let file_name = cookie_file_name.to_lowercase();
    let domain = domain.to_lowercase();
    if file_name.contains("抖音") {
        return domain.contains("douyin")
            || domain.contains("iesdouyin")
            || domain.contains("amemv")
            || domain.contains("snssdk");
    }
    if file_name.contains("小红书") {
        return domain.contains("xiaohongshu") || domain.contains("xhs");
    }
    true
}

pub(super) fn is_important_cookie(cookie_file_name: &str, name: &str) -> bool {
    let file_name = cookie_file_name.to_lowercase();
    let name = name.to_lowercase();
    if file_name.contains("抖音") {
        return matches!(
            name.as_str(),
            "ttwid"
                | "mstoken"
                | "s_v_web_id"
                | "passport_csrf_token"
                | "passport_csrf_token_default"
                | "passport_assist_user"
                | "sid_guard"
                | "sessionid"
                | "sessionid_ss"
                | "sid_tt"
                | "uid_tt"
                | "uid_tt_ss"
                | "odin_tt"
        );
    }
    if file_name.contains("小红书") {
        return matches!(name.as_str(), "a1" | "webid" | "web_session" | "websectiga");
    }
    true
}

pub(super) fn current_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}
