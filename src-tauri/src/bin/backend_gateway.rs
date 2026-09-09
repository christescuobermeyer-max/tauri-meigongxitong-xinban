#[path = "../admin_user.rs"]
mod admin_user;
#[path = "../api.rs"]
mod api;
#[path = "../api_key_billing.rs"]
mod api_key_billing;
#[path = "../api_validation.rs"]
mod api_validation;
#[path = "../apimart.rs"]
mod apimart;
#[path = "../apimart_reference.rs"]
mod apimart_reference;
#[path = "../apimart_task.rs"]
mod apimart_task;
#[path = "../apimart_task_store.rs"]
mod apimart_task_store;
#[path = "../brand_story.rs"]
mod brand_story;
#[path = "../brand_story_clients.rs"]
mod brand_story_clients;
#[path = "../env_config.rs"]
mod env_config;
#[path = "../gateway_limiter.rs"]
mod gateway_limiter;
#[path = "../gateway_pause_state.rs"]
mod gateway_pause_state;
#[path = "../gateway_queue.rs"]
mod gateway_queue;
#[path = "../gemini_response.rs"]
mod gemini_response;
#[path = "../http_client.rs"]
mod http_client;
#[path = "../image_api_response.rs"]
mod image_api_response;
#[path = "../image_generation_payload.rs"]
mod image_generation_payload;
#[path = "../image_proc.rs"]
mod image_proc;
#[path = "../image_provider.rs"]
mod image_provider;
#[path = "../line_health.rs"]
mod line_health;
#[path = "../manxiaobai_edit.rs"]
mod manxiaobai_edit;
#[path = "../novaeworld_edit.rs"]
mod novaeworld_edit;
#[path = "../oss.rs"]
mod oss;
#[path = "../pockgo_chat.rs"]
mod pockgo_chat;
#[path = "../pockgo_transport.rs"]
mod pockgo_transport;
#[path = "../reference_image.rs"]
mod reference_image;
#[path = "../vectorengine_edit.rs"]
mod vectorengine_edit;
#[path = "../yunwu_edit.rs"]
mod yunwu_edit;

use apimart_task_store::{ApimartTaskStore, PendingApimartTask};
use axum::{
    extract::State,
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Datelike;
use image_provider::{resolve_image_provider, ImageApiLine};
use serde::Serialize;
use serde_json::json;
use std::{
    collections::{HashMap, HashSet},
    env,
    net::SocketAddr,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;
use tower_http::cors::{Any, CorsLayer};

use gateway_limiter::{generation_size_for_line, GatewayLimiter};
use gateway_pause_state::{PauseStateRegistry, PausedLineInfo};
use gateway_queue::{GatewayGenerationQueue, QueuedGenerationPermit};
use line_health::{LineHealthRegistry, LineHealthSnapshot};

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    supabase_url: String,
    supabase_anon_key: String,
    supabase_service_role_key: Option<String>,
    line_health: Arc<LineHealthRegistry>,
    generation_queue: Arc<GatewayGenerationQueue>,
    oss_archive_limiter: Arc<Semaphore>,
    pause_state: Arc<PauseStateRegistry>,
    apimart_tasks: Arc<ApimartTaskStore>,
}

#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
}

const DOUYIN_COOKIE_FILE_NAME: &str = "抖音cookie.txt";
const DOUYIN_BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const NETSCAPE_COOKIE_HEADER: &str = "# Netscape HTTP Cookie File";

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(serde::Deserialize)]
struct ParseDouyinVideoRequest {
    share_text: String,
}

#[derive(Serialize)]
struct ParsedVideoInfo {
    #[serde(rename = "videoUrl")]
    video_url: String,
    title: String,
    author: String,
    platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    headers: Option<HashMap<String, String>>,
}

#[derive(Debug, serde::Deserialize)]
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

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
enum ResultDelivery {
    #[default]
    InlineBase64,
    OssUrl,
}

#[derive(Serialize)]
struct GenerateImageResponse {
    image: Option<String>,
    image_url: Option<String>,
    result_delivery: ResultDelivery,
    generation_line: String,
    archive_url: Option<String>,
    archive_key: Option<String>,
    archive_error: Option<String>,
    history_recorded: Option<bool>,
    history_error: Option<String>,
}

#[derive(serde::Deserialize)]
struct GatewayGenerateImageRequest {
    prompt: String,
    size: String,
    product_images: Vec<String>,
    #[serde(default)]
    result_delivery: ResultDelivery,
    #[serde(default)]
    archive: Option<ArchiveGeneratedImageRequest>,
}

struct DeliveredImage {
    image: Option<String>,
    image_url: Option<String>,
    result_delivery: ResultDelivery,
}

#[derive(Clone, serde::Deserialize)]
struct ArchiveGeneratedImageRequest {
    asset_kind: String,
    file_name_stem: String,
    #[serde(default)]
    shop_name: Option<String>,
    #[serde(default)]
    platform: Option<String>,
}

struct ArchiveGeneratedImageResult {
    url: String,
    key: String,
}

#[tokio::main]
async fn main() -> Result<(), String> {
    dotenvy::from_filename(".env.local").ok();
    dotenvy::from_filename(".env").ok();

    let state = build_state()?;
    start_apimart_recovery_worker(state.clone());
    let app = build_router(state);
    let addr = gateway_addr()?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|error| format!("启动后端网关失败：{error}"))?;

    eprintln!("[backend-gateway] listening on http://{addr}");
    axum::serve(listener, app)
        .await
        .map_err(|error| format!("后端网关运行失败：{error}"))
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/generate-image", post(generate_image))
        .route("/api/video/parse-douyin", post(parse_douyin_video))
        .route("/api/line-health", get(get_line_health))
        .route("/api/gateway-stats", get(gateway_stats))
        .route("/api/admin/gateway-stats", get(admin_gateway_stats))
        .route("/api/admin/balance", post(admin_balance_fetch))
        .route(
            "/api/admin/account-generation-summary",
            get(admin_account_generation_summary),
        )
        .route("/api/upload-image-to-oss", post(upload_image_to_oss))
        .route("/api/oss-presigned-urls", post(oss_presigned_urls))
        .route(
            "/api/global-generation-total",
            post(global_generation_total),
        )
        .route("/api/admin-create-user", post(admin_create_user))
        .route("/api/admin-soft-delete-user", post(admin_soft_delete_user))
        .route("/api/admin/line-pause", post(admin_line_pause))
        .route("/api/admin/line-resume", post(admin_line_resume))
        .route(
            "/api/brand-story-generate-text",
            post(brand_story_generate_text),
        )
        .route(
            "/api/brand-story-thread-availability",
            get(brand_story_thread_availability),
        )
        .layer(cors_layer())
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "csgh-backend-gateway",
    })
}

