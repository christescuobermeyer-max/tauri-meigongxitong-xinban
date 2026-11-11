use crate::*;
use crate::gateway_test_support::{spawn_app, test_state};

#[tokio::test]
async fn archived_task_recovery_reuses_result_without_upstream_or_oss_calls() {
    let requests = Arc::new(std::sync::Mutex::new(Vec::<serde_json::Value>::new()));
    let captured = Arc::clone(&requests);
    let app = Router::new().route("/rest/v1/generation_logs", post(move |Json(body): Json<serde_json::Value>| {
        let captured = Arc::clone(&captured);
        async move {
            let mut requests = captured.lock().unwrap();
            requests.push(body);
            if requests.len() == 1 { StatusCode::SERVICE_UNAVAILABLE } else { StatusCode::CREATED }
        }
    }));
    let (base_url, server) = spawn_app(app).await;
    let state = test_state(base_url, Some("test-service"));
    let task: PendingApimartTask = serde_json::from_value(json!({
        "task_id": "task-1", "user_id": "user-1", "shop_name": "测试店",
        "asset_kind": "product", "platform": "meituan", "file_name_stem": "product",
        "generation_line": "line5", "started_at_ms": 1,
        "archive": { "url": "https://example.invalid/result.jpg", "key": "generated/result.jpg" }
    })).unwrap();
    assert!(recover_apimart_task(&state, &state.client, "unused", task.clone()).await.is_err());
    recover_apimart_task(&state, &state.client, "unused", task).await.unwrap();
    let requests = requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0]["oss_url"], requests[1]["oss_url"]);
    assert_eq!(requests[0]["oss_key"], requests[1]["oss_key"]);
    server.abort();
}
