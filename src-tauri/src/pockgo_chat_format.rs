use serde_json::Value;

const DEFAULT_SYSTEM_PROMPT: &str =
    "你是专业商业图片设计师，请根据用户提示和参考图生成一张可直接用于店铺运营的高质量图片。";

pub fn build_system_prompt(aspect_ratio: &str) -> String {
    format!(
        "{}\n{{\"imageConfig\": {{\"aspectRatio\": \"{}\"}}}}",
        DEFAULT_SYSTEM_PROMPT, aspect_ratio
    )
}

pub fn size_to_aspect_ratio(size: &str) -> &'static str {
    match size {
        "21:9" => "21:9",
        "3:4" => "3:4",
        "1024x1536" => "2:3",
        "1536x1024" => "3:2",
        _ => "1:1",
    }
}

pub fn extract_image_from_content(content: &Value) -> Option<String> {
    match content {
        Value::String(text) => extract_image_from_text(text),
        Value::Array(items) => items.iter().find_map(extract_image_from_content_part),
        Value::Object(_) => extract_image_from_content_part(content),
        _ => None,
    }
}

fn extract_image_from_content_part(part: &Value) -> Option<String> {
    let image_url = part
        .get("image_url")
        .and_then(|value| value.get("url").or(Some(value)))
        .and_then(|value| value.as_str())
        .and_then(extract_image_from_text);
    if image_url.is_some() {
        return image_url;
    }

    part.get("inline_data")
        .or_else(|| part.get("inlineData"))
        .and_then(|value| value.get("data"))
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .or_else(|| part.get("b64_json").and_then(|value| value.as_str()).map(ToString::to_string))
        .or_else(|| part.get("url").and_then(|value| value.as_str()).and_then(extract_image_from_text))
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
    if looks_like_base64_image(trimmed) {
        return Some(trimmed.to_string());
    }
    None
}

fn extract_markdown_image_target(text: &str) -> Option<&str> {
    let mut start = 0;
    while let Some(image_start) = text[start..].find("![") {
        let alt_start = start + image_start + 2;
        let Some(alt_end) = text[alt_start..].find("](") else {
            return None;
        };
        let target_start = alt_start + alt_end + 2;
        let Some(target_end) = text[target_start..].find(')') else {
            return None;
        };
        let target = text[target_start..target_start + target_end].trim();
        if !target.is_empty() {
            return Some(target);
        }
        start = target_start + target_end + 1;
    }
    None
}

fn looks_like_base64_image(value: &str) -> bool {
    value.len() > 200
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '='))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_data_url_content() {
        let value = serde_json::json!("data:image/png;base64,abc123");

        assert_eq!(extract_image_from_content(&value).unwrap(), "abc123");
    }

    #[test]
    fn extract_markdown_image_url_from_text_content() {
        let value = serde_json::json!(
            "好的，我将为您设计。\n\n|>![g2pimage](https://cloudflarer2.nananobanana.com/png/1777876630130_282.png)"
        );

        assert_eq!(
            extract_image_from_content(&value).unwrap(),
            "https://cloudflarer2.nananobanana.com/png/1777876630130_282.png"
        );
    }

    #[test]
    fn extract_markdown_data_url_content() {
        let value = serde_json::json!("![image_1](data:image/png;base64,abc123)");

        assert_eq!(extract_image_from_content(&value).unwrap(), "abc123");
    }

    #[test]
    fn build_system_prompt_contains_aspect_ratio() {
        let prompt = build_system_prompt("3:2");

        assert!(prompt.contains(DEFAULT_SYSTEM_PROMPT));
        assert!(prompt.contains("\"aspectRatio\": \"3:2\""));
    }

    #[test]
    fn map_poster_size_to_wide_aspect_ratio() {
        assert_eq!(size_to_aspect_ratio("21:9"), "21:9");
    }
}
