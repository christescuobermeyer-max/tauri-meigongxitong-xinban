use serde_json::Value;

pub fn build_system_prompt(aspect_ratio: &str) -> String {
    format!(
        "{{\"imageConfig\": {{\"aspectRatio\": \"{}\"}}}}",
        aspect_ratio
    )
}

pub fn size_to_aspect_ratio(size: &str) -> &'static str {
    match size {
        "16:9" => "16:9",
        "21:9" => "21:9",
        "3:4" => "3:4",
        "1024x1536" => "2:3",
        "1536x1024" => "3:2",
        "1792x1024" => "16:9",
        _ => "1:1",
    }
}

pub fn extract_image_from_content(content: &Value) -> Option<String> {
    match content {
        Value::String(text) => extract_image_from_text(text),
        Value::Array(items) => items.iter().find_map(extract_image_from_content_part),
        Value::Object(_) => extract_image_from_content_part(content).or_else(|| {
            content
                .as_object()?
                .values()
                .find_map(extract_image_from_content)
        }),
        _ => None,
    }
}

fn extract_image_from_content_part(part: &Value) -> Option<String> {
    let structured_images = part
        .get("images")
        .or_else(|| part.get("generated_images"))
        .or_else(|| part.get("generatedImages"))
        .or_else(|| part.get("output"))
        .and_then(extract_image_from_content);
    if structured_images.is_some() {
        return structured_images;
    }

    let image_url = part
        .get("image_url")
        .and_then(|value| value.get("url").or(Some(value)))
        .and_then(|value| value.as_str())
        .and_then(extract_image_from_text);
    if image_url.is_some() {
        return image_url;
    }

    let image = part.get("image").and_then(extract_image_from_content);
    if image.is_some() {
        return image;
    }

    part.get("inline_data")
        .or_else(|| part.get("inlineData"))
        .and_then(|value| value.get("data").or(Some(value)))
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .or_else(|| {
            part.get("b64_json")
                .and_then(|value| value.as_str())
                .map(ToString::to_string)
        })
        .or_else(|| {
            part.get("url")
                .and_then(|value| value.as_str())
                .and_then(extract_image_from_text)
        })
        .or_else(|| {
            part.get("text")
                .or_else(|| part.get("content"))
                .and_then(|value| value.as_str())
                .and_then(extract_image_from_text)
        })
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
    extract_embedded_image_url(trimmed)
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

fn extract_embedded_image_url(text: &str) -> Option<String> {
    let mut image_candidates = Vec::new();
    let mut url_candidates = Vec::new();
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
                .trim_end_matches(|ch: char| matches!(ch, '.' | ',' | ';' | ':' | '、'))
                .to_string();
            if looks_like_image_url(&url) {
                image_candidates.push(url.clone());
            }
            url_candidates.push(url);
            start = url_end.saturating_add(1);
        }
    }
    image_candidates.pop().or_else(|| url_candidates.pop())
}

fn looks_like_image_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".webp"]
        .iter()
        .any(|ext| lower.contains(ext))
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
    fn extract_markdown_image_from_text_part() {
        let value = serde_json::json!([
            {
                "type": "text",
                "text": "图片已生成：![result](https://example.com/picture-wall.png)"
            }
        ]);

        assert_eq!(
            extract_image_from_content(&value).unwrap(),
            "https://example.com/picture-wall.png"
        );
    }

    #[test]
    fn extract_bare_image_url_embedded_in_text() {
        let value = serde_json::json!(
            "图片墙生成完成：https://example.com/generated/picture-wall.png 请查看。"
        );

        assert_eq!(
            extract_image_from_content(&value).unwrap(),
            "https://example.com/generated/picture-wall.png"
        );
    }

    #[test]
    fn extract_image_from_message_images_array() {
        let value = serde_json::json!({
            "role": "assistant",
            "content": "图片已完成",
            "images": [
                { "url": "https://example.com/generated?id=second-image" }
            ]
        });

        assert_eq!(
            extract_image_from_content(&value).unwrap(),
            "https://example.com/generated?id=second-image"
        );
    }

    #[test]
    fn prefer_structured_image_over_echoed_input_url() {
        let value = serde_json::json!({
            "role": "assistant",
            "content": "已参考上传图 https://oss.example.com/source.jpg 完成生成。",
            "images": [
                { "url": "https://example.com/generated?id=real-output" }
            ]
        });

        assert_eq!(
            extract_image_from_content(&value).unwrap(),
            "https://example.com/generated?id=real-output"
        );
    }

    #[test]
    fn extract_image_from_nested_image_object() {
        let value = serde_json::json!({
            "type": "output_image",
            "image": {
                "url": "https://example.com/output/second"
            }
        });

        assert_eq!(
            extract_image_from_content(&value).unwrap(),
            "https://example.com/output/second"
        );
    }

    #[test]
    fn build_system_prompt_contains_aspect_ratio() {
        let prompt = build_system_prompt("16:9");

        assert_eq!(prompt, "{\"imageConfig\": {\"aspectRatio\": \"16:9\"}}");
    }

    #[test]
    fn map_poster_size_to_wide_aspect_ratio() {
        assert_eq!(size_to_aspect_ratio("21:9"), "21:9");
    }

    #[test]
    fn map_storefront_size_to_16_9_aspect_ratio() {
        assert_eq!(size_to_aspect_ratio("1792x1024"), "16:9");
        assert_eq!(size_to_aspect_ratio("16:9"), "16:9");
    }
}
