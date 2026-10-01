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


mod location;
use location::*;
mod metadata;
use metadata::*;
mod conversion;
use conversion::*;

#[cfg(test)]
mod tests;
