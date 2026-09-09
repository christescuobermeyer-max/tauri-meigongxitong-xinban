use serde::Deserialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const COOKIE_FILE_NAME: &str = "小红书cookie.txt";
const NETSCAPE_HEADER: &str = "# Netscape HTTP Cookie File";

#[derive(Debug, Deserialize)]
struct BrowserCookie {
    domain: String,
    #[serde(rename = "expirationDate")]
    expiration_date: Option<f64>,
    #[serde(rename = "hostOnly")]
    host_only: Option<bool>,
    name: String,
    path: Option<String>,
    secure: Option<bool>,
    session: Option<bool>,
    value: String,
}

#[derive(Debug, Clone)]
struct CookieMeta {
    domain: String,
    name: String,
    expires: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct CookieCandidateScore {
    fresh_important_count: usize,
    fresh_relevant_count: usize,
    relevant_count: usize,
    modified_secs: u64,
}

pub fn prepare_cookie_args(app: &AppHandle) -> Result<(Vec<String>, Option<PathBuf>), String> {
    prepare_named_cookie_args(app, COOKIE_FILE_NAME, "xiaohongshu")
}

pub fn prepare_named_cookie_args(
    app: &AppHandle,
    cookie_file_name: &str,
    temp_prefix: &str,
) -> Result<(Vec<String>, Option<PathBuf>), String> {
    let Some(source_path) = locate_cookie_file(app, cookie_file_name) else {
        return Ok((Vec::new(), None));
    };

    let temp_cookie_path = if is_json_cookie_file(&source_path)? {
        Some(convert_json_cookie_file(&source_path, temp_prefix)?)
    } else {
        None
    };

    let cookie_path = temp_cookie_path.as_ref().unwrap_or(&source_path);
    let cookie_args = vec![
        "--cookies".to_string(),
        cookie_path.to_string_lossy().to_string(),
    ];

    println!("🍪 [prepare_cookie_args] 使用cookie文件: {:?}", cookie_path);
    Ok((cookie_args, temp_cookie_path))
}

pub fn cleanup_temp_cookie_file(temp_cookie_path: Option<PathBuf>) {
    if let Some(path) = temp_cookie_path {
        let _ = std::fs::remove_file(path);
    }
}

fn locate_cookie_file(app: &AppHandle, cookie_file_name: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(app_dir) = app.path().app_data_dir() {
        candidates.push(app_dir.join(cookie_file_name));
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        candidates.push(config_dir.join(cookie_file_name));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(cookie_file_name));
        candidates.push(resource_dir.join("_up_").join(cookie_file_name));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        for dir in current_dir.ancestors().take(6) {
            candidates.push(dir.join(cookie_file_name));
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("_up_").join(cookie_file_name));
            for dir in exe_dir.ancestors().take(6) {
                candidates.push(dir.join(cookie_file_name));
            }
        }
    }

    let now_secs = current_unix_secs();
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .filter_map(|path| {
            if !path.exists() {
                return None;
            }
            match score_cookie_file_candidate(&path, cookie_file_name, now_secs) {
                Ok(score) => {
                    println!(
                        "🍪 [locate_cookie_file] 候选cookie: {:?}, important={}, fresh={}, relevant={}",
                        path,
                        score.fresh_important_count,
                        score.fresh_relevant_count,
                        score.relevant_count
                    );
                    Some((path, score))
                }
                Err(error) => {
                    println!(
                        "⚠️ [locate_cookie_file] 跳过不可用cookie: {:?}, {}",
                        path, error
                    );
                    None
                }
            }
        })
        .max_by_key(|(_, score)| *score)
        .map(|(path, score)| {
            println!(
                "✅ [locate_cookie_file] 选中cookie: {:?}, important={}, fresh={}, relevant={}",
                path,
                score.fresh_important_count,
                score.fresh_relevant_count,
                score.relevant_count
            );
            path
        })
}

fn is_json_cookie_file(path: &Path) -> Result<bool, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("读取cookie文件失败: {}", e))?;
    Ok(content.trim_start().starts_with('['))
}

fn score_cookie_file_candidate(
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

fn parse_cookie_metadata(content: &str) -> Result<Vec<CookieMeta>, String> {
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

fn cookie_expiration_secs(expiration_date: Option<f64>, session: Option<bool>) -> i64 {
    if session.unwrap_or(false) {
        0
    } else {
        expiration_date.unwrap_or(0.0) as i64
    }
}

fn is_fresh_cookie(expires: i64, now_secs: i64) -> bool {
    expires == 0 || expires > now_secs
}

fn is_relevant_cookie(cookie_file_name: &str, domain: &str) -> bool {
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

fn is_important_cookie(cookie_file_name: &str, name: &str) -> bool {
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

fn current_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn convert_json_cookie_file(path: &Path, temp_prefix: &str) -> Result<PathBuf, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("读取cookie文件失败: {}", e))?;
    let cookies: Vec<BrowserCookie> =
        serde_json::from_str(&content).map_err(|e| format!("解析cookie JSON失败: {}", e))?;

    let mut lines = vec![NETSCAPE_HEADER.to_string()];
    for cookie in cookies {
        let include_subdomains =
            if cookie.domain.starts_with('.') && !cookie.host_only.unwrap_or(false) {
                "TRUE"
            } else {
                "FALSE"
            };
        let path = cookie.path.unwrap_or_else(|| "/".to_string());
        let secure = if cookie.secure.unwrap_or(false) {
            "TRUE"
        } else {
            "FALSE"
        };
        let expires = if cookie.session.unwrap_or(false) {
            0
        } else {
            cookie.expiration_date.unwrap_or(0.0) as i64
        };

        lines.push(format!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}",
            cookie.domain, include_subdomains, path, secure, expires, cookie.name, cookie.value
        ));
    }

    let temp_cookie_path = std::env::temp_dir().join(format!(
        "{}-ytdlp-cookie-{}.txt",
        temp_prefix,
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&temp_cookie_path, lines.join("\n"))
        .map_err(|e| format!("写入临时cookie文件失败: {}", e))?;
    Ok(temp_cookie_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_fresh_douyin_cookie_above_expired_login_cookie() {
        let now = 1_800_000_000;
        let expired = r#"[
          {"domain":".douyin.com","name":"sessionid","value":"x","path":"/","expirationDate":1700000000,"hostOnly":false,"secure":true,"session":false}
        ]"#;
        let fresh = r#"[
          {"domain":".douyin.com","name":"ttwid","value":"x","path":"/","expirationDate":1900000000,"hostOnly":false,"secure":true,"session":false}
        ]"#;

        let expired_score = score_cookie_content(expired, "抖音cookie.txt", now).unwrap();
        let fresh_score = score_cookie_content(fresh, "抖音cookie.txt", now).unwrap();

        assert!(fresh_score > expired_score);
    }

    fn score_cookie_content(
        content: &str,
        cookie_file_name: &str,
        now_secs: i64,
    ) -> Result<CookieCandidateScore, String> {
        let cookies = parse_cookie_metadata(content)?;
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
            modified_secs: 0,
        })
    }
}
