use super::*;

pub(crate) async fn ensure_admin_profile(
    state: &AppState,
    token: &str,
    user_id: &str,
) -> Result<(), GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/profiles?select=role,is_active&id=eq.{}",
            state.supabase_url, user_id
        ))
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("校验管理员身份失败：{error}")))?;
    if !response.status().is_success() {
        return Err(GatewayError::unauthorized("管理员身份校验失败，请重新登录"));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析管理员身份失败：{error}")))?;
    let row = rows
        .first()
        .ok_or_else(|| GatewayError::unauthorized("账号未找到"))?;
    let role = row.get("role").and_then(|v| v.as_str()).unwrap_or("");
    let is_active = row
        .get("is_active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !is_active {
        return Err(GatewayError::unauthorized("账号已被停用"));
    }
    if role != "admin" {
        return Err(GatewayError::unauthorized("仅管理员可访问网关监控"));
    }
    Ok(())
}

pub(crate) async fn verify_access_token(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<String, GatewayError> {
    let token = bearer_token(headers)?;
    let response = state
        .client
        .get(format!("{}/auth/v1/user", state.supabase_url))
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("校验登录态失败：{error}")))?;

    if !response.status().is_success() {
        return Err(GatewayError::unauthorized("登录态无效或已过期，请重新登录"));
    }

    let user_json: serde_json::Value = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析登录态失败：{error}")))?;
    let user_id = user_json
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| GatewayError::unauthorized("登录态无效或已过期，请重新登录"))?;

    ensure_active_profile(state, token, user_id).await?;
    Ok(user_id.to_string())
}

pub(crate) async fn ensure_active_profile(
    state: &AppState,
    token: &str,
    user_id: &str,
) -> Result<(), GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/profiles?select=is_active&id=eq.{}",
            state.supabase_url, user_id
        ))
        .header("apikey", &state.supabase_anon_key)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("校验账号状态失败：{error}")))?;

    if !response.status().is_success() {
        return Err(GatewayError::unauthorized("账号状态校验失败，请重新登录"));
    }

    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析账号状态失败：{error}")))?;
    let is_active = rows
        .first()
        .and_then(|row| row.get("is_active"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    if is_active {
        Ok(())
    } else {
        Err(GatewayError::unauthorized("账号已被停用，请联系管理员"))
    }
}

pub(crate) fn bearer_token(headers: &HeaderMap) -> Result<&str, GatewayError> {
    let value = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| GatewayError::unauthorized("缺少 Authorization Bearer 登录凭证"))
}
