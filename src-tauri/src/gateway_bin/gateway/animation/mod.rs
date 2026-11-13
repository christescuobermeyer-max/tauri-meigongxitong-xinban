use super::*;
use crate::product_animation::{AnimationMedia, AnimationSpec};
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
mod provider;
mod store;
mod uploads;
pub(crate) use uploads::{animation_showcase, upload_animation};
#[cfg(test)]
mod tests;
mod worker;

#[derive(Clone, Deserialize)]
pub(super) struct Job {
    id: String,
    user_id: String,
    request_hash: String,
    source_key: String,
    spec: AnimationSpec,
    status: String,
    upstream_id: Option<String>,
    credential_hash: Option<String>,
    result: Option<StoredResult>,
    error: Option<String>,
    created_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StoredResult {
    original_key: String,
    result_key: String,
    poster_key: String,
    media: AnimationMedia,
    source_media: crate::product_animation::model::ModelSourceMedia,
    sha256: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JobView {
    id: String,
    status: String,
    spec: AnimationSpec,
    error: Option<String>,
    created_at: String,
    result: Option<serde_json::Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubmitRequest {
    id: String,
    source_png: String,
    spec: AnimationSpec,
}
#[derive(Deserialize)]
pub(crate) struct JobQuery {
    id: Option<String>,
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn enabled() -> bool {
    env::var("PRODUCT_ANIMATION_ENABLED").as_deref() == Ok("true")
}
fn validate_source(bytes: &[u8], spec: &AnimationSpec) -> Result<(), String> {
    spec.validate()?;
    if spec.style != "steam" || spec.width % 16 != 0 || spec.height % 16 != 0 {
        return Err("模型动图仅支持热气腾腾，尺寸须为16的倍数".into());
    }
    if bytes.len() > 20_000_000 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("请上传20MB以内PNG参考图".into());
    }
    let dimensions =
        image::ImageReader::with_format(std::io::Cursor::new(bytes), image::ImageFormat::Png)
            .into_dimensions()
            .map_err(|_| "参考图损坏")?;
    if dimensions != (spec.width, spec.height) {
        return Err("参考图尺寸与所选画布不一致".into());
    }
    image::load_from_memory_with_format(bytes, image::ImageFormat::Png)
        .map_err(|_| "参考图解码失败")?;
    Ok(())
}
fn view(job: Job) -> Result<JobView, String> {
    let result=job.result.as_ref().map(|result|Ok::<_,String>(json!({
        "url":oss::animation_download_url(&result.result_key)?,"posterUrl":oss::animation_download_url(&result.poster_key)?,
        "media":result.media,"sourceMedia":result.source_media,"sha256":result.sha256
    }))).transpose()?;
    Ok(JobView {
        id: job.id,
        status: job.status,
        spec: job.spec,
        error: job.error,
        created_at: job.created_at,
        result,
    })
}
pub(crate) async fn animation_capabilities(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, GatewayError> {
    verify_access_token(&state, &headers).await?;
    Ok(Json(
        json!({"enabled":enabled()&&provider::key().is_ok()&&state.supabase_service_role_key.is_some(),"model":"gpt-image-2.6","style":"steam"}),
    ))
}
pub(crate) async fn submit_animation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SubmitRequest>,
) -> Result<impl IntoResponse, GatewayError> {
    let user = verify_access_token(&state, &headers).await?;
    if !enabled() {
        return Err(GatewayError::bad_request("模型动图尚未开放，请联系管理员"));
    }
    provider::key().map_err(GatewayError::bad_gateway)?;
    let id = uuid::Uuid::parse_str(&req.id)
        .map_err(|_| GatewayError::bad_request("任务标识无效"))?
        .to_string();
    if req.source_png.len() > 27_000_000 {
        return Err(GatewayError::bad_request("上传图片过大"));
    }
    let bytes = STANDARD
        .decode(&req.source_png)
        .map_err(|_| GatewayError::bad_request("图片编码无效"))?;
    let spec = req.spec.clone();
    let bytes = tokio::task::spawn_blocking(move || {
        validate_source(&bytes, &spec)?;
        Ok::<_, String>(bytes)
    })
    .await
    .map_err(|_| GatewayError::bad_gateway("参考图校验失败"))?
    .map_err(GatewayError::bad_request)?;
    let hash = digest(
        &[
            bytes.as_slice(),
            serde_json::to_vec(&req.spec)
                .map_err(|_| GatewayError::bad_request("参数无效"))?
                .as_slice(),
        ]
        .concat(),
    );
    if let Some(existing) = store::list(&state, &user, Some(&id))
        .await
        .map_err(GatewayError::bad_gateway)?
        .into_iter()
        .next()
    {
        if existing.request_hash != hash {
            return Err(GatewayError::bad_request("请求标识已用于其他图片或参数"));
        }
        return Ok((
            StatusCode::ACCEPTED,
            Json(view(existing).map_err(GatewayError::bad_gateway)?),
        ));
    }
    // Content-addressed source prevents concurrent same-id requests overwriting each other's input.
    let source_key = oss::put_animation_object(
        &user,
        &id,
        &format!("source-{hash}.png"),
        &bytes,
        "image/png",
    )
    .await
    .map_err(GatewayError::bad_gateway)?;
    let value = store::request(
        &state,
        reqwest::Method::POST,
        "rpc/enqueue_product_animation",
        Some(json!({
            "p_id":id,"p_user":user,"p_hash":hash,"p_source":source_key,"p_spec":req.spec
        })),
    )
    .await
    .map_err(GatewayError::bad_gateway)?;
    let job: Job = serde_json::from_value(
        value
            .as_array()
            .and_then(|v| v.first())
            .cloned()
            .unwrap_or_default(),
    )
    .map_err(|_| GatewayError::bad_gateway("创建动图任务失败"))?;
    Ok((
        StatusCode::ACCEPTED,
        Json(view(job).map_err(GatewayError::bad_gateway)?),
    ))
}
pub(crate) async fn get_animations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<JobQuery>,
) -> Result<Json<serde_json::Value>, GatewayError> {
    let user = verify_access_token(&state, &headers).await?;
    let jobs = store::list(&state, &user, query.id.as_deref())
        .await
        .map_err(GatewayError::bad_gateway)?;
    let views: Vec<_> = jobs
        .into_iter()
        .map(view)
        .collect::<Result<_, _>>()
        .map_err(GatewayError::bad_gateway)?;
    Ok(Json(json!({"jobs":views})))
}
pub(crate) fn start_animation_worker(state: AppState) {
    worker::start(state);
}
