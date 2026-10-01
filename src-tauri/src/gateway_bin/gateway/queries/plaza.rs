use super::*;

pub(crate) async fn get_line_health(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LineHealthSnapshot>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    Ok(Json(state.line_health.snapshot()))
}

#[derive(Serialize)]
pub(crate) struct GlobalGenerationTotalResponse {
    pub(crate) total_count: i64,
}

pub(crate) const IMAGE_PLAZA_PAGE_SIZE: usize = 30;
pub(crate) const IMAGE_PLAZA_MAX_PAGES: usize = 10;

#[derive(Deserialize)]
pub(crate) struct ImagePlazaQuery {
    pub(crate) page: Option<usize>,
}

#[derive(Serialize)]
pub(crate) struct ImagePlazaResponse {
    pub(crate) page: usize,
    pub(crate) page_size: usize,
    pub(crate) max_pages: usize,
    pub(crate) total_count: i64,
    pub(crate) visible_total_count: i64,
    pub(crate) page_count: usize,
    pub(crate) items: Vec<ImagePlazaItem>,
}

#[derive(Serialize)]
pub(crate) struct ImagePlazaItem {
    pub(crate) id: String,
    pub(crate) user_id: String,
    pub(crate) display_name: String,
    pub(crate) shop_name: String,
    pub(crate) product_name: Option<String>,
    pub(crate) asset_kind: String,
    pub(crate) platform: String,
    pub(crate) generation_line: Option<String>,
    pub(crate) image_url: String,
    pub(crate) created_at: String,
    pub(crate) elapsed_ms: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct SupabaseImagePlazaLogRow {
    pub(crate) id: String,
    pub(crate) user_id: String,
    pub(crate) shop_name: String,
    pub(crate) product_name: Option<String>,
    pub(crate) asset_kind: String,
    pub(crate) platform: String,
    pub(crate) generation_line: Option<String>,
    pub(crate) oss_url: String,
    pub(crate) created_at: String,
    pub(crate) elapsed_ms: Option<i64>,
}

pub(crate) async fn image_plaza(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ImagePlazaQuery>,
) -> Result<Json<ImagePlazaResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    let service_role_bearer = service_role_bearer(&state)?;
    let requested_page = query
        .page
        .unwrap_or(1)
        .clamp(1, IMAGE_PLAZA_MAX_PAGES);

    let (mut logs, total_count) =
        fetch_image_plaza_logs(&state, service_role_bearer, requested_page).await?;
    let visible_total_count = total_count.min((IMAGE_PLAZA_PAGE_SIZE * IMAGE_PLAZA_MAX_PAGES) as i64);
    let page_count = image_plaza_page_count(visible_total_count);
    let page = requested_page.min(page_count);
    if page != requested_page {
        logs = fetch_image_plaza_logs(&state, service_role_bearer, page)
            .await?
            .0;
    }

    let user_ids: std::collections::HashSet<String> =
        logs.iter().map(|row| row.user_id.clone()).collect();
    let display_names = if user_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_display_names(&state, service_role_bearer, service_role_bearer, &user_ids).await?
    };

    let items = logs
        .into_iter()
        .map(|row| {
            let display_name = display_names
                .get(&row.user_id)
                .cloned()
                .unwrap_or_else(|| "未知账号".to_string());
            ImagePlazaItem {
                id: row.id,
                user_id: row.user_id,
                display_name,
                shop_name: row.shop_name,
                product_name: row.product_name,
                asset_kind: row.asset_kind,
                platform: row.platform,
                generation_line: row.generation_line,
                image_url: row.oss_url,
                created_at: row.created_at,
                elapsed_ms: row.elapsed_ms,
            }
        })
        .collect();

    Ok(Json(ImagePlazaResponse {
        page,
        page_size: IMAGE_PLAZA_PAGE_SIZE,
        max_pages: IMAGE_PLAZA_MAX_PAGES,
        total_count,
        visible_total_count,
        page_count,
        items,
    }))
}

pub(crate) async fn fetch_image_plaza_logs(
    state: &AppState,
    service_role_bearer: &str,
    page: usize,
) -> Result<(Vec<SupabaseImagePlazaLogRow>, i64), GatewayError> {
    let range_start = (page - 1) * IMAGE_PLAZA_PAGE_SIZE;
    let range_end = range_start + IMAGE_PLAZA_PAGE_SIZE - 1;
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/generation_logs?select=id,user_id,shop_name,product_name,asset_kind,platform,generation_line,oss_url,created_at,elapsed_ms&order=created_at.desc",
            state.supabase_url
        ))
        .header("apikey", service_role_bearer)
        .bearer_auth(service_role_bearer)
        .header("Range-Unit", "items")
        .header("Range", format!("{}-{}", range_start, range_end))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取图片广场失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GatewayError::bad_gateway(format!(
            "读取图片广场返回 {status}: {}",
            gemini_response::truncate_for_msg(&body, 500)
        )));
    }

    let total_count = response
        .headers()
        .get(header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_content_range_total);
    let rows: Vec<SupabaseImagePlazaLogRow> = response
        .json()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("解析图片广场失败：{error}")))?;
    let fallback_total_count = (range_start + rows.len()) as i64;
    Ok((rows, total_count.unwrap_or(fallback_total_count)))
}

pub(crate) fn parse_content_range_total(value: &str) -> Option<i64> {
    value.rsplit('/').next()?.parse::<i64>().ok()
}

pub(crate) fn image_plaza_page_count(visible_total_count: i64) -> usize {
    let total = visible_total_count.max(0) as usize;
    let pages = total.div_ceil(IMAGE_PLAZA_PAGE_SIZE).max(1);
    pages.min(IMAGE_PLAZA_MAX_PAGES)
}