async fn parse_douyin_video(
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

async fn parse_douyin_video_with_ytdlp(share_text: String) -> Result<ParsedVideoInfo, String> {
    tokio::task::spawn_blocking(move || parse_douyin_video_with_ytdlp_blocking(&share_text))
        .await
        .map_err(|error| format!("抖音解析任务异常：{error}"))?
}

fn parse_douyin_video_with_ytdlp_blocking(share_text: &str) -> Result<ParsedVideoInfo, String> {
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

fn resolve_gateway_ytdlp_command(ytdlp_path: &Path) -> (PathBuf, Vec<String>) {
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

fn resolve_gateway_ytdlp_path() -> PathBuf {
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

fn prepare_gateway_douyin_cookie_args() -> Result<(Vec<String>, Option<PathBuf>, bool), String> {
    let Some(source_path) = locate_gateway_douyin_cookie_file()? else {
        return Ok((Vec::new(), None, false));
    };

    let temp_cookie_path = if is_json_cookie_file(&source_path)? {
        convert_json_cookie_file(&source_path, "douyin-gateway")?
    } else {
        copy_cookie_file_to_temp(&source_path, "douyin-gateway")?
    };

    Ok((
        vec![
            "--cookies".to_string(),
            temp_cookie_path.to_string_lossy().to_string(),
        ],
        Some(temp_cookie_path),
        true,
    ))
}

fn locate_gateway_douyin_cookie_file() -> Result<Option<PathBuf>, String> {
    for env_name in ["DOUYIN_COOKIE_PATH", "GATEWAY_DOUYIN_COOKIE_PATH"] {
        if let Ok(value) = env::var(env_name) {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            let path = PathBuf::from(trimmed);
            if path.exists() {
                return Ok(Some(path));
            }
            return Err(format!("{} 指向的抖音cookie文件不存在", env_name));
        }
    }

    let mut candidates = vec![
        PathBuf::from("/opt/csgh-gateway/secrets").join(DOUYIN_COOKIE_FILE_NAME),
        PathBuf::from("/opt/csgh-image-studio").join(DOUYIN_COOKIE_FILE_NAME),
    ];
    if let Ok(current_dir) = env::current_dir() {
        for dir in current_dir.ancestors().take(6) {
            candidates.push(dir.join(DOUYIN_COOKIE_FILE_NAME));
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for dir in exe_dir.ancestors().take(6) {
                candidates.push(dir.join(DOUYIN_COOKIE_FILE_NAME));
                candidates.push(dir.join("secrets").join(DOUYIN_COOKIE_FILE_NAME));
            }
        }
    }

    Ok(candidates.into_iter().find(|path| path.exists()))
}

fn is_json_cookie_file(path: &Path) -> Result<bool, String> {
    let content =
        std::fs::read_to_string(path).map_err(|error| format!("读取cookie文件失败：{error}"))?;
    Ok(content.trim_start().starts_with('['))
}

fn convert_json_cookie_file(path: &Path, temp_prefix: &str) -> Result<PathBuf, String> {
    let content =
        std::fs::read_to_string(path).map_err(|error| format!("读取cookie文件失败：{error}"))?;
    let cookies: Vec<BrowserCookie> =
        serde_json::from_str(&content).map_err(|error| format!("解析cookie JSON失败：{error}"))?;

    let mut lines = vec![NETSCAPE_COOKIE_HEADER.to_string()];
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

    let temp_cookie_path = env::temp_dir().join(format!(
        "{}-ytdlp-cookie-{}.txt",
        temp_prefix,
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&temp_cookie_path, lines.join("\n"))
        .map_err(|error| format!("写入临时cookie文件失败：{error}"))?;
    Ok(temp_cookie_path)
}

fn copy_cookie_file_to_temp(path: &Path, temp_prefix: &str) -> Result<PathBuf, String> {
    let temp_cookie_path = env::temp_dir().join(format!(
        "{}-ytdlp-cookie-{}.txt",
        temp_prefix,
        uuid::Uuid::new_v4()
    ));
    // yt-dlp writes cookies back on exit; production keeps secrets read-only via systemd.
    std::fs::copy(path, &temp_cookie_path)
        .map_err(|error| format!("复制临时cookie文件失败：{error}"))?;
    Ok(temp_cookie_path)
}

fn cleanup_temp_cookie_file(temp_cookie_path: Option<PathBuf>) {
    if let Some(path) = temp_cookie_path {
        let _ = std::fs::remove_file(path);
    }
}

fn extract_share_url(share_text: &str, predicate: fn(&str) -> bool) -> Option<String> {
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

fn normalize_share_url(url: &str) -> String {
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

fn is_douyin_url(url: &str) -> bool {
    url.contains("douyin.com/") || url.contains("iesdouyin.com/")
}

fn parse_ytdlp_json(json_str: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str(json_str).or_else(|_| {
        json_str
            .lines()
            .find_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
            .ok_or_else(|| "无法解析yt-dlp JSON输出".to_string())
    })
}

fn extract_url_from_ytdlp_value(value: &serde_json::Value) -> Result<String, String> {
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

fn best_format_url(value: &serde_json::Value) -> Option<String> {
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

fn http_url_field(value: &serde_json::Value, key: &str) -> Option<String> {
    let url = value.get(key)?.as_str()?.trim();
    if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.to_string())
    } else {
        None
    }
}

fn is_probably_direct_video_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("http") && !lower.contains(".m3u8")
}

fn extract_title_from_ytdlp_value(value: &serde_json::Value) -> Option<String> {
    ["title", "fulltitle", "description"]
        .iter()
        .find_map(|key| value.get(*key)?.as_str())
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(|title| title.to_string())
}

fn extract_author_from_ytdlp_value(value: &serde_json::Value) -> Option<String> {
    ["uploader", "creator", "channel", "uploader_id"]
        .iter()
        .find_map(|key| value.get(*key)?.as_str())
        .map(str::trim)
        .filter(|author| !author.is_empty())
        .map(|author| author.to_string())
}

fn extract_safe_http_headers_from_ytdlp_value(
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

fn merge_safe_http_headers(
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

fn is_safe_video_download_header(name: &str) -> bool {
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

/// 生图请求最多尝试的线路数。
/// 当前共有 6 条运行线路，设为 6 意味着失败时最多依次试遍所有线路。
const GENERATE_IMAGE_MAX_ATTEMPTS: usize = 6;

async fn generate_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<GatewayGenerateImageRequest>,
) -> Result<Json<GenerateImageResponse>, GatewayError> {
    let token = bearer_token(&headers)?.to_string();
    let user_id = verify_access_token(&state, &headers).await?;
    validate_result_delivery_request(&req)?;

    let original_size = req.size.clone();

    let mut tried_lines: HashSet<String> = HashSet::new();
    let mut last_error: Option<String> = None;
    let mut last_line: Option<String> = None;

    for attempt in 0..GENERATE_IMAGE_MAX_ATTEMPTS {
        let permit =
            match acquire_generation_permit(&state, &original_size, &user_id, &tried_lines).await {
                Ok(p) => p,
                Err(err) => {
                    // 拿不到 permit 通常意味着所有可用线路都尝试过/全 Red。
                    if attempt == 0 {
                        return Err(err);
                    }
                    break;
                }
            };

        let line = permit.line;
        let line_str = line.as_str().to_string();
        tried_lines.insert(line_str.clone());
        last_line = Some(line_str.clone());

        let mapped_size = match generation_size_for_line(line.as_str(), &original_size) {
            Some(s) => s.into_owned(),
            None => {
                return Err(GatewayError::bad_request(format!(
                    "{} 不支持尺寸：{}",
                    line.as_str(),
                    original_size
                )));
            }
        };
        let attempt_req = api::GenerateRequest {
            prompt: req.prompt.clone(),
            size: mapped_size,
            product_images: req.product_images.clone(),
            api_line: line,
        };

        let started = Instant::now();
        let result =
            generate_image_for_gateway(&state, &attempt_req, req.archive.as_ref(), &user_id).await;
        let latency_ms = started.elapsed().as_millis() as u64;
        state
            .line_health
            .record(line.as_str(), latency_ms, result.is_ok());

        match result {
            Ok(generated) => {
                if attempt > 0 {
                    eprintln!(
                        "[gateway] generate_image succeeded on {} after {} retry(ies)",
                        line.as_str(),
                        attempt
                    );
                }
                drop(permit);
                let archive_result = if let Some(archive_req) = req.archive.as_ref() {
                    Some(
                        archive_generated_image(&state, archive_req.clone(), &generated.image)
                            .await,
                    )
                } else {
                    None
                };
                let mut history_recorded = None;
                let mut history_error = None;
                let (archive_url, archive_key, archive_error) = match archive_result {
                    Some(Ok(archive)) => {
                        if let Some(archive_req) = req.archive.as_ref() {
                            match record_generation_log(
                                &state,
                                &token,
                                &user_id,
                                archive_req,
                                line.as_str(),
                                &archive,
                                latency_ms,
                            )
                            .await
                            {
                                Ok(()) => {
                                    history_recorded = Some(true);
                                    if let Some(task_id) = generated.apimart_task_id.as_deref() {
                                        if let Err(error) =
                                            state.apimart_tasks.remove(task_id).await
                                        {
                                            eprintln!(
                                                "[apimart-recovery] remove completed task failed task_id={task_id}: {error}"
                                            );
                                        }
                                    }
                                }
                                Err(error) => {
                                    eprintln!(
                                        "[gateway] insert generation_log failed on {}: {}",
                                        line.as_str(),
                                        error
                                    );
                                    history_recorded = Some(false);
                                    history_error = Some(error);
                                }
                            }
                        }
                        (Some(archive.url), Some(archive.key), None)
                    }
                    Some(Err(error)) => {
                        eprintln!(
                            "[gateway] archive generated image failed on {}: {}",
                            line.as_str(),
                            error
                        );
                        (None, None, Some(error))
                    }
                    None => (None, None, None),
                };
                let delivered = select_result_delivery(
                    req.result_delivery,
                    generated.image,
                    archive_url.clone(),
                );
                return Ok(Json(GenerateImageResponse {
                    image: delivered.image,
                    image_url: delivered.image_url,
                    result_delivery: delivered.result_delivery,
                    generation_line: line_str,
                    archive_url,
                    archive_key,
                    archive_error,
                    history_recorded,
                    history_error,
                }));
            }
            Err(err) => {
                eprintln!(
                    "[gateway] generate_image attempt {}/{} failed on {}: {}",
                    attempt + 1,
                    GENERATE_IMAGE_MAX_ATTEMPTS,
                    line.as_str(),
                    err
                );
                if is_quota_exhausted_error(&err) {
                    let paused = state.pause_state.pause(
                        line.as_str().to_string(),
                        "upstream_quota_exhausted".to_string(),
                        "gateway_auto_pause".to_string(),
                    );
                    eprintln!(
                        "[gateway] auto-paused {} after upstream quota exhaustion: {}",
                        paused.line, err
                    );
                }
                last_error = Some(err);
                // permit 在这里 drop，释放 slot；下一次循环会重新 acquire 排除已试过的线路
                continue;
            }
        }
    }

    let line_tag = last_line.unwrap_or_else(|| "(unknown)".to_string());
    let detail = last_error.unwrap_or_else(|| "no upstream error captured".to_string());
    Err(GatewayError::bad_gateway(format!(
        "生图失败：已尝试 {} 条线路均未成功，最后线路 {}：{}",
        tried_lines.len(),
        line_tag,
        detail
    )))
}

fn validate_result_delivery_request(req: &GatewayGenerateImageRequest) -> Result<(), GatewayError> {
    if req.result_delivery == ResultDelivery::OssUrl && req.archive.is_none() {
        return Err(GatewayError::bad_request(
            "result_delivery=oss_url 时必须提供 archive 归档参数",
        ));
    }
    Ok(())
}

fn select_result_delivery(
    requested: ResultDelivery,
    image: String,
    archive_url: Option<String>,
) -> DeliveredImage {
    let usable_archive_url = archive_url.filter(|url| !url.trim().is_empty());
    if requested == ResultDelivery::OssUrl {
        if let Some(image_url) = usable_archive_url {
            return DeliveredImage {
                image: None,
                image_url: Some(image_url),
                result_delivery: ResultDelivery::OssUrl,
            };
        }
    }

    DeliveredImage {
        image: Some(image),
        image_url: None,
        result_delivery: ResultDelivery::InlineBase64,
    }
}

struct GeneratedImageOutcome {
    image: String,
    apimart_task_id: Option<String>,
}

async fn generate_image_for_gateway(
    state: &AppState,
    req: &api::GenerateRequest,
    archive_req: Option<&ArchiveGeneratedImageRequest>,
    user_id: &str,
) -> Result<GeneratedImageOutcome, String> {
    if req.api_line != ImageApiLine::Line5 || archive_req.and_then(history_metadata).is_none() {
        let image = api::generate_image(req.clone()).await?;
        return Ok(GeneratedImageOutcome {
            image,
            apimart_task_id: None,
        });
    }

    api_validation::validate_generate_request(req)?;
    let provider = resolve_image_provider(req.api_line);
    log_gateway_generate_request(req, provider.log_label);
    let api_key = env_config::read_required_env(provider.api_key_env_keys)?;
    let client = http_client::build_api_client("image-2")?;
    reference_image::log_reference_image_diagnostics(&client, &req.product_images).await;

    let archive_req = archive_req.expect("checked above");
    let (shop_name, platform) = history_metadata(archive_req).expect("checked above");
    let store = Arc::clone(&state.apimart_tasks);
    let user_id = user_id.to_string();
    let asset_kind = archive_req.asset_kind.clone();
    let file_name_stem = archive_req.file_name_stem.clone();
    let started_at_ms = chrono::Utc::now().timestamp_millis();

    let generation_line = req.api_line.as_str().to_string();
    let remember = move |task_id| {
        let store = Arc::clone(&store);
        let task = PendingApimartTask {
            task_id,
            user_id,
            shop_name,
            asset_kind,
            platform,
            file_name_stem,
            generation_line,
            started_at_ms,
        };
        async move { remember_apimart_task(store, task).await }
    };
    let (image, task_id) = apimart::generate_apimart_image_with_task_hook(
        &client,
        provider.api_url,
        &api_key,
        provider.model,
        &req.prompt,
        &req.size,
        &req.product_images,
        remember,
    )
    .await?;
    let download_msg = "下载线路5 APIMart远端图片失败";
    let image = reference_image::download_image_if_url(&client, image, download_msg).await?;

    Ok(GeneratedImageOutcome {
        image,
        apimart_task_id: Some(task_id),
    })
}

async fn remember_apimart_task(
    store: Arc<ApimartTaskStore>,
    task: PendingApimartTask,
) -> Result<(), String> {
    let task_id = task.task_id.clone();
    store.insert(task).await?;
    eprintln!("[apimart-recovery] remembered task_id={task_id}");
    Ok(())
}

fn log_gateway_generate_request(req: &api::GenerateRequest, log_label: &str) {
    let refs = req
        .product_images
        .iter()
        .map(|image| {
            format!(
                "{}:{}",
                reference_image::reference_image_type(image),
                image.len()
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    eprintln!(
        "[{}] image_count={} image_refs=[{}] prompt_chars={} size={}",
        log_label,
        req.product_images.len(),
        refs,
        req.prompt.chars().count(),
        req.size
    );
}

async fn archive_generated_image(
    state: &AppState,
    req: ArchiveGeneratedImageRequest,
    raw_base64: &str,
) -> Result<ArchiveGeneratedImageResult, String> {
    let _permit = state
        .oss_archive_limiter
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "OSS 归档队列已关闭".to_string())?;
    let config = compression_config_for_asset_kind(&req.asset_kind)?;
    let compressed =
        image_proc::compress_generated_image(image_proc::CompressGeneratedImageRequest {
            base64_data: raw_base64.to_string(),
            max_dimension: config.max_dimension,
            quality: config.quality,
        })
        .await?;
    let uploaded = oss::upload_image_to_oss(oss::UploadImageToOssRequest {
        base64_data: compressed.base64_data,
        mime_type: Some(compressed.mime_type),
        folder: "generated".to_string(),
        file_name: Some(format!("{}.jpg", req.file_name_stem)),
    })
    .await?;

    Ok(ArchiveGeneratedImageResult {
        url: uploaded.url,
        key: uploaded.key,
    })
}

async fn record_generation_log(
    state: &AppState,
    user_token: &str,
    user_id: &str,
    req: &ArchiveGeneratedImageRequest,
    generation_line: &str,
    archive: &ArchiveGeneratedImageResult,
    elapsed_ms: u64,
) -> Result<(), String> {
    let (shop_name, platform) = history_metadata(req)
        .ok_or_else(|| "缺少 shop_name/platform，网关无法写入云端生图记录".to_string())?;
    record_generation_log_with_auth(
        state,
        Some(user_token),
        user_id,
        &shop_name,
        &req.asset_kind,
        &platform,
        generation_line,
        archive,
        elapsed_ms,
    )
    .await
}

async fn record_generation_log_with_auth(
    state: &AppState,
    user_token: Option<&str>,
    user_id: &str,
    shop_name: &str,
    asset_kind: &str,
    platform: &str,
    generation_line: &str,
    archive: &ArchiveGeneratedImageResult,
    elapsed_ms: u64,
) -> Result<(), String> {
    let (api_key, bearer) = match state.supabase_service_role_key.as_deref() {
        Some(service_key) if !service_key.trim().is_empty() => (service_key, service_key),
        _ => (
            state.supabase_anon_key.as_str(),
            user_token.ok_or_else(|| {
                "缺少 SUPABASE_SERVICE_ROLE_KEY，无法恢复写入历史记录".to_string()
            })?,
        ),
    };
    let response = state
        .client
        .post(format!("{}/rest/v1/generation_logs", state.supabase_url))
        .header("apikey", api_key)
        .bearer_auth(bearer)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&json!({
            "user_id": user_id,
            "shop_name": normalize_shop_name(shop_name),
            "asset_kind": asset_kind,
            "platform": platform,
            "generation_line": generation_line,
            "oss_url": archive.url,
            "oss_key": archive.key,
            "elapsed_ms": elapsed_ms,
        }))
        .send()
        .await
        .map_err(|error| format!("请求 Supabase 写入 generation_logs 失败：{error}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(format!(
        "Supabase 写入 generation_logs 返回 {status}: {}",
        gemini_response::truncate_for_msg(&body, 500)
    ))
}

fn history_metadata(req: &ArchiveGeneratedImageRequest) -> Option<(String, String)> {
    let platform = req.platform.as_deref()?.trim();
    if !matches!(platform, "meituan" | "taobao") {
        return None;
    }
    Some((
        normalize_shop_name(req.shop_name.as_deref().unwrap_or("")),
        platform.to_string(),
    ))
}

fn normalize_shop_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "未命名店铺".to_string()
    } else {
        trimmed.to_string()
    }
}

const APIMART_RECOVERY_INTERVAL_SECS: u64 = 60;
const APIMART_RECOVERY_MIN_AGE_MS: i64 = 5 * 60 * 1000;

fn start_apimart_recovery_worker(state: AppState) {
    tokio::spawn(async move {
        loop {
            if let Err(error) = recover_pending_apimart_tasks(&state).await {
                eprintln!("[apimart-recovery] worker error: {error}");
            }
            tokio::time::sleep(Duration::from_secs(APIMART_RECOVERY_INTERVAL_SECS)).await;
        }
    });
}

async fn recover_pending_apimart_tasks(state: &AppState) -> Result<(), String> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let tasks = state
        .apimart_tasks
        .list()
        .await
        .into_iter()
        .filter(|task| now_ms.saturating_sub(task.started_at_ms) >= APIMART_RECOVERY_MIN_AGE_MS)
        .collect::<Vec<_>>();
    if tasks.is_empty() {
        return Ok(());
    }

    let client = http_client::build_api_client("image-2")?;
    eprintln!(
        "[apimart-recovery] scanning {} pending task(s)",
        tasks.len()
    );

    for task in tasks {
        let task_id = task.task_id.clone();
        let provider = resolve_image_provider(ImageApiLine::Line5);
        let api_key = env_config::read_required_env(provider.api_key_env_keys)?;
        match recover_apimart_task(state, &client, &api_key, task).await {
            Ok(()) => {
                if let Err(error) = state.apimart_tasks.remove(&task_id).await {
                    eprintln!(
                        "[apimart-recovery] remove recovered task failed task_id={task_id}: {error}"
                    );
                }
            }
            Err(error) => {
                eprintln!("[apimart-recovery] task_id={task_id} failed: {error}");
                if is_terminal_apimart_recovery_error(&error) {
                    if let Err(remove_error) = state.apimart_tasks.remove(&task_id).await {
                        eprintln!(
                            "[apimart-recovery] remove terminal task failed task_id={task_id}: {remove_error}"
                        );
                    }
                }
            }
        }
    }
    Ok(())
}

async fn recover_apimart_task(
    state: &AppState,
    client: &reqwest::Client,
    api_key: &str,
    task: PendingApimartTask,
) -> Result<(), String> {
    let image = apimart_task::poll_apimart_task(client, api_key, &task.task_id).await?;
    let download_msg = "恢复下载线路5 APIMart远端图片失败";
    let image = reference_image::download_image_if_url(client, image, download_msg).await?;
    let archive_req = ArchiveGeneratedImageRequest {
        asset_kind: task.asset_kind.clone(),
        file_name_stem: task.file_name_stem.clone(),
        shop_name: Some(task.shop_name.clone()),
        platform: Some(task.platform.clone()),
    };
    let archive = archive_generated_image(state, archive_req, &image).await?;
    let elapsed_ms = chrono::Utc::now()
        .timestamp_millis()
        .saturating_sub(task.started_at_ms)
        .max(0) as u64;
    record_generation_log_with_auth(
        state,
        None,
        &task.user_id,
        &task.shop_name,
        &task.asset_kind,
        &task.platform,
        &task.generation_line,
        &archive,
        elapsed_ms,
    )
    .await?;
    eprintln!(
        "[apimart-recovery] recovered task_id={} oss_key={}",
        task.task_id, archive.key
    );
    Ok(())
}

fn is_terminal_apimart_recovery_error(error: &str) -> bool {
    error.contains("线路5 APIMart任务失败")
        || error.contains("线路5 APIMart任务已完成但未找到图片")
        || error.contains("404")
}

struct ArchiveCompressionConfig {
    max_dimension: u32,
    quality: u8,
}

fn compression_config_for_asset_kind(kind: &str) -> Result<ArchiveCompressionConfig, String> {
    let config = match kind {
        "avatar" => ArchiveCompressionConfig {
            max_dimension: 1024,
            quality: 90,
        },
        "storefront" => ArchiveCompressionConfig {
            max_dimension: 1536,
            quality: 90,
        },
        "poster" => ArchiveCompressionConfig {
            max_dimension: 2048,
            quality: 92,
        },
        "p_signboard" => ArchiveCompressionConfig {
            max_dimension: 1792,
            quality: 92,
        },
        "product" => ArchiveCompressionConfig {
            max_dimension: 1024,
            quality: 90,
        },
        "picture_wall" => ArchiveCompressionConfig {
            max_dimension: 1536,
            quality: 92,
        },
        "detail_page" => ArchiveCompressionConfig {
            max_dimension: 2048,
            quality: 92,
        },
        "brand_story" | "data_analysis" | "patrol_script" => ArchiveCompressionConfig {
            max_dimension: 1792,
            quality: 90,
        },
        _ => return Err(format!("不支持的归档图片类型：{kind}")),
    };
    Ok(config)
}

async fn get_line_health(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LineHealthSnapshot>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    Ok(Json(state.line_health.snapshot()))
}

#[derive(Serialize)]
struct GlobalGenerationTotalResponse {
    total_count: i64,
}

async fn global_generation_total(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GlobalGenerationTotalResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    let total_count = fetch_global_generation_total(&state, token).await?;
    Ok(Json(GlobalGenerationTotalResponse { total_count }))
}

async fn fetch_global_generation_total(
    state: &AppState,
    user_token: &str,
) -> Result<i64, GatewayError> {
    let (api_key, bearer) = match state.supabase_service_role_key.as_deref() {
        Some(service_key) if !service_key.trim().is_empty() => (service_key, service_key),
        _ => (state.supabase_anon_key.as_str(), user_token),
    };
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/generation_totals?select=total_count",
            state.supabase_url
        ))
        .header("apikey", api_key)
        .bearer_auth(bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取累计生图失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取累计生图返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析累计生图失败：{error}")))?;
    Ok(rows
        .iter()
        .filter_map(|row| row.get("total_count").and_then(|value| value.as_i64()))
        .sum())
}

#[derive(Serialize)]
struct AccountGenerationSummaryResponse {
    month_start: String,
    month_end: String,
    accounts: Vec<AccountGenerationSummaryRow>,
}

#[derive(Serialize)]
struct AccountGenerationSummaryRow {
    user_id: String,
    display_name: String,
    role: String,
    is_active: bool,
    created_at: Option<String>,
    last_login_at: Option<String>,
    total_count: i64,
    month_count: i64,
}

struct AccountProfileSummary {
    user_id: String,
    display_name: String,
    role: String,
    is_active: bool,
    created_at: Option<String>,
    last_login_at: Option<String>,
}

async fn admin_account_generation_summary(
    State(state): State<AppState>,
) -> Result<Json<AccountGenerationSummaryResponse>, GatewayError> {
    let service_role_bearer = service_role_bearer(&state)?;
    let profiles = fetch_account_generation_profiles(&state, service_role_bearer).await?;
    let totals = fetch_account_generation_totals(&state, service_role_bearer).await?;
    let (month_start, month_end, stat_month) = current_shanghai_month_range();
    let month_counts =
        fetch_account_generation_month_counts(&state, service_role_bearer, &stat_month).await?;

    let accounts = profiles
        .into_iter()
        .map(|profile| AccountGenerationSummaryRow {
            total_count: totals.get(&profile.user_id).copied().unwrap_or(0),
            month_count: month_counts.get(&profile.user_id).copied().unwrap_or(0),
            user_id: profile.user_id,
            display_name: profile.display_name,
            role: profile.role,
            is_active: profile.is_active,
            created_at: profile.created_at,
            last_login_at: profile.last_login_at,
        })
        .collect();

    Ok(Json(AccountGenerationSummaryResponse {
        month_start,
        month_end,
        accounts,
    }))
}

async fn fetch_account_generation_profiles(
    state: &AppState,
    service_role_bearer: &str,
) -> Result<Vec<AccountProfileSummary>, GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/profiles?select=id,display_name,role,is_active,created_at,last_login_at&deleted_at=is.null&order=created_at.desc",
            state.supabase_url
        ))
        .header("apikey", service_role_bearer)
        .bearer_auth(service_role_bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取账号列表失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取账号列表返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析账号列表失败：{error}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let user_id = row.get("id").and_then(|value| value.as_str())?.to_string();
            let display_name = row
                .get("display_name")
                .and_then(|value| value.as_str())
                .unwrap_or("(无名)")
                .to_string();
            let role = row
                .get("role")
                .and_then(|value| value.as_str())
                .unwrap_or("user")
                .to_string();
            let is_active = row
                .get("is_active")
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            let created_at = row
                .get("created_at")
                .and_then(|value| value.as_str())
                .map(str::to_string);
            let last_login_at = row
                .get("last_login_at")
                .and_then(|value| value.as_str())
                .map(str::to_string);
            Some(AccountProfileSummary {
                user_id,
                display_name,
                role,
                is_active,
                created_at,
                last_login_at,
            })
        })
        .collect())
}

