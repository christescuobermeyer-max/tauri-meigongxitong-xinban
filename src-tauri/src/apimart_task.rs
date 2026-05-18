use crate::gemini_response::truncate_for_msg;
use crate::http_client::format_reqwest_error;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const TASK_API_BASE_URL: &str = "https://api.apimart.ai/v1/tasks";
const INITIAL_WAIT_SECS: u64 = 4;
const POLL_INTERVAL_SECS: u64 = 2;
const MAX_POLL_ATTEMPTS: usize = 120;

pub async fn submit_apimart_task<T: Serialize + ?Sized>(
    client: &reqwest::Client,
    api_url: &str,
    api_key: &str,
    payload: &T,
) -> Result<String, String> {
    let response = client
        .post(api_url)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(payload)
        .send()
        .await
        .map_err(|error| {
            format!(
                "调用线路5 APIMart接口失败：{}",
                format_reqwest_error(&error)
            )
        })?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|error| format!("读取线路5 APIMart响应失败：{error}"))?;
    eprintln!(
        "[image-2:line5-apimart] response_status={status} response_preview={}",
        truncate_for_msg(&body_text, 240)
    );

    if !status.is_success() {
        return Err(format!(
            "线路5 APIMart接口返回 {status}: {}",
            truncate_for_msg(&body_text, 600)
        ));
    }

    extract_task_id(&body_text)
}

pub async fn poll_apimart_task(
    client: &reqwest::Client,
    api_key: &str,
    task_id: &str,
) -> Result<String, String> {
    tokio::time::sleep(Duration::from_secs(INITIAL_WAIT_SECS)).await;

    for attempt in 1..=MAX_POLL_ATTEMPTS {
        let task_url = format!("{TASK_API_BASE_URL}/{task_id}");
        let body_text = fetch_task_status(client, api_key, &task_url).await?;
        let parsed: Value = serde_json::from_str(&body_text).map_err(|error| {
            format!(
                "解析线路5 APIMart任务响应失败：{error}; 原始响应片段：{}",
                truncate_for_msg(&body_text, 400)
            )
        })?;
        let status = extract_task_status(&parsed).unwrap_or_else(|| "unknown".to_string());
        eprintln!("[image-2:line5-apimart] poll={attempt} task_status={status}");

        if let Some(image) = extract_generated_image(&parsed) {
            return Ok(image);
        }
        if is_completed_status(&status) {
            return Err(format!(
                "线路5 APIMart任务已完成但未找到图片：{}",
                truncate_for_msg(&body_text, 600)
            ));
        }
        if is_failed_status(&status) {
            return Err(format!(
                "线路5 APIMart任务失败：{}",
                truncate_for_msg(&body_text, 600)
            ));
        }

        tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;
    }

    Err("线路5 APIMart任务超时，请稍后重试".to_string())
}

async fn fetch_task_status(
    client: &reqwest::Client,
    api_key: &str,
    task_url: &str,
) -> Result<String, String> {
    let response = client
        .get(task_url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| {
            format!(
                "轮询线路5 APIMart任务失败：{}",
                format_reqwest_error(&error)
            )
        })?;
    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|error| format!("读取线路5 APIMart任务响应失败：{error}"))?;

    if !status.is_success() {
        return Err(format!(
            "线路5 APIMart任务接口返回 {status}: {}",
            truncate_for_msg(&body_text, 600)
        ));
    }

    Ok(body_text)
}

fn extract_task_id(body_text: &str) -> Result<String, String> {
    let parsed: Value = serde_json::from_str(body_text).map_err(|error| {
        format!(
            "解析线路5 APIMart创建任务响应失败：{error}; 原始响应片段：{}",
            truncate_for_msg(body_text, 400)
        )
    })?;
    find_string_by_keys(&parsed, &["task_id", "taskId", "id"]).ok_or_else(|| {
        format!(
            "线路5 APIMart创建任务响应中未找到 task_id：{}",
            truncate_for_msg(body_text, 600)
        )
    })
}

fn extract_task_status(parsed: &Value) -> Option<String> {
    find_string_by_keys(parsed, &["status", "task_status", "state"])
        .map(|status| status.to_ascii_lowercase())
}

fn extract_generated_image(parsed: &Value) -> Option<String> {
    if let Some(image) = parsed
        .get("data")
        .and_then(|data| data.get("result"))
        .and_then(|result| result.get("images"))
        .and_then(|images| images.as_array())
        .and_then(|images| images.first())
        .and_then(|first| first.get("url"))
        .and_then(extract_image_value)
    {
        return Some(image);
    }

    let data = parsed.get("data").unwrap_or(parsed);
    [
        "output",
        "result",
        "response",
        "images",
        "image_url",
        "url",
        "b64_json",
    ]
    .iter()
    .find_map(|key| data.get(*key).and_then(extract_image_value))
}

fn extract_image_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => extract_image_from_text(text),
        Value::Array(items) => items.iter().find_map(extract_image_value),
        Value::Object(map) => ["url", "image_url", "b64_json", "content", "text", "images"]
            .iter()
            .find_map(|key| map.get(*key).and_then(extract_image_value)),
        _ => None,
    }
}

fn extract_image_from_text(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.starts_with("data:image/") {
        return trimmed.split_once(',').map(|(_, b64)| b64.to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed.to_string());
    }
    None
}

fn find_string_by_keys(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::String(_) => None,
        Value::Array(items) => items
            .iter()
            .find_map(|item| find_string_by_keys(item, keys)),
        Value::Object(map) => {
            for key in keys {
                if let Some(Value::String(text)) = map.get(*key) {
                    return Some(text.clone());
                }
            }
            map.values()
                .find_map(|item| find_string_by_keys(item, keys))
        }
        _ => None,
    }
}

fn is_failed_status(status: &str) -> bool {
    matches!(
        status,
        "failed" | "failure" | "error" | "cancelled" | "canceled"
    )
}

fn is_completed_status(status: &str) -> bool {
    matches!(status, "completed" | "complete" | "success" | "succeeded")
}
