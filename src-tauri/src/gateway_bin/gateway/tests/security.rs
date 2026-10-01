use crate::*;
use crate::gateway_test_support::*;

#[tokio::test]
async fn cors_allows_desktop_and_configured_origin_but_rejects_unknown_origin() {
    let app = Router::new().route("/health", get(health))
        .layer(configured_cors_layer("https://studio.example.com").expect("配置来源白名单"));
    let (base_url, server) = spawn_app(app).await;
    for origin in ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost",
        "http://localhost:1420", "https://studio.example.com"] {
        let response = reqwest::Client::new().get(format!("{base_url}/health"))
            .header(header::ORIGIN, origin).send().await.expect("请求已授权来源");
        assert_eq!(response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .expect("返回授权来源"), origin);
    }
    let response = reqwest::Client::new().get(format!("{base_url}/health"))
        .header(header::ORIGIN, "https://untrusted.example.com").send().await.expect("请求未知来源");
    assert!(response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());
    server.abort();
}

#[tokio::test]
async fn allowed_cors_origin_still_requires_generation_bearer_token() {
    let state = test_state("http://127.0.0.1:1".to_string(), None);
    let (base_url, server) = spawn_app(build_router(state).expect("构建测试路由")).await;
    let response = reqwest::Client::new().post(format!("{base_url}/api/generate-image"))
        .header(header::ORIGIN, "tauri://localhost")
        .json(&json!({"prompt": "test", "size": "1024x1024", "product_images": []}))
        .send().await.expect("请求生图接口");
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    server.abort();
}

#[tokio::test]
async fn cors_preflight_allows_authorization_and_content_type() {
    let app = Router::new().route("/health", get(health))
        .layer(configured_cors_layer("").expect("默认来源白名单"));
    let (base_url, server) = spawn_app(app).await;
    let response = reqwest::Client::new().request(reqwest::Method::OPTIONS, format!("{base_url}/health"))
        .header(header::ORIGIN, "tauri://localhost")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
        .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type")
        .send().await.expect("请求预检");
    assert_eq!(response.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(), "tauri://localhost");
    let headers = response.headers().get(header::ACCESS_CONTROL_ALLOW_HEADERS).unwrap().to_str().unwrap();
    assert!(headers.contains("authorization") && headers.contains("content-type"));
    server.abort();
}

#[test]
fn cors_rejects_wildcard_null_and_non_origin_configuration() {
    for invalid in ["*", "null", "https://example.com/path", "https://user:pass@example.com"] {
        assert!(allowed_origins(invalid).is_err(), "拒绝无效来源 {invalid}");
    }
    assert_eq!(allowed_origins("https://example.com, https://example.com").unwrap().len(), 5);
}

#[test]
fn state_path_probes_writes_and_stops_for_explicit_unwritable_configuration() {
    let dir = std::env::temp_dir().join(format!("gateway-state-test-{}", uuid::Uuid::new_v4()));
    let path = prepare_state_file_path(&dir, "state.json", true).expect("目录写探针通过");
    assert_eq!(path, Some(dir.join("state.json")));
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0, "写探针必须清理");
    let blocked = dir.join("blocked");
    std::fs::write(&blocked, b"synthetic-test").unwrap();
    assert!(prepare_state_file_path(&blocked, "state.json", true).is_err());
    assert_eq!(prepare_state_file_path(&blocked, "state.json", false).unwrap(), None);
    std::fs::remove_dir_all(&dir).unwrap();
}

#[cfg(windows)]
#[test]
fn readonly_existing_state_file_rejects_explicit_configuration() {
    let dir = std::env::temp_dir().join(format!("gateway-readonly-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("state.json");
    std::fs::write(&file, b"{}").unwrap();
    let mut permissions = std::fs::metadata(&file).unwrap().permissions();
    permissions.set_readonly(true);
    std::fs::set_permissions(&file, permissions.clone()).unwrap();
    let explicit = prepare_state_file_path(&dir, "state.json", true);
    let default = prepare_state_file_path(&dir, "state.json", false);
    permissions.set_readonly(false);
    std::fs::set_permissions(&file, permissions).unwrap();
    std::fs::remove_file(&file).unwrap();
    std::fs::remove_dir(&dir).unwrap();
    assert!(explicit.is_err(), "显式配置不能把只读文件声明为可持久化");
    assert_eq!(default.unwrap(), None, "默认路径不可写时应明确降级");
}