async fn fetch_account_generation_totals(
    state: &AppState,
    service_role_bearer: &str,
) -> Result<HashMap<String, i64>, GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/generation_totals?select=user_id,total_count",
            state.supabase_url
        ))
        .header("apikey", service_role_bearer)
        .bearer_auth(service_role_bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取账号累计生图失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取账号累计生图返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析账号累计生图失败：{error}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let user_id = row
                .get("user_id")
                .and_then(|value| value.as_str())?
                .to_string();
            let total_count = row
                .get("total_count")
                .and_then(|value| value.as_i64())
                .unwrap_or(0);
            Some((user_id, total_count))
        })
        .collect())
}

async fn fetch_account_generation_month_counts(
    state: &AppState,
    service_role_bearer: &str,
    stat_month: &str,
) -> Result<HashMap<String, i64>, GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/generation_monthly_totals?select=user_id,month_count&stat_month=eq.{}",
            state.supabase_url, stat_month
        ))
        .header("apikey", service_role_bearer)
        .bearer_auth(service_role_bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取本月生图失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取本月生图返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析本月生图失败：{error}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let user_id = row
                .get("user_id")
                .and_then(|value| value.as_str())?
                .to_string();
            let month_count = row
                .get("month_count")
                .and_then(|value| value.as_i64())
                .unwrap_or(0);
            Some((user_id, month_count))
        })
        .collect())
}

