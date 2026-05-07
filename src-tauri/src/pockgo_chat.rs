#[path = "pockgo_chat_format.rs"]
mod pockgo_chat_format;

use self::pockgo_chat_format::{
    build_system_prompt, extract_image_from_content, size_to_aspect_ratio,
};
use crate::gemini_response::truncate_for_msg;
use crate::pockgo_transport::send_pockgo_chat_request;
use serde::Serialize;

#[derive(Debug, Serialize)]
struct ChatPayload<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    temperature: f32,
    max_tokens: u32,
    stream: bool,
    extra_body: ExtraBody,
}

#[derive(Debug, Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: ChatContent,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum ChatContent {
    Text(String),
    Parts(Vec<ChatPart>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ChatPart {
    Text { text: String },
    ImageUrl { image_url: ImageUrl },
}

#[derive(Debug, Serialize)]
struct ImageUrl {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtraBody {
    image_config: ImageConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageConfig {
    aspect_ratio: String,
}

pub async fn generate_pockgo_chat_image(
    api_url: &str,
    api_key: String,
    model: &str,
    prompt: &str,
    size: &str,
    images: &[String],
) -> Result<String, String> {
    let payload = build_payload(model, prompt, size, images);
    let (status, body_text) = send_pockgo_chat_request(api_url, &api_key, &payload)
        .await
        .map_err(|error| format!("调用线路4 pockgo接口失败：{error}"))?;
    eprintln!(
        "[image-2:line4-pockgo] response_status={status} response_preview={}",
        truncate_for_msg(&body_text, 240)
    );

    if !(200..300).contains(&status) {
        return Err(format_pockgo_status_error(status, &body_text));
    }

    extract_image_from_response_body(&body_text)
}

fn extract_image_from_response_body(body_text: &str) -> Result<String, String> {
    if body_text.trim_start().starts_with("data:") {
        return extract_image_from_stream_body(body_text).ok_or_else(|| {
            format!(
                "线路4 pockgo流式响应未找到图片：{}",
                truncate_for_msg(body_text, 360)
            )
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(body_text).map_err(|error| {
        format!(
            "解析线路4 pockgo响应 JSON 失败：{error}; 原始响应片段：{}",
            truncate_for_msg(body_text, 400)
        )
    })?;

    extract_image_from_choices(&parsed)
        .or_else(|| extract_image_from_content(&parsed))
        .ok_or_else(|| {
            format!(
                "线路4 pockgo响应未找到图片：{}",
                truncate_for_msg(body_text, 360)
            )
        })
}

fn extract_image_from_stream_body(body_text: &str) -> Option<String> {
    let mut content = String::new();

    for line in body_text.lines() {
        let line = line.trim();
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else {
            continue;
        };
        if let Some(image) = extract_stream_structured_image(&value) {
            return Some(image);
        }
        if let Some(text) = extract_stream_delta_content(&value) {
            content.push_str(&text);
        }
    }

    if content.is_empty() {
        None
    } else {
        extract_image_from_content(&serde_json::Value::String(content))
    }
}

fn extract_stream_structured_image(value: &serde_json::Value) -> Option<String> {
    value
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| {
            choices
                .iter()
                .filter_map(|choice| choice.get("message").or_else(|| choice.get("delta")))
                .find_map(extract_image_from_content)
        })
        .or_else(|| extract_image_from_content(value))
}

fn extract_stream_delta_content(value: &serde_json::Value) -> Option<String> {
    value
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| {
            choices.iter().find_map(|choice| {
                choice
                    .get("delta")
                    .or_else(|| choice.get("message"))
                    .and_then(|message| message.get("content"))
                    .and_then(|content| content.as_str())
            })
        })
        .map(ToString::to_string)
        .or_else(|| {
            value
                .get("content")
                .and_then(|content| content.as_str())
                .map(ToString::to_string)
        })
}

fn extract_image_from_choices(parsed: &serde_json::Value) -> Option<String> {
    parsed
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| {
            choices
                .iter()
                .filter_map(|choice| choice.get("message"))
                .find_map(extract_image_from_content)
        })
}

fn build_payload<'a>(
    model: &'a str,
    prompt: &'a str,
    size: &str,
    images: &'a [String],
) -> ChatPayload<'a> {
    let aspect_ratio = size_to_aspect_ratio(size);
    let strict_prompt = build_strict_user_prompt(prompt, aspect_ratio);
    let mut parts = vec![ChatPart::Text {
        text: strict_prompt,
    }];
    parts.extend(images.iter().map(|image| ChatPart::ImageUrl {
        image_url: ImageUrl {
            url: image.trim().to_string(),
            detail: Some("auto".to_string()),
        },
    }));

    ChatPayload {
        model,
        messages: vec![
            ChatMessage {
                role: "system",
                content: ChatContent::Text(build_system_prompt(aspect_ratio)),
            },
            ChatMessage {
                role: "user",
                content: ChatContent::Parts(parts),
            },
        ],
        temperature: 0.7,
        max_tokens: 8192,
        stream: true,
        extra_body: ExtraBody {
            image_config: ImageConfig {
                aspect_ratio: aspect_ratio.to_string(),
            },
        },
    }
}

fn build_strict_user_prompt(prompt: &str, aspect_ratio: &str) -> String {
    if aspect_ratio == "1:1" {
        return format!("最终图片画布比例必须严格为 1:1 正方形，不要改变为其他比例。\n{prompt}");
    }

    format!(
        "最终图片画布比例必须严格为 {aspect_ratio}，不要生成 1:1 正方形画布，不要改变为其他比例。\n{prompt}"
    )
}

fn format_pockgo_status_error(status: u16, body_text: &str) -> String {
    if body_text.contains("file upload init failed") && body_text.contains("token_expired") {
        return format!(
            "线路4 pockgo上游文件上传授权已过期：请求已成功到达线路4服务端，不是本地API key或OSS链接配置问题。请暂时切换线路1/线路2/线路3，或联系线路4服务商刷新上游授权。原始返回：{}",
            truncate_for_msg(body_text, 360)
        );
    }

    if status == 401 && body_text.contains("Invalid token") {
        return format!(
            "线路4 pockgo API key 无效或已过期，请更新本机线路4密钥。原始返回：{}",
            truncate_for_msg(body_text, 360)
        );
    }

    format!(
        "线路4 pockgo接口返回 {status}: {}",
        truncate_for_msg(body_text, 600)
    )
}

#[cfg(test)]
mod tests {
    use super::{build_payload, extract_image_from_response_body, format_pockgo_status_error};

    #[test]
    fn explain_upstream_file_upload_token_expired() {
        let body = r#"{"error":{"message":"file upload init failed: 401 {\"error\":{\"message\":\"Provided authentication token is expired. Please try signing in again.\",\"code\":\"token_expired\"}}","code":"bad_response_status_code"}}"#;

        let message = format_pockgo_status_error(502, body);

        assert!(message.contains("上游文件上传授权已过期"));
        assert!(message.contains("不是本地API key或OSS链接配置问题"));
        assert!(message.contains("切换线路1/线路2/线路3"));
    }

    #[test]
    fn explain_invalid_local_pockgo_key() {
        let body = r#"{"error":{"message":"Invalid token","type":"new_api_error"}}"#;

        let message = format_pockgo_status_error(401, body);

        assert!(message.contains("API key 无效或已过期"));
        assert!(message.contains("更新本机线路4密钥"));
    }

    #[test]
    fn extract_image_from_top_level_data_response() {
        let body =
            r#"{"id":"img_123","data":[{"url":"https://example.com/generated/second.png"}]}"#;

        let image = extract_image_from_response_body(body).unwrap();

        assert_eq!(image, "https://example.com/generated/second.png");
    }

    #[test]
    fn line4_payload_uses_streaming_response() {
        let images = vec!["https://example.com/source.jpg".to_string()];
        let payload = build_payload("gpt-image-2", "生成图片墙", "3:4", &images);

        assert!(payload.stream);
    }

    #[test]
    fn extract_image_from_streamed_delta_content() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"![image_1](data:image/png;base64,abc\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"123)\"}}]}\n\n",
            "data: [DONE]\n\n"
        );

        let image = extract_image_from_response_body(body).unwrap();

        assert_eq!(image, "abc123");
    }
}
