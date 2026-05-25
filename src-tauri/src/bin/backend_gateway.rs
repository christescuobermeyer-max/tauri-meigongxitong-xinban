#[path = "../admin_user.rs"]
mod admin_user;
#[path = "../api.rs"]
mod api;
#[path = "../api_validation.rs"]
mod api_validation;
#[path = "../apimart.rs"]
mod apimart;
#[path = "../apimart_reference.rs"]
mod apimart_reference;
#[path = "../apimart_task.rs"]
mod apimart_task;
#[path = "../brand_story.rs"]
mod brand_story;
#[path = "../brand_story_clients.rs"]
mod brand_story_clients;
#[path = "../env_config.rs"]
mod env_config;
#[path = "../gateway_limiter.rs"]
mod gateway_limiter;
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

use axum::{
    extract::State,
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    env,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;
use tower_http::cors::{Any, CorsLayer};

use gateway_limiter::{generation_size_for_line, GatewayLimiter};
use gateway_queue::{GatewayGenerationQueue, QueuedGenerationPermit};
use image_provider::ImageApiLine;
use line_health::{LineHealthRegistry, LineHealthSnapshot};

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    supabase_url: String,
    supabase_anon_key: String,
    line_health: Arc<LineHealthRegistry>,
    generation_queue: Arc<GatewayGenerationQueue>,
    oss_archive_limiter: Arc<Semaphore>,
}

#[derive(Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Serialize)]
struct GenerateImageResponse {
    image: String,
    generation_line: String,
    archive_url: Option<String>,
    archive_key: Option<String>,
    archive_error: Option<String>,
}

#[derive(serde::Deserialize)]
struct GatewayGenerateImageRequest {
    prompt: String,
    size: String,
    product_images: Vec<String>,
    #[serde(default)]
    api_line: ImageApiLine,
    #[serde(default)]
    archive: Option<ArchiveGeneratedImageRequest>,
}

#[derive(Clone, serde::Deserialize)]
struct ArchiveGeneratedImageRequest {
    asset_kind: String,
    file_name_stem: String,
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
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/generate-image", post(generate_image))
        .route("/api/line-health", get(get_line_health))
        .route("/api/admin/gateway-stats", get(admin_gateway_stats))
        .route("/api/upload-image-to-oss", post(upload_image_to_oss))
        .route("/api/oss-presigned-urls", post(oss_presigned_urls))
        .route("/api/admin-create-user", post(admin_create_user))
        .route("/api/admin-soft-delete-user", post(admin_soft_delete_user))
        .route(
            "/api/brand-story-generate-text",
            post(brand_story_generate_text),
        )
        .route(
            "/api/brand-story-thread-availability",
            get(brand_story_thread_availability),
        )
        .layer(cors_layer())
        .with_state(state);
    let addr = gateway_addr()?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|error| format!("启动后端网关失败：{error}"))?;

    eprintln!("[backend-gateway] listening on http://{addr}");
    axum::serve(listener, app)
        .await
        .map_err(|error| format!("后端网关运行失败：{error}"))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "csgh-backend-gateway",
    })
}

/// 生图请求最多尝试的线路数。
/// 当前共有 7 条线路，设为 7 意味着失败时最多依次试遍所有线路。
const GENERATE_IMAGE_MAX_ATTEMPTS: usize = 7;

