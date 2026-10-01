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
#[path = "../menu_design.rs"]
mod menu_design;
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
#[path = "../image_generation_request.rs"]
mod image_generation_request;
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
#[path = "../prompt_templates.rs"]
mod prompt_templates;
#[path = "../reference_image.rs"]
mod reference_image;
#[path = "../vectorengine_edit.rs"]
mod vectorengine_edit;
#[path = "../yunwu_edit.rs"]
mod yunwu_edit;

use apimart_task_store::{ApimartTaskStore, PendingApimartTask};
use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Datelike;
use image_provider::{resolve_image_provider, ImageApiLine};
use serde::{Deserialize, Serialize};
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
use tower_http::cors::CorsLayer;

use gateway_limiter::{generation_size_for_line, GatewayLimiter};
use gateway_pause_state::{PauseStateRegistry, PausedLineInfo};
use gateway_queue::{GatewayGenerationQueue, QueuedGenerationPermit};
use line_health::{LineHealthRegistry, LineHealthSnapshot};

mod gateway;
use gateway::*;

#[tokio::main]
async fn main() -> Result<(), String> {
    dotenvy::from_filename(".env.local").ok();
    dotenvy::from_filename(".env").ok();

    let state = build_state()?;
    start_apimart_recovery_worker(state.clone());
    let app = build_router(state)?;
    let addr = gateway_addr()?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|error| format!("启动后端网关失败：{error}"))?;

    eprintln!("[backend-gateway] listening on http://{addr}");
    axum::serve(listener, app)
        .await
        .map_err(|error| format!("后端网关运行失败：{error}"))
}

fn build_router(state: AppState) -> Result<Router, String> {
    let cors = cors_layer()?;
    Ok(
    Router::new()
        .route("/health", get(health))
        .route("/api/generate-image", post(generate_image))
        .route("/api/menu-organize", post(menu_organize).layer(axum::extract::DefaultBodyLimit::max(50 * 1024 * 1024)))
        .route("/api/video/parse-douyin", post(parse_douyin_video))
        .route("/api/line-health", get(get_line_health))
        .route("/api/gateway-stats", get(gateway_stats))
        .route("/api/admin/gateway-stats", get(admin_gateway_stats))
        .route("/api/image-plaza", get(image_plaza))
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
        .layer(cors)
        .with_state(state))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "csgh-backend-gateway",
    })
}

#[cfg(test)]
#[path = "gateway/tests/support.rs"]
mod gateway_test_support;

#[cfg(test)]
#[path = "gateway/tests/stats.rs"]
mod gateway_test_stats;

#[cfg(test)]
#[path = "gateway/tests/routing.rs"]
mod gateway_test_routing;

#[cfg(test)]
#[path = "gateway/tests/delivery.rs"]
mod gateway_test_delivery;

#[cfg(test)]
#[path = "gateway/tests/video.rs"]
mod gateway_test_video;

#[cfg(test)]
#[path = "gateway/tests/security.rs"]
mod gateway_test_security;
