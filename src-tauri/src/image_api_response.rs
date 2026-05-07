use crate::gemini_response::truncate_for_msg;
use serde_json::Value;

pub fn extract_image_from_response_body(body_text: &str) -> Result<String, String> {
    let parsed: Value = serde_json::from_str(body_text).map_err(|error| {
        format!(
            "解析 image-2 响应 JSON 失败：{error}; 原始响应片段：{}",
            truncate_for_msg(body_text, 400)
        )
    })?;

    extract_image_from_data(&parsed)
        .or_else(|| extract_image_from_choices(&parsed))
        .or_else(|| extract_image_from_content(&parsed))
        .ok_or_else(|| {
            format!(
                "image-2 接口响应中未找到图片：{}",
                truncate_for_msg(body_text, 600)
            )
        })
}

fn extract_image_from_data(parsed: &Value) -> Option<String> {
    parsed
        .get("data")
        .and_then(|data| data.as_array())
        .and_then(|items| items.iter().find_map(extract_image_from_content))
}

fn extract_image_from_choices(parsed: &Value) -> Option<String> {
    parsed
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| {
            choices
                .iter()
                .filter_map(|choice| choice.get("message").or_else(|| choice.get("delta")))
                .find_map(extract_image_from_content)
        })
}

fn extract_image_from_content(content: &Value) -> Option<String> {
    match content {
        Value::String(text) => extract_image_from_text(text),
        Value::Array(items) => items.iter().find_map(extract_image_from_content),
        Value::Object(map) => {
            if let Some(Value::String(b64)) = map.get("b64_json") {
                let trimmed = b64.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }

            map.get("url")
                .or_else(|| map.get("content"))
                .or_else(|| map.get("text"))
                .and_then(extract_image_from_content)
                .or_else(|| map.values().find_map(extract_image_from_content))
        }
        _ => None,
    }
}

fn extract_image_from_text(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if let Some(target) = extract_markdown_image_target(trimmed) {
        if let Some(image) = extract_image_from_text(target) {
            return Some(image);
        }
    }
    if let Some(data) = trimmed.strip_prefix("data:image/") {
        return data.split_once(',').map(|(_, b64)| b64.to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed.to_string());
    }
    extract_embedded_image_url(trimmed)
}

fn extract_markdown_image_target(text: &str) -> Option<&str> {
    let mut start = 0;
    while let Some(image_start) = text[start..].find("![") {
        let alt_start = start + image_start + 2;
        let alt_end = text[alt_start..].find("](")?;
        let target_start = alt_start + alt_end + 2;
        let target_end = text[target_start..].find(')')?;
        let target = text[target_start..target_start + target_end].trim();
        if !target.is_empty() {
            return Some(target);
        }
        start = target_start + target_end + 1;
    }
    None
}

fn extract_embedded_image_url(text: &str) -> Option<String> {
    for scheme in ["https://", "http://"] {
        let mut start = 0;
        while let Some(index) = text[start..].find(scheme) {
            let url_start = start + index;
            let url_end = text[url_start..]
                .find(|ch: char| {
                    ch.is_whitespace()
                        || matches!(ch, '"' | '\'' | '<' | '>' | ')' | ']' | '}' | '，' | '。')
                })
                .map(|offset| url_start + offset)
                .unwrap_or(text.len());
            let url = text[url_start..url_end]
                .trim_end_matches(|ch: char| matches!(ch, '.' | ',' | ';' | ':'))
                .to_string();
            if looks_like_image_url(&url) {
                return Some(url);
            }
            start = url_end.saturating_add(1);
        }
    }
    None
}

fn looks_like_image_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".webp"]
        .iter()
        .any(|ext| lower.contains(ext))
}

#[cfg(test)]
mod tests {
    use super::extract_image_from_response_body;

    #[test]
    fn extract_from_data_url_response() {
        let body = r#"{"data":[{"url":"https://example.com/generated.png"}]}"#;

        assert_eq!(
            extract_image_from_response_body(body).unwrap(),
            "https://example.com/generated.png"
        );
    }

    #[test]
    fn extract_from_plain_b64_json_response() {
        let body = r#"{"created":1777977486,"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAA"}]}"#;

        assert_eq!(
            extract_image_from_response_body(body).unwrap(),
            "iVBORw0KGgoAAAANSUhEUgAA"
        );
    }

    #[test]
    fn extract_from_chat_completion_markdown_data_url() {
        let body =
            r#"{"choices":[{"message":{"content":"![image_1](data:image/png;base64,abc123)"}}]}"#;

        assert_eq!(extract_image_from_response_body(body).unwrap(), "abc123");
    }
}
