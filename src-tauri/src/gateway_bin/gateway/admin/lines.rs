use super::*;

#[derive(serde::Deserialize)]
pub(crate) struct AdminBalanceFetchRequest {
    pub(crate) line: String,
}

#[derive(serde::Deserialize)]
pub(crate) struct AdminLinePauseRequest {
    pub(crate) line: String,
    #[serde(default)]
    pub(crate) reason: Option<String>,
    #[serde(default)]
    pub(crate) source: Option<String>,
}

#[derive(serde::Deserialize)]
pub(crate) struct AdminLineResumeRequest {
    pub(crate) line: String,
    #[serde(default)]
    pub(crate) force: bool,
}

#[derive(Serialize)]
pub(crate) struct AdminLinePauseResponse {
    pub(crate) ok: bool,
    pub(crate) paused: PausedLineInfo,
}

#[derive(Serialize)]
pub(crate) struct AdminLineResumeResponse {
    pub(crate) ok: bool,
    /// true = 之前有暂停记录被移除；false = 没有记录（幂等）
    pub(crate) removed: bool,
}

pub(crate) async fn admin_line_pause(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AdminLinePauseRequest>,
) -> Result<Json<AdminLinePauseResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let line = validate_line_name(&req.line)?;
    let reason = req
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("manual")
        .to_string();
    let source = req
        .source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("manual")
        .to_string();
    let paused = state.pause_state.pause(line, reason, source);
    Ok(Json(AdminLinePauseResponse { ok: true, paused }))
}

pub(crate) async fn admin_line_resume(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AdminLineResumeRequest>,
) -> Result<Json<AdminLineResumeResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let line = validate_line_name(&req.line)?;
    if state.pause_state.is_manual_protection_locked(&line) && !req.force {
        eprintln!(
            "[pause-state] ignored resume line={} because manual_protection lock is active",
            line
        );
        return Ok(Json(AdminLineResumeResponse {
            ok: true,
            removed: false,
        }));
    }
    let removed = state.pause_state.resume(&line);
    Ok(Json(AdminLineResumeResponse { ok: true, removed }))
}

pub(crate) async fn admin_balance_fetch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AdminBalanceFetchRequest>,
) -> Result<Json<serde_json::Value>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;

    let line = validate_line_name(&req.line)?;
    if !api_key_billing::supports_api_key_billing_line(&line) {
        return Err(GatewayError::bad_request(format!(
            "{line} 暂不支持 API Key billing 余额查询"
        )));
    }

    api_key_billing::fetch_api_key_billing_balance_for_line(&state.client, &line)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

pub(crate) fn validate_line_name(raw: &str) -> Result<String, GatewayError> {
    let trimmed = raw.trim();
    if !matches!(
        trimmed,
        "line2" | "line3" | "line4" | "line5" | "line6" | "line7"
    ) {
        return Err(GatewayError::bad_request(format!(
            "不支持的线路名：{raw}（合法值 line2-line7）"
        )));
    }
    Ok(trimmed.to_string())
}
