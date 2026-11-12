use super::*;

pub(super) async fn request(
    state: &AppState,
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let key = state
        .supabase_service_role_key
        .as_ref()
        .ok_or("动图数据库服务未配置")?;
    let mut req = state
        .client
        .request(method, format!("{}/rest/v1/{path}", state.supabase_url))
        .header("apikey", key)
        .bearer_auth(key)
        .header("Prefer", "return=representation")
        .timeout(Duration::from_secs(30));
    if let Some(body) = body {
        req = req.json(&body)
    }
    let response = req.send().await.map_err(|_| "动图任务存储暂不可用")?;
    if !response.status().is_success() {
        return Err(if response.status() == reqwest::StatusCode::CONFLICT {
            "已有进行中的任务，或请求标识与原任务冲突"
        } else {
            "动图任务存储失败，请检查迁移和服务配置"
        }
        .into());
    }
    response.json().await.map_err(|_| "动图任务响应无效".into())
}
pub(super) async fn list(
    state: &AppState,
    user: &str,
    id: Option<&str>,
) -> Result<Vec<Job>, String> {
    let user = uuid::Uuid::parse_str(user).map_err(|_| "账号标识无效")?;
    let filter = match id {
        Some(id) => format!(
            "&id=eq.{}",
            uuid::Uuid::parse_str(id).map_err(|_| "任务标识无效")?
        ),
        None => String::new(),
    };
    let value = request(
        state,
        reqwest::Method::GET,
        &format!("product_animation_jobs?user_id=eq.{user}{filter}&order=created_at.desc&limit=50"),
        None,
    )
    .await?;
    serde_json::from_value(value).map_err(|_| "任务记录格式错误".into())
}
pub(super) async fn update(
    state: &AppState,
    job: &Job,
    worker: &str,
    mut fields: serde_json::Value,
) -> Result<(), String> {
    fields["updated_at"] = json!(chrono::Utc::now().to_rfc3339());
    if fields.get("lease_until").is_none() {
        fields["lease_until"] =
            json!((chrono::Utc::now() + chrono::Duration::minutes(10)).to_rfc3339());
    }
    let response = request(
        state,
        reqwest::Method::PATCH,
        &format!(
            "product_animation_jobs?id=eq.{}&lease_owner=eq.{worker}",
            job.id
        ),
        Some(fields),
    )
    .await?;
    if response.as_array().is_none_or(|rows| rows.len() != 1) {
        return Err("动图任务租约已失效".into());
    }
    Ok(())
}