fn service_role_bearer(state: &AppState) -> Result<&str, GatewayError> {
    state
        .supabase_service_role_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            GatewayError::bad_gateway("未配置 SUPABASE_SERVICE_ROLE_KEY，无法公开读取账号生图统计")
        })
}

fn current_shanghai_month_range() -> (String, String, String) {
    let now = chrono::Utc::now();
    let shanghai_now = now + chrono::Duration::hours(8);
    let start_naive = shanghai_now
        .date_naive()
        .with_day(1)
        .expect("valid first day of month")
        .and_hms_opt(0, 0, 0)
        .expect("valid month start time");
    let end_naive = if start_naive.month() == 12 {
        chrono::NaiveDate::from_ymd_opt(start_naive.year() + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(start_naive.year(), start_naive.month() + 1, 1)
    }
    .expect("valid next month")
    .and_hms_opt(0, 0, 0)
    .expect("valid month end time");
    let month_start = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
        start_naive - chrono::Duration::hours(8),
        chrono::Utc,
    );
    let month_end = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
        end_naive - chrono::Duration::hours(8),
        chrono::Utc,
    );
    let stat_month = start_naive.date().format("%Y-%m-%d").to_string();
    (
        month_start.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        month_end.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        stat_month,
    )
}

#[derive(Serialize)]
struct GatewayStatsResponse {
    /// 当前网关进程内存视角的运行快照
    queue: gateway_queue::GatewayQueueSnapshot,
    /// 每条线路最近的健康度（环形缓冲计算结果）
    health: LineHealthSnapshot,
    /// user_id → display_name，用于前端展示
    display_names: HashMap<String, String>,
    /// 服务器当前时间（ISO8601 UTC），供前端校准"等待 N 秒"
    server_time: String,
    /// 当前被暂停的线路（余额为 0 等原因），auto 路由会自动排除，manual 选择会被拒
    paused_lines: Vec<PausedLineInfo>,
}

