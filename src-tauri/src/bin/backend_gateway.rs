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
#[path = "../env_config.rs"]
mod env_config;
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
#[path = "../oss.rs"]
mod oss;
#[path = "../pockgo_chat.rs"]
mod pockgo_chat;
#[path = "../pockgo_transport.rs"]
mod pockgo_transport;
#[path = "../reference_image.rs"]
mod reference_image;
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
use std::{env, net::SocketAddr, time::Duration};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    supabase_url: String,
    supabase_anon_key: String,
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

#[tokio::main]
async fn main() -> Result<(), String> {
    dotenvy::from_filename(".env.local").ok();
    dotenvy::from_filename(".env").ok();

    let state = build_state()?;
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/generate-image", post(generate_image))
        .route("/api/upload-image-to-oss", post(upload_image_to_oss))
        .route("/api/admin-create-user", post(admin_create_user))
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
    Json(req): Json<api::GenerateRequest>,
) -> Result<Json<String>, GatewayError> {
    verify_access_token(&state, &headers).await?;
    api::generate_image(req).await.map(Json).map_err(GatewayError::bad_gateway)
}

async fn upload_image_to_oss(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<oss::UploadImageToOssRequest>,
) -> Result<Json<oss::UploadImageToOssResponse>, GatewayError> {
    verify_access_token(&state, &headers).await?;
    oss::upload_image_to_oss(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

async fn admin_create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<admin_user::AdminCreateUserRequest>,
) -> Result<Json<admin_user::AdminCreateUserResponse>, GatewayError> {
    verify_access_token(&state, &headers).await?;
    admin_user::admin_create_user(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_request)
}

async fn verify_access_token(state: &AppState, headers: &HeaderMap) -> Result<(), GatewayError> {
    let token = bearer_token(headers)?;
    let response = state
        .client
        .get(format!("{}/auth/v1/user", state.supabase_url))
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("校验登录态失败：{error}")))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(GatewayError::unauthorized("登录态无效或已过期，请重新登录"))
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
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|error| format!("初始化后端网关 HTTP 客户端失败：{error}"))?;

    Ok(AppState {
        client,
        supabase_url,
        supabase_anon_key,
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
