use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct GeneratePosterResponse {
    pub base64_data: String,
    pub mime_type: String,
}

#[derive(Debug, Deserialize)]
pub struct GeminiResponse {
    #[serde(default)]
    pub candidates: Vec<GeminiCandidate>,
}

#[derive(Debug, Deserialize)]
pub struct GeminiCandidate {
    #[serde(default)]
    pub content: Option<GeminiCandidateContent>,
}

#[derive(Debug, Deserialize)]
pub struct GeminiCandidateContent {
    #[serde(default)]
    pub parts: Vec<GeminiResponsePart>,
}

#[derive(Debug, Deserialize)]
pub struct GeminiResponsePart {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default, rename = "inlineData", alias = "inline_data")]
    pub inline_data: Option<GeminiResponseInlineData>,
}

#[derive(Debug, Deserialize)]
pub struct GeminiResponseInlineData {
    #[serde(default)]
    pub data: Option<String>,
    #[serde(default, rename = "mimeType", alias = "mime_type")]
    pub mime_type: Option<String>,
}

pub fn extract_generated_image(
    parsed: GeminiResponse,
    raw_body: &str,
) -> Result<GeneratePosterResponse, String> {
    let mut texts = Vec::new();

    for candidate in parsed.candidates {
        let Some(content) = candidate.content else {
            continue;
        };

        for part in content.parts {
            if let Some(inline_data) = part.inline_data {
                if let Some(data) = inline_data.data {
                    return Ok(GeneratePosterResponse {
                        base64_data: data,
                        mime_type: inline_data
                            .mime_type
                            .unwrap_or_else(|| "image/png".to_string()),
                    });
                }
            }

            if let Some(text) = part.text {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    texts.push(trimmed.to_string());
                }
            }
        }
    }

    let text_preview = if texts.is_empty() {
        truncate_for_msg(raw_body, 240)
    } else {
        truncate_for_msg(&texts.join(" | "), 240)
    };
    Err(format!(
        "Gemini 接口未返回图片数据，返回内容：{text_preview}"
    ))
}

pub fn resolve_reference_mime_type(content_type: Option<&str>, bytes: &[u8]) -> String {
    let header_mime = content_type
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if matches!(
        header_mime.as_str(),
        "image/png" | "image/jpeg" | "image/jpg" | "image/webp"
    ) {
        return if header_mime == "image/jpg" {
            "image/jpeg".to_string()
        } else {
            header_mime
        };
    }

    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        "image/png".to_string()
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg".to_string()
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp".to_string()
    } else {
        "image/png".to_string()
    }
}

pub fn truncate_for_msg(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let cut: String = s.chars().take(max).collect();
        format!("{cut}…")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_camel_case_inline_data() {
        let parsed: GeminiResponse = serde_json::from_str(
            r#"{
                "candidates": [{
                    "content": {
                        "parts": [{
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": "abc123"
                            }
                        }]
                    }
                }]
            }"#,
        )
        .unwrap();

        let image = extract_generated_image(parsed, "").unwrap();
        assert_eq!(image.base64_data, "abc123");
        assert_eq!(image.mime_type, "image/png");
    }

    #[test]
    fn parse_snake_case_inline_data() {
        let parsed: GeminiResponse = serde_json::from_str(
            r#"{
                "candidates": [{
                    "content": {
                        "parts": [{
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": "def456"
                            }
                        }]
                    }
                }]
            }"#,
        )
        .unwrap();

        let image = extract_generated_image(parsed, "").unwrap();
        assert_eq!(image.base64_data, "def456");
        assert_eq!(image.mime_type, "image/jpeg");
    }
}