async fn gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GatewayStatsResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    let service_role = service_role_bearer(&state)?;
    let response = build_gateway_stats_response(&state, service_role, service_role).await?;
    Ok(Json(response))
}

async fn admin_gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GatewayStatsResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let response = build_gateway_stats_response(&state, &state.supabase_anon_key, token).await?;
    Ok(Json(response))
}

async fn build_gateway_stats_response(
    state: &AppState,
    profiles_api_key: &str,
    profiles_bearer: &str,
) -> Result<GatewayStatsResponse, GatewayError> {
    let queue = state.generation_queue.snapshot();
    let health = state.line_health.snapshot();
    let paused_lines = state.pause_state.snapshot();

    // 收集快照里出现过的所有 user_id（在跑的 + 排队的）
    let mut user_ids: std::collections::HashSet<String> =
        queue.active_by_user.keys().cloned().collect();
    for ticket in &queue.waiting {
        user_ids.insert(ticket.user_id.clone());
    }
    let display_names = if user_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_display_names(state, profiles_api_key, profiles_bearer, &user_ids).await?
    };

    let server_time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    Ok(GatewayStatsResponse {
        queue,
        health,
        display_names,
        server_time,
        paused_lines,
    })
}

#[derive(serde::Deserialize)]
struct AdminBalanceFetchRequest {
    line: String,
}

#[derive(serde::Deserialize)]
struct AdminLinePauseRequest {
    line: String,
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    source: Option<String>,
}

#[derive(serde::Deserialize)]
struct AdminLineResumeRequest {
    line: String,
}

#[derive(Serialize)]
struct AdminLinePauseResponse {
    ok: bool,
    paused: PausedLineInfo,
}

#[derive(Serialize)]
struct AdminLineResumeResponse {
    ok: bool,
    /// true = 之前有暂停记录被移除；false = 没有记录（幂等）
    removed: bool,
}

async fn admin_line_pause(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AdminLinePauseRequest>,
) -> Result<Json<AdminLinePauseResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let line = validate_line_name(&req.line)?;
    let reason = req
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("manual")
        .to_string();
    let source = req
        .source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("manual")
        .to_string();
    let paused = state.pause_state.pause(line, reason, source);
    Ok(Json(AdminLinePauseResponse { ok: true, paused }))
}

