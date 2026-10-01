use super::*;

#[derive(Serialize)]
pub(crate) struct GatewayStatsResponse {
    /// 当前网关进程内存视角的运行快照
    pub(crate) queue: gateway_queue::GatewayQueueSnapshot,
    /// 每条线路最近的健康度（环形缓冲计算结果）
    pub(crate) health: LineHealthSnapshot,
    /// user_id → display_name，用于前端展示
    pub(crate) display_names: HashMap<String, String>,
    /// 服务器当前时间（ISO8601 UTC），供前端校准"等待 N 秒"
    pub(crate) server_time: String,
    /// 当前被暂停的线路（余额为 0 等原因），auto 路由会自动排除，manual 选择会被拒
    pub(crate) paused_lines: Vec<PausedLineInfo>,
}

pub(crate) async fn gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GatewayStatsResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    let service_role = service_role_bearer(&state)?;
    let response = build_gateway_stats_response(&state, service_role, service_role).await?;
    Ok(Json(response))
}

pub(crate) async fn admin_gateway_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GatewayStatsResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let response = build_gateway_stats_response(&state, &state.supabase_anon_key, token).await?;
    Ok(Json(response))
}

pub(crate) async fn build_gateway_stats_response(
    state: &AppState,
    profiles_api_key: &str,
    profiles_bearer: &str,
) -> Result<GatewayStatsResponse, GatewayError> {
    let queue = state.generation_queue.snapshot();
    let health = state.line_health.snapshot();
    let paused_lines = state.pause_state.snapshot();

    // 收集快照里出现过的所有 user_id（在跑的 + 排队的）
    let mut user_ids: std::collections::HashSet<String> =
        queue.active_by_user.keys().cloned().collect();
    for ticket in &queue.waiting {
        user_ids.insert(ticket.user_id.clone());
    }
    let display_names = if user_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_display_names(state, profiles_api_key, profiles_bearer, &user_ids).await?
    };

    let server_time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    Ok(GatewayStatsResponse {
        queue,
        health,
        display_names,
        server_time,
        paused_lines,
    })
}

pub(crate) async fn fetch_display_names(
    state: &AppState,
    api_key: &str,
    bearer: &str,
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
        .header("apikey", api_key)
        .bearer_auth(bearer)
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
            let id = row
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())?;
            let name = row
                .get("display_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "(无名)".to_string());
            Some((id, name))
        })
        .collect())
}
