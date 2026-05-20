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
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
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
        .route("/api/upload-image-to-oss", post(upload_image_to_oss))
        .route("/api/oss-presigned-urls", post(oss_presigned_urls))
        .route("/api/admin-create-user", post(admin_create_user))
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

async fn generate_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut req): Json<api::GenerateRequest>,
) -> Result<Json<GenerateImageResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let permit = acquire_generation_permit(&state, req.api_line, &req.size, &user_id).await?;
    req.api_line = permit.line;
    let line = req.api_line.as_str();
    req.size = generation_size_for_line(line, &req.size)
        .ok_or_else(|| GatewayError::bad_request(format!("{line} 不支持尺寸：{}", req.size)))?
        .into_owned();
    let started = Instant::now();
    let result = api::generate_image(req).await;
    let latency_ms = started.elapsed().as_millis() as u64;
    state.line_health.record(line, latency_ms, result.is_ok());
    result
        .map(|image| {
            Json(GenerateImageResponse {
                image,
                generation_line: line.to_string(),
            })
        })
        .map_err(GatewayError::bad_gateway)
}

async fn get_line_health(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LineHealthSnapshot>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    Ok(Json(state.line_health.snapshot()))
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
) -> Result<GenerationPermit, GatewayError> {
    if requested_line == ImageApiLine::Line1 {
        return acquire_manual_generation_permit(state, requested_line, user_id).await;
    }

    acquire_auto_generation_permit(state, size, user_id).await
}

async fn acquire_auto_generation_permit(
    state: &AppState,
    size: &str,
    user_id: &str,
) -> Result<GenerationPermit, GatewayError> {
    let queued = state
        .generation_queue
        .acquire_auto_for_user(user_id, size)
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
        read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 21),
        HashMap::from([
            ("line1", read_limit_env("GATEWAY_GENERATION_LINE1_LIMIT", 2)),
            ("line2", read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 4)),
            ("line3", read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 4)),
            ("line4", read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 4)),
            ("line5", read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 4)),
            ("line6", read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 3)),
        ]),
    )
}

fn read_limit_env(name: &str, default: usize) -> usize {
    env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(default)
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