async fn admin_line_resume(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AdminLineResumeRequest>,
) -> Result<Json<AdminLineResumeResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let line = validate_line_name(&req.line)?;
    let removed = state.pause_state.resume(&line);
    Ok(Json(AdminLineResumeResponse { ok: true, removed }))
}

async fn admin_balance_fetch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AdminBalanceFetchRequest>,
) -> Result<Json<serde_json::Value>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let line = validate_line_name(&req.line)?;
    if !api_key_billing::supports_api_key_billing_line(&line) {
        return Err(GatewayError::bad_request(format!(
            "{line} 暂不支持 API Key billing 余额查询"
        )));
    }

    api_key_billing::fetch_api_key_billing_balance_for_line(&state.client, &line)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

fn validate_line_name(raw: &str) -> Result<String, GatewayError> {
    let trimmed = raw.trim();
    if !matches!(
        trimmed,
        "line2" | "line3" | "line4" | "line5" | "line6" | "line7"
    ) {
        return Err(GatewayError::bad_request(format!(
            "不支持的线路名：{raw}（合法值 line2-line7）"
        )));
    }
    Ok(trimmed.to_string())
}

async fn ensure_admin_profile(
    state: &AppState,
    token: &str,
    user_id: &str,
) -> Result<(), GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/profiles?select=role,is_active&id=eq.{}",
            state.supabase_url, user_id
        ))
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("校验管理员身份失败：{error}")))?;
    if !response.status().is_success() {
        return Err(GatewayError::unauthorized("管理员身份校验失败，请重新登录"));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析管理员身份失败：{error}")))?;
    let row = rows
        .first()
        .ok_or_else(|| GatewayError::unauthorized("账号未找到"))?;
    let role = row.get("role").and_then(|v| v.as_str()).unwrap_or("");
    let is_active = row
        .get("is_active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !is_active {
        return Err(GatewayError::unauthorized("账号已被停用"));
    }
    if role != "admin" {
        return Err(GatewayError::unauthorized("仅管理员可访问网关监控"));
    }
    Ok(())
}

async fn fetch_display_names(
    state: &AppState,
    api_key: &str,
    bearer: &str,
    user_ids: &std::collections::HashSet<String>,
) -> Result<HashMap<String, String>, GatewayError> {
    // PostgREST 用 in.(...) 批量查
    let in_list = user_ids
        .iter()
        .map(|id| format!("\"{}\"", id))
        .collect::<Vec<_>>()
        .join(",");
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/profiles?select=id,display_name&id=in.({})",
            state.supabase_url, in_list
        ))
        .header("apikey", api_key)
        .bearer_auth(bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("拉取 display_name 失败：{error}")))?;
    if !response.status().is_success() {
        return Err(GatewayError::bad_gateway("拉取 display_name 返回非 2xx"));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析 display_name 失败：{error}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let id = row
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())?;
            let name = row
                .get("display_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "(无名)".to_string());
            Some((id, name))
        })
        .collect())
}

async fn upload_image_to_oss(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<oss::UploadImageToOssRequest>,
) -> Result<Json<oss::UploadImageToOssResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    oss::upload_image_to_oss(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

async fn oss_presigned_urls(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<oss::PresignOssUrlsRequest>,
) -> Result<Json<oss::PresignOssUrlsResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    oss::presign_oss_urls(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

async fn admin_create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<admin_user::AdminCreateUserRequest>,
) -> Result<Json<admin_user::AdminCreateUserResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;
    admin_user::admin_create_user(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_request)
}

async fn admin_soft_delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<admin_user::AdminSoftDeleteUserRequest>,
) -> Result<Json<admin_user::AdminSoftDeleteUserResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;
    admin_user::admin_soft_delete_user(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_request)
}

async fn brand_story_generate_text(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<brand_story::BrandStoryTextRequestInput>,
) -> Result<Json<brand_story::BrandCopy>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    brand_story::brand_story_generate_text(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

async fn brand_story_thread_availability() -> Json<brand_story::BrandStoryThreadAvailability> {
    Json(brand_story::brand_story_thread_availability())
}

async fn verify_access_token(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<String, GatewayError> {
    let token = bearer_token(headers)?;
    let response = state
        .client
        .get(format!("{}/auth/v1/user", state.supabase_url))
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("校验登录态失败：{error}")))?;

    if !response.status().is_success() {
        return Err(GatewayError::unauthorized("登录态无效或已过期，请重新登录"));
    }

    let user_json: serde_json::Value = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析登录态失败：{error}")))?;
    let user_id = user_json
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| GatewayError::unauthorized("登录态无效或已过期，请重新登录"))?;

    ensure_active_profile(state, token, user_id).await?;
    Ok(user_id.to_string())
}

async fn ensure_active_profile(
    state: &AppState,
    token: &str,
    user_id: &str,
) -> Result<(), GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/profiles?select=is_active&id=eq.{}",
            state.supabase_url, user_id
        ))
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("校验账号状态失败：{error}")))?;

    if !response.status().is_success() {
        return Err(GatewayError::unauthorized("账号状态校验失败，请重新登录"));
    }

    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析账号状态失败：{error}")))?;
    let is_active = rows
        .first()
        .and_then(|row| row.get("is_active"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    if is_active {
        Ok(())
    } else {
        Err(GatewayError::unauthorized("账号已被停用，请联系管理员"))
    }
}

fn bearer_token(headers: &HeaderMap) -> Result<&str, GatewayError> {
    let value = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| GatewayError::unauthorized("缺少 Authorization Bearer 登录凭证"))
}

fn build_state() -> Result<AppState, String> {
    let supabase_url = env_config::read_required_env(&["SUPABASE_URL", "VITE_SUPABASE_URL"])?
        .trim_end_matches('/')
        .to_string();
    let supabase_anon_key =
        env_config::read_required_env(&["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"])?;
    let supabase_service_role_key =
        env_config::read_required_env(&["SUPABASE_SERVICE_ROLE_KEY"]).ok();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(350))
        .build()
        .map_err(|error| format!("初始化后端网关 HTTP 客户端失败：{error}"))?;

    let line_health = Arc::new(LineHealthRegistry::new());

    // 线路暂停状态文件路径：默认 /opt/csgh-gateway/state/paused-lines.json
    // 可通过 GATEWAY_STATE_DIR 覆盖；未设置且默认目录不可写时退化为"仅内存"（进程重启状态丢）
    let pause_persist_path = pause_state_persist_path();
    let pause_state = Arc::new(PauseStateRegistry::new(pause_persist_path));
    let apimart_tasks = Arc::new(ApimartTaskStore::new(apimart_task_store_path()));

    Ok(AppState {
        client,
        supabase_url,
        supabase_anon_key,
        supabase_service_role_key,
        line_health: Arc::clone(&line_health),
        generation_queue: Arc::new(GatewayGenerationQueue::new(
            build_generation_limiter(),
            line_health,
            read_limit_env("GATEWAY_GENERATION_USER_LIMIT", 5),
        )),
        // 压缩 + OSS PUT 比生图轻得多（每张 < 2s），
        // 生图全局并发 28，归档要跟得上才不会成为瓶颈，默认开到 6。
        oss_archive_limiter: Arc::new(Semaphore::new(read_positive_limit_env(
            "GATEWAY_OSS_ARCHIVE_LIMIT",
            6,
        ))),
        pause_state,
        apimart_tasks,
    })
}

fn pause_state_persist_path() -> Option<std::path::PathBuf> {
    gateway_state_file_path("paused-lines.json")
}

fn apimart_task_store_path() -> Option<std::path::PathBuf> {
    gateway_state_file_path("apimart-pending-tasks.json")
}

fn gateway_state_file_path(file_name: &str) -> Option<PathBuf> {
    let dir =
        env::var("GATEWAY_STATE_DIR").unwrap_or_else(|_| "/opt/csgh-gateway/state".to_string());
    let dir = PathBuf::from(dir);
    // 试一下能不能 mkdir + 写入。失败就退化为 None（仅内存，重启会丢，但服务能正常启动）。
    if let Err(error) = std::fs::create_dir_all(&dir) {
        eprintln!(
            "[pause-state] 创建状态目录 {} 失败：{error}（暂停状态将仅保存在内存）",
            dir.display()
        );
        return None;
    }
    Some(dir.join(file_name))
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any)
}

