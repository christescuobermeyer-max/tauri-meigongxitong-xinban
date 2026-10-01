use super::*;
use axum::http::HeaderValue;
use tower_http::cors::AllowOrigin;

const DEFAULT_ALLOWED_ORIGINS: [&str; 4] = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:1420",
];

pub(crate) fn allowed_origins(extra: &str) -> Result<Vec<HeaderValue>, String> {
    let mut origins = Vec::new();
    for origin in DEFAULT_ALLOWED_ORIGINS.into_iter().chain(
        extra.split(|character: char| character == ',' || character == ';' || character.is_whitespace())
            .filter(|origin| !origin.is_empty()),
    ) {
        if origin != "tauri://localhost" {
            let parsed = reqwest::Url::parse(origin)
                .map_err(|_| format!("GATEWAY_ALLOWED_ORIGINS 包含无效来源：{origin}"))?;
            if !matches!(parsed.scheme(), "http" | "https")
                || parsed.host_str().is_none()
                || parsed.path() != "/"
                || parsed.query().is_some()
                || parsed.fragment().is_some()
                || !parsed.username().is_empty()
                || parsed.password().is_some()
            {
                return Err(format!("GATEWAY_ALLOWED_ORIGINS 只能配置完整 HTTP/HTTPS 来源：{origin}"));
            }
        }
        let value = HeaderValue::from_str(origin)
            .map_err(|_| format!("GATEWAY_ALLOWED_ORIGINS 来源格式不合法：{origin}"))?;
        if !origins.contains(&value) {
            origins.push(value);
        }
    }
    Ok(origins)
}

pub(crate) fn cors_layer() -> Result<CorsLayer, String> {
    configured_cors_layer(&env::var("GATEWAY_ALLOWED_ORIGINS").unwrap_or_default())
}

pub(crate) fn configured_cors_layer(extra: &str) -> Result<CorsLayer, String> {
    Ok(CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins(extra)?))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT]))
}
