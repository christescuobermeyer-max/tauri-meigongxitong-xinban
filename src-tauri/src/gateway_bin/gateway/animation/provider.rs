use super::*;
use futures_util::StreamExt;
use reqwest::multipart::{Form, Part};

pub(super) fn key() -> Result<String, String> {
    env_config::read_required_env(&["NOVA_IMAGE_2_API_KEY", "IMAGE_2_LINE7_API_KEY"])
        .map_err(|_| "线路7动图凭据未配置".into())
}
pub(super) fn key_hash(key: &str) -> String {
    digest(key.as_bytes())
}
fn base_url() -> String {
    resolve_image_provider(ImageApiLine::Line7)
        .api_url
        .trim_end_matches("/images/generations")
        .to_string()
}
pub(super) fn task_id(body: &serde_json::Value) -> Result<String, String> {
    let id = body
        .get("task_id")
        .or_else(|| body.get("id"))
        .and_then(|v| v.as_str())
        .ok_or("上游未返回任务标识")?;
    if id.is_empty()
        || id.len() > 200
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
    {
        return Err("上游任务标识无效".into());
    }
    Ok(id.into())
}
pub(super) fn completed_url(body: &serde_json::Value) -> Result<String, String> {
    if body["status"] != "completed" {
        return Err("上游任务未完成".into());
    }
    let url = body
        .pointer("/result/data/0/url")
        .and_then(|v| v.as_str())
        .ok_or("上游缺少结果地址")?;
    reference_image::download::validate_url(url)?;
    Ok(url.into())
}
async fn json_response(response: reqwest::Response) -> Result<serde_json::Value, String> {
    if !response.status().is_success() {
        return Err(format!("动图上游返回HTTP {}", response.status().as_u16()));
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "动图上游响应中断")?;
        if bytes.len() + chunk.len() > 512 * 1024 {
            return Err("动图上游响应过大".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "动图上游响应格式错误".into())
}
pub(super) async fn submit(
    state: &AppState,
    key: &str,
    source: Vec<u8>,
    spec: &AnimationSpec,
) -> Result<String, String> {
    let prompt="将上传的这张菜品图片制作成自然循环的美食动图。白色真实水蒸气从热食和碗边自然向上升腾、扩散、消散，汤面与食材只有轻微自然动态。保持原图全部食材、数量、摆盘、餐具、背景、招牌和文字完全一致。固定镜头、固定构图；禁止拉近、旋转、裁切、拼图、分镜和多宫格。不添加任何新文字、贴纸、图标、星星、火焰、爱心、人或手。不重写招牌。输出单幅多帧GIF，末尾与开头自然衔接。";
    let frames = 20;
    let part = Part::bytes(source)
        .file_name("source.png")
        .mime_str("image/png")
        .map_err(|_| "参考图表单错误")?;
    let form = Form::new()
        .part("image", part)
        .text("model", "gpt-image-2.6")
        .text("prompt", prompt)
        .text("n", "1")
        .text("output_format", "gif")
        .text("frame_count", frames.to_string())
        .text("frame_duration_ms", (spec.duration_ms / frames).to_string())
        .text("size", format!("{}x{}", spec.width, spec.height))
        .text("response_format", "url");
    // Never retry a submission: even a transport error can mean the provider accepted it.
    let response = state
        .client
        .post(format!("{}/images/edits/async", base_url()))
        .bearer_auth(key)
        .multipart(form)
        .timeout(Duration::from_secs(180))
        .send()
        .await
        .map_err(|_| "提交状态不确定，请勿重复生成")?;
    task_id(&json_response(response).await?)
}
pub(super) async fn poll(
    state: &AppState,
    key: &str,
    id: &str,
) -> Result<serde_json::Value, String> {
    task_id(&json!({"id":id}))?;
    let response = state
        .client
        .get(format!("{}/images/tasks/{id}", base_url()))
        .bearer_auth(key)
        .timeout(Duration::from_secs(45))
        .send()
        .await
        .map_err(|_| "动图状态查询暂不可用")?;
    json_response(response).await
}