fn gateway_addr() -> Result<SocketAddr, String> {
    let host = env::var("BACKEND_GATEWAY_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("BACKEND_GATEWAY_PORT").unwrap_or_else(|_| "8787".to_string());
    format!("{host}:{port}")
        .parse()
        .map_err(|error| format!("后端网关监听地址不合法：{error}"))
}

struct GenerationPermit {
    _permit: Option<QueuedGenerationPermit>,
    line: ImageApiLine,
}

impl Drop for GenerationPermit {
    fn drop(&mut self) {
        self._permit.take();
    }
}

async fn acquire_generation_permit(
    state: &AppState,
    size: &str,
    user_id: &str,
    exclude: &HashSet<String>,
) -> Result<GenerationPermit, GatewayError> {
    acquire_auto_generation_permit(state, size, user_id, exclude).await
}

async fn acquire_auto_generation_permit(
    state: &AppState,
    size: &str,
    user_id: &str,
    exclude: &HashSet<String>,
) -> Result<GenerationPermit, GatewayError> {
    // 桌面端余额监控发现余额为 0 时会调 /api/admin/line-pause 把线路加入 paused，
    // 这里把 paused 合并到本次 retry 的 exclude，自动路由就不会再考虑它们。
    let mut effective_exclude = exclude.clone();
    for paused in state.pause_state.paused_set() {
        effective_exclude.insert(paused);
    }
    let queued = state
        .generation_queue
        .acquire_auto_for_user_excluding(user_id, size, effective_exclude)
        .await
        .map_err(GatewayError::too_many_requests)?;
    let line = queued.line().to_string();
    Ok(GenerationPermit {
        _permit: Some(queued),
        line: ImageApiLine::from_str(&line).ok_or_else(|| {
            GatewayError::bad_gateway(format!("网关自动分配到了未知线路：{line}"))
        })?,
    })
}

fn build_generation_limiter() -> GatewayLimiter {
    GatewayLimiter::new(
        read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 28),
        HashMap::from([
            ("line2", read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 6)),
            ("line3", read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 6)),
            ("line4", read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 4)),
            // line5 = apimart，性价比高、最稳，并发 = 8
            ("line5", read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 8)),
            // line6 = manxiaobai，当前主力线路之一，并发 = 8
            ("line6", read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 8)),
            // line7 = novaeworld，OpenAI 兼容线路，并发 = 6
            ("line7", read_limit_env("GATEWAY_GENERATION_LINE7_LIMIT", 6)),
        ]),
    )
}

fn read_limit_env(name: &str, default: usize) -> usize {
    env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(default)
}

fn read_positive_limit_env(name: &str, default: usize) -> usize {
    read_limit_env(name, default).max(1)
}

fn is_quota_exhausted_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("insufficient_user_quota")
        || lower.contains("insufficient balance")
        || lower.contains("insufficient_quota")
        || error.contains("预扣费额度失败")
        || error.contains("用户剩余额度")
}

struct GatewayError {
    status: StatusCode,
    message: String,
}

impl GatewayError {
    fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.into(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn bad_gateway(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            message: message.into(),
        }
    }

    fn too_many_requests(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            message: message.into(),
        }
    }
}

