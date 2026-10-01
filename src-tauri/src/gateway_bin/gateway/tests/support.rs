use crate::*;
use axum::http::Uri;

use std::collections::HashSet;
use std::sync::Mutex;

#[derive(Clone, Debug)]
pub(crate) struct RecordedRequest {
    pub(crate) path_and_query: String,
    pub(crate) apikey: String,
    pub(crate) authorization: String,
}

#[derive(Clone)]
pub(crate) struct MockSupabaseState {
    pub(crate) active: bool,
    pub(crate) requests: Arc<Mutex<Vec<RecordedRequest>>>,
}

impl MockSupabaseState {
    pub(crate) fn new(active: bool) -> Self {
        Self {
            active,
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub(crate) fn record(&self, uri: &Uri, headers: &HeaderMap) {
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

pub(crate) async fn mock_auth_user(
    State(state): State<MockSupabaseState>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    state.record(&uri, &headers);
    Json(json!({ "id": "user-1" })).into_response()
}

pub(crate) async fn mock_profiles(
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

pub(crate) async fn spawn_app(app: Router) -> (String, tokio::task::JoinHandle<()>) {
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

pub(crate) async fn spawn_mock_supabase(
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

pub(crate) fn test_state(supabase_url: String, service_role: Option<&str>) -> AppState {
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
        prompt_templates: Arc::new(prompt_templates::PromptTemplateStore::from_env()),
    }
}

pub(crate) async fn request_gateway_stats(base_url: &str, token: Option<&str>) -> reqwest::Response {
    let client = reqwest::Client::new();
    let mut request = client.get(format!("{base_url}/api/gateway-stats"));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    request.send().await.expect("request gateway stats")
}
