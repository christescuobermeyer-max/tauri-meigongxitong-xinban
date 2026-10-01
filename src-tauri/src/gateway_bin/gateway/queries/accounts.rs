use super::*;

#[derive(Serialize)]
pub(crate) struct AccountGenerationSummaryResponse {
    pub(crate) month_start: String,
    pub(crate) month_end: String,
    pub(crate) accounts: Vec<AccountGenerationSummaryRow>,
}

#[derive(Serialize)]
pub(crate) struct AccountGenerationSummaryRow {
    pub(crate) user_id: String,
    pub(crate) display_name: String,
    pub(crate) role: String,
    pub(crate) is_active: bool,
    pub(crate) created_at: Option<String>,
    pub(crate) last_login_at: Option<String>,
    pub(crate) total_count: i64,
    pub(crate) month_count: i64,
}

pub(crate) struct AccountProfileSummary {
    pub(crate) user_id: String,
    pub(crate) display_name: String,
    pub(crate) role: String,
    pub(crate) is_active: bool,
    pub(crate) created_at: Option<String>,
    pub(crate) last_login_at: Option<String>,
}

pub(crate) async fn admin_account_generation_summary(
    State(state): State<AppState>,
) -> Result<Json<AccountGenerationSummaryResponse>, GatewayError> {
    let service_role_bearer = service_role_bearer(&state)?;
    let profiles = fetch_account_generation_profiles(&state, service_role_bearer).await?;
    let totals = fetch_account_generation_totals(&state, service_role_bearer).await?;
    let (month_start, month_end, stat_month) = current_shanghai_month_range();
    let month_counts =
        fetch_account_generation_month_counts(&state, service_role_bearer, &stat_month).await?;

    let accounts = profiles
        .into_iter()
        .map(|profile| AccountGenerationSummaryRow {
            total_count: totals.get(&profile.user_id).copied().unwrap_or(0),
            month_count: month_counts.get(&profile.user_id).copied().unwrap_or(0),
            user_id: profile.user_id,
            display_name: profile.display_name,
            role: profile.role,
            is_active: profile.is_active,
            created_at: profile.created_at,
            last_login_at: profile.last_login_at,
        })
        .collect();

    Ok(Json(AccountGenerationSummaryResponse {
        month_start,
        month_end,
        accounts,
    }))
}

pub(crate) async fn fetch_account_generation_profiles(
    state: &AppState,
    service_role_bearer: &str,
) -> Result<Vec<AccountProfileSummary>, GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/profiles?select=id,display_name,role,is_active,created_at,last_login_at&deleted_at=is.null&order=created_at.desc",
            state.supabase_url
        ))
        .header("apikey", service_role_bearer)
        .bearer_auth(service_role_bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取账号列表失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取账号列表返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析账号列表失败：{error}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let user_id = row.get("id").and_then(|value| value.as_str())?.to_string();
            let display_name = row
                .get("display_name")
                .and_then(|value| value.as_str())
                .unwrap_or("(无名)")
                .to_string();
            let role = row
                .get("role")
                .and_then(|value| value.as_str())
                .unwrap_or("user")
                .to_string();
            let is_active = row
                .get("is_active")
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            let created_at = row
                .get("created_at")
                .and_then(|value| value.as_str())
                .map(str::to_string);
            let last_login_at = row
                .get("last_login_at")
                .and_then(|value| value.as_str())
                .map(str::to_string);
            Some(AccountProfileSummary {
                user_id,
                display_name,
                role,
                is_active,
                created_at,
                last_login_at,
            })
        })
        .collect())
}

pub(crate) async fn fetch_account_generation_totals(
    state: &AppState,
    service_role_bearer: &str,
) -> Result<HashMap<String, i64>, GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/generation_totals?select=user_id,total_count",
            state.supabase_url
        ))
        .header("apikey", service_role_bearer)
        .bearer_auth(service_role_bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取账号累计生图失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取账号累计生图返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析账号累计生图失败：{error}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let user_id = row
                .get("user_id")
                .and_then(|value| value.as_str())?
                .to_string();
            let total_count = row
                .get("total_count")
                .and_then(|value| value.as_i64())
                .unwrap_or(0);
            Some((user_id, total_count))
        })
        .collect())
}

pub(crate) async fn fetch_account_generation_month_counts(
    state: &AppState,
    service_role_bearer: &str,
    stat_month: &str,
) -> Result<HashMap<String, i64>, GatewayError> {
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/generation_monthly_totals?select=user_id,month_count&stat_month=eq.{}",
            state.supabase_url, stat_month
        ))
        .header("apikey", service_role_bearer)
        .bearer_auth(service_role_bearer)
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取本月生图失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取本月生图返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }
    let rows: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析本月生图失败：{error}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let user_id = row
                .get("user_id")
                .and_then(|value| value.as_str())?
                .to_string();
            let month_count = row
                .get("month_count")
                .and_then(|value| value.as_i64())
                .unwrap_or(0);
            Some((user_id, month_count))
        })
        .collect())
}

pub(crate) fn service_role_bearer(state: &AppState) -> Result<&str, GatewayError> {
    state
        .supabase_service_role_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            GatewayError::bad_gateway("未配置 SUPABASE_SERVICE_ROLE_KEY，无法公开读取账号生图统计")
        })
}

pub(crate) fn current_shanghai_month_range() -> (String, String, String) {
    let now = chrono::Utc::now();
    let shanghai_now = now + chrono::Duration::hours(8);
    let start_naive = shanghai_now
        .date_naive()
        .with_day(1)
        .expect("valid first day of month")
        .and_hms_opt(0, 0, 0)
        .expect("valid month start time");
    let end_naive = if start_naive.month() == 12 {
        chrono::NaiveDate::from_ymd_opt(start_naive.year() + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(start_naive.year(), start_naive.month() + 1, 1)
    }
    .expect("valid next month")
    .and_hms_opt(0, 0, 0)
    .expect("valid month end time");
    let month_start = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
        start_naive - chrono::Duration::hours(8),
        chrono::Utc,
    );
    let month_end = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
        end_naive - chrono::Duration::hours(8),
        chrono::Utc,
    );
    let stat_month = start_naive.date().format("%Y-%m-%d").to_string();
    (
        month_start.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        month_end.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        stat_month,
    )
}