impl IntoResponse for GatewayError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Uri;
    use std::sync::Mutex;

    #[derive(Clone, Debug)]
    struct RecordedRequest {
        path_and_query: String,
        apikey: String,
        authorization: String,
    }

    #[derive(Clone)]
    struct MockSupabaseState {
        active: bool,
        requests: Arc<Mutex<Vec<RecordedRequest>>>,
    }

    impl MockSupabaseState {
        fn new(active: bool) -> Self {
            Self {
                active,
                requests: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn record(&self, uri: &Uri, headers: &HeaderMap) {
            let value = |name: &str| {
                headers
                    .get(name)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or("")
                    .to_string()
            };
            self.requests
                .lock()
                .expect("mock supabase requests mutex poisoned")
                .push(RecordedRequest {
                    path_and_query: uri
                        .path_and_query()
                        .map(|value| value.as_str())
                        .unwrap_or(uri.path())
                        .to_string(),
                    apikey: value("apikey"),
                    authorization: value("authorization"),
                });
        }
    }

    async fn mock_auth_user(
        State(state): State<MockSupabaseState>,
        uri: Uri,
        headers: HeaderMap,
    ) -> Response {
        state.record(&uri, &headers);
        Json(json!({ "id": "user-1" })).into_response()
    }

    async fn mock_profiles(
        State(state): State<MockSupabaseState>,
        uri: Uri,
        headers: HeaderMap,
    ) -> Response {
        state.record(&uri, &headers);
        let query = uri.query().unwrap_or("");
        if query.contains("select=is_active") {
            Json(json!([{ "is_active": state.active }])).into_response()
        } else if query.contains("select=id,display_name") {
            Json(json!([{ "id": "user-1", "display_name": "运营甲" }])).into_response()
        } else {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "unexpected query" })),
            )
                .into_response()
        }
    }

    async fn spawn_app(app: Router) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test server");
        let address = listener.local_addr().expect("read test server address");
        let handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("test server should run");
        });
        (format!("http://{address}"), handle)
    }

    async fn spawn_mock_supabase(
        active: bool,
    ) -> (String, MockSupabaseState, tokio::task::JoinHandle<()>) {
        let state = MockSupabaseState::new(active);
        let app = Router::new()
            .route("/auth/v1/user", get(mock_auth_user))
            .route("/rest/v1/profiles", get(mock_profiles))
            .with_state(state.clone());
        let (base_url, handle) = spawn_app(app).await;
        (base_url, state, handle)
    }

    fn test_state(supabase_url: String, service_role: Option<&str>) -> AppState {
        let line_health = Arc::new(LineHealthRegistry::new());
        AppState {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(2))
                .build()
                .expect("build test HTTP client"),
            supabase_url,
            supabase_anon_key: "anon-key".to_string(),
            supabase_service_role_key: service_role.map(str::to_string),
            line_health: Arc::clone(&line_health),
            generation_queue: Arc::new(GatewayGenerationQueue::new(
                GatewayLimiter::new(2, HashMap::from([("line2", 2)])),
                line_health,
                2,
            )),
            oss_archive_limiter: Arc::new(Semaphore::new(1)),
            pause_state: Arc::new(PauseStateRegistry::new(None)),
            apimart_tasks: Arc::new(ApimartTaskStore::new(None)),
        }
    }

    async fn request_gateway_stats(base_url: &str, token: Option<&str>) -> reqwest::Response {
        let client = reqwest::Client::new();
        let mut request = client.get(format!("{base_url}/api/gateway-stats"));
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        request.send().await.expect("request gateway stats")
    }

    #[tokio::test]
    async fn gateway_stats_rejects_missing_bearer_token() {
        let state = test_state("http://127.0.0.1:1".to_string(), Some("service-role"));
        let (base_url, gateway) = spawn_app(build_router(state)).await;

        let response = request_gateway_stats(&base_url, None).await;

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body: serde_json::Value = response.json().await.expect("parse error response");
        assert_eq!(body["error"], "缺少 Authorization Bearer 登录凭证");
        gateway.abort();
    }

    #[tokio::test]
    async fn gateway_stats_rejects_inactive_account() {
        let (supabase_url, _mock, supabase) = spawn_mock_supabase(false).await;
        let state = test_state(supabase_url, Some("service-role"));
        let (base_url, gateway) = spawn_app(build_router(state)).await;

        let response = request_gateway_stats(&base_url, Some("user-token")).await;

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body: serde_json::Value = response.json().await.expect("parse error response");
        assert_eq!(body["error"], "账号已被停用，请联系管理员");
        gateway.abort();
        supabase.abort();
    }

    #[tokio::test]
    async fn gateway_stats_reports_missing_service_role_configuration() {
        let (supabase_url, _mock, supabase) = spawn_mock_supabase(true).await;
        let state = test_state(supabase_url, None);
        let (base_url, gateway) = spawn_app(build_router(state)).await;

        let response = request_gateway_stats(&base_url, Some("user-token")).await;

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        let body: serde_json::Value = response.json().await.expect("parse error response");
        assert!(body["error"]
            .as_str()
            .unwrap_or("")
            .contains("SUPABASE_SERVICE_ROLE_KEY"));
        gateway.abort();
        supabase.abort();
    }

    #[tokio::test]
    async fn gateway_stats_returns_queue_and_names_using_service_role() {
        let (supabase_url, mock, supabase) = spawn_mock_supabase(true).await;
        let state = test_state(supabase_url, Some("service-role"));
        let permit = state
            .generation_queue
            .acquire_auto_for_user("user-1", "1024x1024")
            .await
            .expect("occupy one queue slot");
        let (base_url, gateway) = spawn_app(build_router(state)).await;

        let response = request_gateway_stats(&base_url, Some("user-token")).await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = response.json().await.expect("parse stats response");
        assert_eq!(body["queue"]["global_active"], 1);
        assert_eq!(body["queue"]["active_by_user"]["user-1"], 1);
        assert_eq!(body["display_names"]["user-1"], "运营甲");
        assert!(body["queue"]["waiting"].is_array());
        assert!(body["health"]["lines"].is_object());
        assert!(body["paused_lines"].is_array());

        let requests = mock
            .requests
            .lock()
            .expect("mock supabase requests mutex poisoned");
        let names_request = requests
            .iter()
            .find(|request| request.path_and_query.contains("select=id,display_name"))
            .expect("display name request should be sent");
        assert_eq!(names_request.apikey, "service-role");
        assert_eq!(names_request.authorization, "Bearer service-role");

        drop(requests);
        drop(permit);
        gateway.abort();
        supabase.abort();
    }

    #[test]
    fn detects_upstream_quota_exhaustion_errors() {
        assert!(is_quota_exhausted_error(
            r#"线路6编辑接口返回 403 Forbidden: {"error":{"message":"预扣费额度失败, 用户剩余额度: ¤0.025000, 需要预扣费额度: ¤0.050000","code":"insufficient_user_quota"}}"#
        ));
        assert!(is_quota_exhausted_error(
            r#"线路5 APIMart接口返回 402 Payment Required: {"error":{"message":"insufficient balance (current: 0.032)"}}"#
        ));
    }

    #[test]
    fn ignores_transient_upstream_errors_for_auto_pause() {
        assert!(!is_quota_exhausted_error(
            "调用线路6编辑接口失败：Connection timed out"
        ));
        assert!(!is_quota_exhausted_error(
            "线路3 vectorengine接口返回 524 <unknown status code>: error code: 524"
        ));
    }

    #[test]
    fn legacy_generate_request_defaults_to_inline_base64() {
        let request: GatewayGenerateImageRequest = serde_json::from_value(json!({
            "prompt": "test",
            "size": "1024x1024",
            "product_images": []
        }))
        .expect("deserialize legacy request");

        assert_eq!(request.result_delivery, ResultDelivery::InlineBase64);
        assert!(validate_result_delivery_request(&request).is_ok());
    }

    #[test]
    fn oss_url_delivery_requires_archive_metadata() {
        let request: GatewayGenerateImageRequest = serde_json::from_value(json!({
            "prompt": "test",
            "size": "1024x1024",
            "product_images": [],
            "result_delivery": "oss_url"
        }))
        .expect("deserialize URL delivery request");

        let error = validate_result_delivery_request(&request)
            .expect_err("URL delivery without archive must fail");
        assert_eq!(error.status, StatusCode::BAD_REQUEST);
        assert!(error.message.contains("archive"));
    }

    #[test]
    fn oss_url_delivery_omits_inline_image_after_archive_success() {
        let delivered = select_result_delivery(
            ResultDelivery::OssUrl,
            "large-base64".to_string(),
            Some("https://oss.example.com/generated/result.jpg".to_string()),
        );

        assert_eq!(delivered.result_delivery, ResultDelivery::OssUrl);
        assert_eq!(delivered.image, None);
        assert_eq!(
            delivered.image_url.as_deref(),
            Some("https://oss.example.com/generated/result.jpg")
        );
    }

    #[test]
    fn oss_url_delivery_falls_back_to_inline_when_archive_fails() {
        let delivered =
            select_result_delivery(ResultDelivery::OssUrl, "generated-base64".to_string(), None);

        assert_eq!(delivered.result_delivery, ResultDelivery::InlineBase64);
        assert_eq!(delivered.image.as_deref(), Some("generated-base64"));
        assert_eq!(delivered.image_url, None);
    }

    #[test]
    fn delivery_archive_specs_cover_largest_export_dimensions() {
        let avatar = compression_config_for_asset_kind("avatar").expect("avatar config");
        let poster = compression_config_for_asset_kind("poster").expect("poster config");
        let signboard = compression_config_for_asset_kind("p_signboard").expect("signboard config");
        let picture_wall =
            compression_config_for_asset_kind("picture_wall").expect("picture wall config");

        assert!(avatar.max_dimension >= 800);
        assert!(poster.max_dimension >= 2048);
        assert!(signboard.max_dimension >= 1792);
        assert!(picture_wall.max_dimension >= 1448);
    }

    #[test]
    fn douyin_ytdlp_json_returns_direct_url_and_safe_headers_only() {
        let value = parse_ytdlp_json(
            r#"{
                "title":"测试视频",
                "uploader":"测试作者",
                "url":"https://v3-dy-o.zjcdn.com/fallback.mp4",
                "http_headers":{
                    "User-Agent":"Desktop UA",
                    "Referer":"https://www.douyin.com/",
                    "Cookie":"server-cookie=secret",
                    "Authorization":"Bearer secret"
                },
                "requested_downloads":[{
                    "url":"https://v26-dy-o.zjcdn.com/video/tos/cn/tos.mp4?token=abc",
                    "http_headers":{
                        "Accept":"*/*",
                        "Cookie":"never-return-this"
                    }
                }]
            }"#,
        )
        .expect("parse yt-dlp fixture");

        assert_eq!(
            extract_url_from_ytdlp_value(&value).expect("extract direct video url"),
            "https://v26-dy-o.zjcdn.com/video/tos/cn/tos.mp4?token=abc"
        );
        assert_eq!(
            extract_title_from_ytdlp_value(&value).as_deref(),
            Some("测试视频")
        );
        assert_eq!(
            extract_author_from_ytdlp_value(&value).as_deref(),
            Some("测试作者")
        );

        let headers = extract_safe_http_headers_from_ytdlp_value(&value).expect("safe headers");
        assert_eq!(headers.get("Accept").map(String::as_str), Some("*/*"));
        assert_eq!(
            headers.get("User-Agent").map(String::as_str),
            Some("Desktop UA")
        );
        assert!(!headers.contains_key("Cookie"));
        assert!(!headers.contains_key("Authorization"));
    }

    #[test]
    fn douyin_share_url_parser_accepts_common_share_text() {
        let url = extract_share_url(
            "复制这条消息，打开抖音看看 https://v.douyin.com/AbCdE/，",
            is_douyin_url,
        )
        .expect("douyin url");

        assert_eq!(url, "https://v.douyin.com/AbCdE/");
    }

    #[test]
    fn gateway_douyin_netscape_cookie_is_copied_to_temp_before_ytdlp() {
        let source_path =
            env::temp_dir().join(format!("douyin-source-cookie-{}.txt", uuid::Uuid::new_v4()));
        let source_content = format!(
            "{}\n.douyin.com\tTRUE\t/\tTRUE\t1900000000\tttwid\tplaceholder",
            NETSCAPE_COOKIE_HEADER
        );
        std::fs::write(&source_path, &source_content).expect("write source cookie");

        let temp_path = copy_cookie_file_to_temp(&source_path, "douyin-gateway")
            .expect("copy cookie to temp file");

        assert_ne!(temp_path, source_path);
        assert_eq!(
            std::fs::read_to_string(&temp_path).expect("read temp cookie"),
            source_content
        );

        cleanup_temp_cookie_file(Some(temp_path));
        let _ = std::fs::remove_file(source_path);
    }
}