async fn generate_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<GatewayGenerateImageRequest>,
) -> Result<Json<GenerateImageResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;

    // 用户显式选了 line1 = manual 模式，不做线路切换，但仍允许 1 次重试在同一线路上重试。
    let requested_line = req.api_line;
    let is_manual = requested_line == ImageApiLine::Line1;
    let original_size = req.size.clone();

    let mut tried_lines: HashSet<String> = HashSet::new();
    let mut last_error: Option<String> = None;
    let mut last_line: Option<String> = None;

    for attempt in 0..GENERATE_IMAGE_MAX_ATTEMPTS {
        let permit = match acquire_generation_permit(
            &state,
            requested_line,
            &original_size,
            &user_id,
            &tried_lines,
        )
        .await
        {
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
        let result = api::generate_image(attempt_req).await;
        let latency_ms = started.elapsed().as_millis() as u64;
        state.line_health.record(line.as_str(), latency_ms, result.is_ok());

        match result {
            Ok(image) => {
                if attempt > 0 {
                    eprintln!(
                        "[gateway] generate_image succeeded on {} after {} retry(ies)",
                        line.as_str(),
                        attempt
                    );
                }
                drop(permit);
                let archive_result = if let Some(archive_req) = req.archive.as_ref() {
                    Some(archive_generated_image(&state, archive_req.clone(), &image).await)
                } else {
                    None
                };
                let (archive_url, archive_key, archive_error) = match archive_result {
                    Some(Ok(archive)) => (Some(archive.url), Some(archive.key), None),
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
                return Ok(Json(GenerateImageResponse {
                    image,
                    generation_line: line_str,
                    archive_url,
                    archive_key,
                    archive_error,
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
                last_error = Some(err);
                // manual line1：不再去试其他线路，最多让 retry 在同一线路上等 line_health 自然恢复（取消重试）
                if is_manual {
                    break;
                }
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

struct ArchiveCompressionConfig {
    max_dimension: u32,
    quality: u8,
}

fn compression_config_for_asset_kind(kind: &str) -> Result<ArchiveCompressionConfig, String> {
    let config = match kind {
        "avatar" => ArchiveCompressionConfig {
            max_dimension: 768,
            quality: 82,
        },
        "storefront" | "poster" | "p_signboard" => ArchiveCompressionConfig {
            max_dimension: 1536,
            quality: 88,
        },
        "product" | "picture_wall" => ArchiveCompressionConfig {
            max_dimension: 1024,
            quality: 88,
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
struct AdminGatewayStatsResponse {
    /// 当前网关进程内存视角的运行快照
    queue: gateway_queue::GatewayQueueSnapshot,
    /// 每条线路最近的健康度（环形缓冲计算结果）
    health: LineHealthSnapshot,
    /// user_id → display_name，用于前端展示
    display_names: HashMap<String, String>,
    /// 服务器当前时间（ISO8601 UTC），供前端校准"等待 N 秒"
    server_time: String,
}

async fn admin_gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminGatewayStatsResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let queue = state.generation_queue.snapshot();
    let health = state.line_health.snapshot();

    // 收集快照里出现过的所有 user_id（在跑的 + 排队的）
    let mut user_ids: std::collections::HashSet<String> = queue.active_by_user.keys().cloned().collect();
    for ticket in &queue.waiting {
        user_ids.insert(ticket.user_id.clone());
    }
    let display_names = if user_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_display_names(&state, token, &user_ids).await.unwrap_or_default()
    };

    let server_time = chrono::Utc::now()
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    Ok(Json(AdminGatewayStatsResponse {
        queue,
        health,
        display_names,
        server_time,
    }))
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
    let row = rows.first().ok_or_else(|| GatewayError::unauthorized("账号未找到"))?;
    let role = row.get("role").and_then(|v| v.as_str()).unwrap_or("");
    let is_active = row.get("is_active").and_then(|v| v.as_bool()).unwrap_or(false);
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
    token: &str,
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
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
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
            let id = row.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())?;
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
    let _user_id = verify_access_token(&state, &headers).await?;
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
    let _user_id = verify_access_token(&state, &headers).await?;
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
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(350))
        .build()
        .map_err(|error| format!("初始化后端网关 HTTP 客户端失败：{error}"))?;

    let line_health = Arc::new(LineHealthRegistry::new());

    Ok(AppState {
        client,
        supabase_url,
        supabase_anon_key,
        line_health: Arc::clone(&line_health),
        generation_queue: Arc::new(GatewayGenerationQueue::new(
            build_generation_limiter(),
            line_health,
            read_limit_env("GATEWAY_GENERATION_USER_LIMIT", 3),
        )),
        // 压缩 + OSS PUT 比生图轻得多（每张 < 2s），
        // 生图全局并发 24，归档要跟得上才不会成为瓶颈，默认开到 6。
        oss_archive_limiter: Arc::new(Semaphore::new(read_positive_limit_env(
            "GATEWAY_OSS_ARCHIVE_LIMIT",
            6,
        ))),
    })
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
    requested_line: ImageApiLine,
    size: &str,
    user_id: &str,
    exclude: &HashSet<String>,
) -> Result<GenerationPermit, GatewayError> {
    if requested_line == ImageApiLine::Line1 {
        return acquire_manual_generation_permit(state, requested_line, user_id).await;
    }

    acquire_auto_generation_permit(state, size, user_id, exclude).await
}

async fn acquire_auto_generation_permit(
    state: &AppState,
    size: &str,
    user_id: &str,
    exclude: &HashSet<String>,
) -> Result<GenerationPermit, GatewayError> {
    let queued = state
        .generation_queue
        .acquire_auto_for_user_excluding(user_id, size, exclude.clone())
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

async fn acquire_manual_generation_permit(
    state: &AppState,
    line: ImageApiLine,
    user_id: &str,
) -> Result<GenerationPermit, GatewayError> {
    let queued = state
        .generation_queue
        .acquire_line_for_user(user_id, line.as_str())
        .await
        .map_err(GatewayError::too_many_requests)?;
    Ok(GenerationPermit {
        _permit: Some(queued),
        line,
    })
}

fn build_generation_limiter() -> GatewayLimiter {
    GatewayLimiter::new(
        read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 24),
        HashMap::from([
            // line1 = wlai，单张成本最高，故并发 = 1，只在其它线路全饱和/全 Red 时兜底
            ("line1", read_limit_env("GATEWAY_GENERATION_LINE1_LIMIT", 1)),
            ("line2", read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 4)),
            ("line3", read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 4)),
            ("line4", read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 4)),
            // line5 = apimart，性价比高、最稳，并发 = 5
            ("line5", read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 5)),
            // line6 = manxiaobai，稳定性也好，并发 = 4
            ("line6", read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 4)),
            // line7 = otuapi，稳定性 100% 但响应较慢（~22-26s），作主力分担用并发 = 3
            ("line7", read_limit_env("GATEWAY_GENERATION_LINE7_LIMIT", 3)),
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
