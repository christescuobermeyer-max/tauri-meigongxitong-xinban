use super::*;

pub(crate) async fn global_generation_total(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<GlobalGenerationTotalResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    let total_count = fetch_global_generation_total(&state, token).await?;
    Ok(Json(GlobalGenerationTotalResponse { total_count }))
}

pub(crate) async fn fetch_global_generation_total(
    state: &AppState,
    user_token: &str,
) -> Result<i64, GatewayError> {
    let (api_key, bearer) = match state.supabase_service_role_key.as_deref() {
        Some(service_key) if !service_key.trim().is_empty() => (service_key, service_key),
        _ => (state.supabase_anon_key.as_str(), user_token),
    };
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/generation_totals?select=total_count",
            state.supabase_url
        ))
        .header("apikey", api_key)
        .bearer_auth(bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取累计生图失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取累计生图返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析累计生图失败：{error}")))?;
    Ok(rows
        .iter()
        .filter_map(|row| row.get("total_count").and_then(|value| value.as_i64()))
        .sum())
}
