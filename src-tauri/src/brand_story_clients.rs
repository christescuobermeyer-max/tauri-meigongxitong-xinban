//! 品牌故事文案生成 — Gemini / OpenAI 双协议客户端
//!
//! 仅负责构造文本生成请求与解析响应；图片生成走当前项目的 image-2 通道。

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrandStoryProtocol {
    Gemini,
    OpenAi,
}

#[derive(Debug, Clone)]
pub struct BrandStoryTextRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: serde_json::Value,
}

pub fn build_gemini_generate_content_url(base_url: &str, model: &str, api_key: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    let encoded_key = url_encode(api_key);
    if trimmed.contains("/v1beta/models/") {
        let rebuilt = strip_after_v1beta_models(trimmed, model);
        return format!("{rebuilt}?key={encoded_key}");
    }
    format!("{trimmed}/v1beta/models/{model}:generateContent?key={encoded_key}")
}

pub fn build_openai_chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        return trimmed.to_string();
    }
    if trimmed.ends_with("/v1") {
        return format!("{trimmed}/chat/completions");
    }
    format!("{trimmed}/v1/chat/completions")
}

pub fn build_text_request(
    protocol: BrandStoryProtocol,
    base_url: &str,
    model: &str,
    api_key: &str,
    store_name: &str,
    category: &str,
    system_prompt: &str,
) -> BrandStoryTextRequest {
    let user_text = format!("店铺名：{store_name}\n经营品类：{category}");
    match protocol {
        BrandStoryProtocol::OpenAi => {
            let url = build_openai_chat_completions_url(base_url);
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user",   "content": user_text },
                ],
                "temperature": 0.8,
                "stream": false,
            });
            let headers = vec![
                ("Authorization".to_string(), format!("Bearer {api_key}")),
                ("Content-Type".to_string(), "application/json".to_string()),
            ];
            BrandStoryTextRequest { url, headers, body }
        }
        BrandStoryProtocol::Gemini => {
            let url = build_gemini_generate_content_url(base_url, model, api_key);
            let body = serde_json::json!({
                "contents": [
                    {
                        "role": "user",
                        "parts": [{ "text": user_text }],
                    }
                ],
                "systemInstruction": {
                    "parts": [{ "text": system_prompt }],
                },
                "generationConfig": {
                    "temperature": 0.8,
                },
            });
            let headers = vec![("Content-Type".to_string(), "application/json".to_string())];
            BrandStoryTextRequest { url, headers, body }
        }
    }
}

#[derive(Debug, Deserialize)]
struct OpenAiTextResponse {
    choices: Option<Vec<OpenAiTextChoice>>,
}

#[derive(Debug, Deserialize)]
struct OpenAiTextChoice {
    message: Option<OpenAiTextMessage>,
}

#[derive(Debug, Deserialize)]
struct OpenAiTextMessage {
    content: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct GeminiTextResponse {
    candidates: Option<Vec<GeminiTextCandidate>>,
}

#[derive(Debug, Deserialize)]
struct GeminiTextCandidate {
    content: Option<GeminiTextContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiTextContent {
    parts: Option<Vec<GeminiTextPart>>,
}

#[derive(Debug, Deserialize)]
struct GeminiTextPart {
    text: Option<String>,
    #[serde(default)]
    thought: bool,
}

pub fn extract_text_from_response(
    protocol: BrandStoryProtocol,
    body: &str,
) -> Result<String, String> {
    match protocol {
        BrandStoryProtocol::OpenAi => extract_openai_text(body),
        BrandStoryProtocol::Gemini => extract_gemini_text(body),
    }
}

fn extract_openai_text(body: &str) -> Result<String, String> {
    let parsed: OpenAiTextResponse = serde_json::from_str(body)
        .map_err(|error| format!("解析 OpenAI 响应失败：{error}"))?;
    let message = parsed
        .choices
        .as_ref()
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.message.as_ref())
        .ok_or_else(|| "OpenAI 响应缺少 choices/message".to_string())?;
    let content = message
        .content
        .as_ref()
        .ok_or_else(|| "OpenAI 响应缺少 message.content".to_string())?;

    if let Some(text) = content.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Some(items) = content.as_array() {
        let joined = items
            .iter()
            .filter_map(|item| {
                let ty = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if ty != "text" {
                    return None;
                }
                item.get("text").and_then(|v| v.as_str()).map(String::from)
            })
            .collect::<Vec<_>>()
            .join("\n");
        let trimmed = joined.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    Err("AI 返回空内容".to_string())
}

fn extract_gemini_text(body: &str) -> Result<String, String> {
    let parsed: GeminiTextResponse = serde_json::from_str(body)
        .map_err(|error| format!("解析 Gemini 响应失败：{error}"))?;
    let parts = parsed
        .candidates
        .as_ref()
        .and_then(|candidates| candidates.first())
        .and_then(|candidate| candidate.content.as_ref())
        .and_then(|content| content.parts.as_ref())
        .ok_or_else(|| "Gemini 响应缺少 candidates/content/parts".to_string())?;

    if parts.is_empty() {
        return Err("AI 生成失败，请重试".into());
    }

    let pick = parts
        .iter()
        .find(|part| !part.thought && part.text.as_deref().map(str::trim).map_or(false, |s| !s.is_empty()))
        .or_else(|| parts.last());

    let text = pick
        .and_then(|part| part.text.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "AI 返回空内容".to_string())?;

    Ok(text.to_string())
}

fn url_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn strip_after_v1beta_models(base_url: &str, model: &str) -> String {
    let marker = "/v1beta/models/";
    if let Some(idx) = base_url.find(marker) {
        let prefix = &base_url[..idx];
        return format!("{prefix}/v1beta/models/{model}:generateContent");
    }
    base_url.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openai_url_appends_chat_completions() {
        assert_eq!(
            build_openai_chat_completions_url("https://newapi.aicohere.org/v1/chat/completions"),
            "https://newapi.aicohere.org/v1/chat/completions"
        );
        assert_eq!(
            build_openai_chat_completions_url("https://128api.cn/v1"),
            "https://128api.cn/v1/chat/completions"
        );
        assert_eq!(
            build_openai_chat_completions_url("https://example.com"),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn gemini_url_inserts_model() {
        let got = build_gemini_generate_content_url("https://yunwu.ai", "gemini-3-flash-preview", "abc");
        assert_eq!(
            got,
            "https://yunwu.ai/v1beta/models/gemini-3-flash-preview:generateContent?key=abc"
        );
    }

    #[test]
    fn extracts_openai_string_content() {
        let body = r#"{"choices":[{"message":{"content":"hello"}}]}"#;
        assert_eq!(
            extract_text_from_response(BrandStoryProtocol::OpenAi, body).unwrap(),
            "hello"
        );
    }

    #[test]
    fn extracts_gemini_text() {
        let body = r#"{"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}"#;
        assert_eq!(
            extract_text_from_response(BrandStoryProtocol::Gemini, body).unwrap(),
            "hi"
        );
    }
}
