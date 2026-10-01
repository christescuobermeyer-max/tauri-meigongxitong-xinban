use crate::*;
use crate::gateway_test_support::*;

#[tokio::test]
async fn gateway_stats_rejects_missing_bearer_token() {
    let state = test_state("http://127.0.0.1:1".to_string(), Some("service-role"));
    let (base_url, gateway) = spawn_app(build_router(state).expect("构建测试路由")).await;

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
    let (base_url, gateway) = spawn_app(build_router(state).expect("构建测试路由")).await;

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
    let (base_url, gateway) = spawn_app(build_router(state).expect("构建测试路由")).await;

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
    let (base_url, gateway) = spawn_app(build_router(state).expect("构建测试路由")).await;

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
