#[path = "pockgo_chat_format.rs"]
mod pockgo_chat_format;

use self::pockgo_chat_format::{build_system_prompt, extract_image_from_content, size_to_aspect_ratio};
use crate::gemini_response::truncate_for_msg;
use crate::http_client::format_reqwest_error;
use reqwest::{header::{ACCEPT_ENCODING, CONNECTION}, Version};
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Deserialize)]
struct ChatResponse {
    #[serde(default)]
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: Option<ChatChoiceMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatChoiceMessage {
    content: Option<serde_json::Value>,
}

pub async fn generate_pockgo_chat_image(
    client: &reqwest::Client,
    api_url: &str,
    api_key: String,
    model: &str,
    prompt: &str,
    size: &str,
    images: &[String],
) -> Result<String, String> {
    let payload = build_payload(model, prompt, size, images);
    let response = client
        .post(api_url)
        .version(Version::HTTP_11)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .header(CONNECTION, "close")
        .header(ACCEPT_ENCODING, "identity")
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("调用线路2 pockgo接口失败：{}", format_reqwest_error(&error)))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|error| format!("读取线路2 pockgo响应失败：{error}"))?;
    eprintln!(
        "[image-2:line2-pockgo] response_status={status} response_preview={}",
        truncate_for_msg(&body_text, 240)
    );

    if !status.is_success() {
        return Err(format!(
            "线路2 pockgo接口返回 {status}: {}",
            truncate_for_msg(&body_text, 600)
        ));
    }

    let parsed: ChatResponse = serde_json::from_str(&body_text).map_err(|error| {
        format!(
            "解析线路2 pockgo响应 JSON 失败：{error}; 原始响应片段：{}",
            truncate_for_msg(&body_text, 400)
        )
    })?;

    let content = parsed
        .choices
        .into_iter()
        .filter_map(|choice| choice.message)
        .filter_map(|message| message.content)
        .next()
        .ok_or_else(|| format!("线路2 pockgo响应未返回内容：{}", truncate_for_msg(&body_text, 240)))?;

    extract_image_from_content(&content)
        .ok_or_else(|| format!("线路2 pockgo响应未找到图片：{}", truncate_for_msg(&body_text, 360)))
}

fn build_payload<'a>(
    model: &'a str,
    prompt: &'a str,
    size: &str,
    images: &'a [String],
) -> ChatPayload<'a> {
    let mut parts = vec![ChatPart::Text {
        text: prompt.to_string(),
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
                content: ChatContent::Text(build_system_prompt(size_to_aspect_ratio(size))),
            },
            ChatMessage {
                role: "user",
                content: ChatContent::Parts(parts),
            },
        ],
        temperature: 0.7,
        max_tokens: 8192,
        stream: false,
        extra_body: ExtraBody {
            image_config: ImageConfig {
                aspect_ratio: size_to_aspect_ratio(size).to_string(),
            },
        },
    }
}
