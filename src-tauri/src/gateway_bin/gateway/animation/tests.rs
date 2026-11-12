use super::*;

#[test]
fn task_contract_rejects_static_results_and_unknown_states() {
    assert_eq!(
        provider::task_id(&json!({"task_id":"task_123"})).unwrap(),
        "task_123"
    );
    assert!(provider::task_id(&json!({"id":"../private"})).is_err());
    assert!(provider::task_id(&json!({"data":[]})).is_err());
    assert!(provider::completed_url(
        &json!({"status":"failed","result":{"data":[{"url":"https://example.com/a.gif"}]}})
    )
    .is_err());
    assert_eq!(
        provider::completed_url(
            &json!({"status":"completed","result":{"data":[{"url":"https://example.com/a.gif"}]}})
        )
        .unwrap(),
        "https://example.com/a.gif"
    );
}

#[test]
fn uploads_are_decoded_and_match_selected_canvas() {
    use image::{DynamicImage, ImageFormat};
    use std::io::Cursor;
    let spec = crate::product_animation::AnimationSpec {
        width: 1024,
        height: 768,
        duration_ms: 3000,
        format: "gif".into(),
        style: "steam".into(),
    };
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(1024, 768)
        .write_to(&mut bytes, ImageFormat::Png)
        .unwrap();
    assert!(validate_source(bytes.get_ref(), &spec).is_ok());
    assert!(validate_source(b"fake png", &spec).is_err());
    let mut wrong = spec.clone();
    wrong.width = 1280;
    wrong.height = 960;
    assert!(validate_source(bytes.get_ref(), &wrong).is_err());
}

#[tokio::test]
async fn animation_endpoints_reject_missing_auth_and_disabled_accounts() {
    use crate::gateway_test_support::{spawn_app, spawn_mock_supabase, test_state};
    let (database, _, database_handle) = spawn_mock_supabase(false).await;
    let (gateway, gateway_handle) =
        spawn_app(crate::build_router(test_state(database, Some("service"))).unwrap()).await;
    for path in ["/api/animations/capabilities", "/api/animations/jobs"] {
        let response = reqwest::Client::new()
            .get(format!("{gateway}{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let response = reqwest::Client::new()
            .get(format!("{gateway}{path}"))
            .bearer_auth("disabled")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    gateway_handle.abort();
    database_handle.abort();
}

#[tokio::test]
async fn task_listing_scopes_database_query_to_authenticated_user() {
    use crate::gateway_test_support::{spawn_app, test_state};
    async fn auth() -> Json<serde_json::Value> {
        Json(json!({"id":"55555555-5555-4555-8555-555555555555"}))
    }
    async fn profile() -> Json<serde_json::Value> {
        Json(json!([{"is_active":true}]))
    }
    async fn rows(uri: axum::http::Uri, headers: HeaderMap) -> Json<serde_json::Value> {
        assert!(uri
            .query()
            .unwrap()
            .contains("user_id=eq.55555555-5555-4555-8555-555555555555"));
        assert_eq!(headers.get("apikey").unwrap(), "service");
        Json(json!([]))
    }
    let db = Router::new()
        .route("/auth/v1/user", get(auth))
        .route("/rest/v1/profiles", get(profile))
        .route("/rest/v1/product_animation_jobs", get(rows));
    let (database, database_handle) = spawn_app(db).await;
    let (gateway, gateway_handle) =
        spawn_app(crate::build_router(test_state(database, Some("service"))).unwrap()).await;
    let response = reqwest::Client::new()
        .get(format!("{gateway}/api/animations/jobs?user_id=other"))
        .bearer_auth("user")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.json::<serde_json::Value>().await.unwrap(),
        json!({"jobs":[]})
    );
    gateway_handle.abort();
    database_handle.abort();
}
