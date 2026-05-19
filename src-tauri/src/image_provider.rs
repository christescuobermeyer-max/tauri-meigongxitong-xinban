use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReferenceImageJsonField {
    Image,
    ReferenceImages,
}

const LINE1_API_URL: &str = "https://api3.wlai.vip/v1/images/generations";
const LINE1_MODEL: &str = "gpt-image-2-all";
const LINE1_API_KEY_ENV_KEYS: [&str; 4] = [
    "IMAGE_2_API_KEY",
    "GPT_IMAGE_2_API_KEY",
    "WLAI_IMAGE_2_API_KEY",
    "NEW_PICTURE_WALL_IMAGE2_API_KEY",
];

const LINE2_API_URL: &str = "https://yunwu.ai/v1/images/generations";
const LINE2_EDIT_API_URL: &str = "https://yunwu.ai/v1/images/edits";
const LINE2_MODEL: &str = "gpt-image-2";
const LINE2_API_KEY_ENV_KEYS: [&str; 2] = ["IMAGE_2_LINE2_API_KEY", "YUNWU_IMAGE_2_LINE2_API_KEY"];

const LINE4_API_URL: &str = "https://newapi.aicohere.org/v1/chat/completions";
const LINE4_MODEL: &str = "gpt-image-2";
const LINE4_API_KEY_ENV_KEYS: [&str; 3] = [
    "IMAGE_2_LINE4_API_KEY",
    "POCKGO_IMAGE_2_API_KEY",
    "POCKGO_API_KEY",
];

const LINE3_API_URL: &str = "https://api.vectorengine.ai/v1/images/generations";
const LINE3_EDIT_API_URL: &str = "https://api.vectorengine.ai/v1/images/edits";
const LINE3_MODEL: &str = "gpt-image-2";
const LINE3_API_KEY_ENV_KEYS: [&str; 3] = [
    "VECTORENGINE_IMAGE_2_API_KEY",
    "VECTOR_ENGINE_IMAGE_2_API_KEY",
    "IMAGE_2_LINE3_API_KEY",
];

const LINE5_API_URL: &str = "https://api.apimart.ai/v1/images/generations";
const LINE5_MODEL: &str = "gpt-image-2";
const LINE5_API_KEY_ENV_KEYS: [&str; 2] = ["APIMART_IMAGE_2_API_KEY", "IMAGE_2_LINE5_API_KEY"];

const LINE6_API_URL: &str = "https://api.manxiaobai.online/v1/images/generations";
const LINE6_EDIT_API_URL: &str = "https://api.manxiaobai.online/v1/images/edits";
const LINE6_MODEL: &str = "codex-gpt-image-2";
const LINE6_API_KEY_ENV_KEYS: [&str; 2] =
    ["MANXIAOBAI_IMAGE_2_API_KEY", "IMAGE_2_LINE6_API_KEY"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum ImageApiLine {
    #[serde(rename = "line1")]
    Line1,
    #[serde(rename = "line2")]
    Line2,
    #[serde(rename = "line3")]
    Line3,
    #[serde(rename = "line4")]
    Line4,
    #[serde(rename = "line5")]
    Line5,
    #[serde(rename = "line6")]
    Line6,
}

impl Default for ImageApiLine {
    fn default() -> Self {
        Self::Line1
    }
}

impl ImageApiLine {
    pub fn as_str(self) -> &'static str {
        match self {
            ImageApiLine::Line1 => "line1",
            ImageApiLine::Line2 => "line2",
            ImageApiLine::Line3 => "line3",
            ImageApiLine::Line4 => "line4",
            ImageApiLine::Line5 => "line5",
            ImageApiLine::Line6 => "line6",
        }
    }
}

pub struct ImageProvider {
    pub api_url: &'static str,
    pub edit_api_url: Option<&'static str>,
    pub model: &'static str,
    pub log_label: &'static str,
    pub user_label: &'static str,
    pub api_key_env_keys: &'static [&'static str],
    pub quality: Option<&'static str>,
    pub format: Option<&'static str>,
    pub reference_image_json_field: ReferenceImageJsonField,
}

pub fn resolve_image_provider(line: ImageApiLine) -> ImageProvider {
    match line {
        ImageApiLine::Line1 => ImageProvider {
            api_url: LINE1_API_URL,
            edit_api_url: None,
            model: LINE1_MODEL,
            log_label: "image-2:line1",
            user_label: "线路1",
            api_key_env_keys: &LINE1_API_KEY_ENV_KEYS,
            quality: None,
            format: None,
            reference_image_json_field: ReferenceImageJsonField::Image,
        },
        ImageApiLine::Line2 => ImageProvider {
            api_url: LINE2_API_URL,
            edit_api_url: Some(LINE2_EDIT_API_URL),
            model: LINE2_MODEL,
            log_label: "image-2:line2",
            user_label: "线路2",
            api_key_env_keys: &LINE2_API_KEY_ENV_KEYS,
            quality: Some("high"),
            format: Some("png"),
            reference_image_json_field: ReferenceImageJsonField::Image,
        },
        ImageApiLine::Line3 => ImageProvider {
            api_url: LINE3_API_URL,
            edit_api_url: Some(LINE3_EDIT_API_URL),
            model: LINE3_MODEL,
            log_label: "image-2:line3-vectorengine",
            user_label: "线路3 vectorengine",
            api_key_env_keys: &LINE3_API_KEY_ENV_KEYS,
            quality: Some("high"),
            format: Some("png"),
            reference_image_json_field: ReferenceImageJsonField::Image,
        },
        ImageApiLine::Line4 => ImageProvider {
            api_url: LINE4_API_URL,
            edit_api_url: None,
            model: LINE4_MODEL,
            log_label: "image-2:line4-pockgo",
            user_label: "线路4 pockgo",
            api_key_env_keys: &LINE4_API_KEY_ENV_KEYS,
            quality: None,
            format: None,
            reference_image_json_field: ReferenceImageJsonField::Image,
        },
        ImageApiLine::Line5 => ImageProvider {
            api_url: LINE5_API_URL,
            edit_api_url: None,
            model: LINE5_MODEL,
            log_label: "image-2:line5-apimart",
            user_label: "线路5 APIMart",
            api_key_env_keys: &LINE5_API_KEY_ENV_KEYS,
            quality: None,
            format: None,
            reference_image_json_field: ReferenceImageJsonField::Image,
        },
        ImageApiLine::Line6 => ImageProvider {
            api_url: LINE6_API_URL,
            edit_api_url: Some(LINE6_EDIT_API_URL),
            model: LINE6_MODEL,
            log_label: "image-2:line6-manxiaobai",
            user_label: "线路6 manxiaobai",
            api_key_env_keys: &LINE6_API_KEY_ENV_KEYS,
            quality: Some("high"),
            format: Some("png"),
            reference_image_json_field: ReferenceImageJsonField::Image,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{resolve_image_provider, ImageApiLine, ReferenceImageJsonField};

    #[test]
    fn line1_uses_default_image_2_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line1);

        assert_eq!(
            provider.api_url,
            "https://api3.wlai.vip/v1/images/generations"
        );
        assert_eq!(provider.model, "gpt-image-2-all");
        assert_eq!(provider.log_label, "image-2:line1");
    }

    #[test]
    fn line2_uses_yunwu_gpt_image_2_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line2);

        assert_eq!(provider.api_url, "https://yunwu.ai/v1/images/generations");
        assert_eq!(
            provider.edit_api_url,
            Some("https://yunwu.ai/v1/images/edits")
        );
        assert_eq!(provider.model, "gpt-image-2");
        assert_eq!(provider.log_label, "image-2:line2");
        assert_eq!(provider.api_key_env_keys[0], "IMAGE_2_LINE2_API_KEY");
        assert_eq!(provider.quality, Some("high"));
        assert_eq!(provider.format, Some("png"));
    }

    #[test]
    fn line3_uses_vectorengine_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line3);

        assert_eq!(
            provider.api_url,
            "https://api.vectorengine.ai/v1/images/generations"
        );
        assert_eq!(
            provider.edit_api_url,
            Some("https://api.vectorengine.ai/v1/images/edits")
        );
        assert_eq!(provider.model, "gpt-image-2");
        assert_eq!(provider.log_label, "image-2:line3-vectorengine");
        assert_eq!(provider.quality, Some("high"));
        assert_eq!(provider.format, Some("png"));
        assert_eq!(
            provider.reference_image_json_field,
            ReferenceImageJsonField::Image
        );
    }

    #[test]
    fn line4_uses_pockgo_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line4);

        assert_eq!(
            provider.api_url,
            "https://newapi.aicohere.org/v1/chat/completions"
        );
        assert_eq!(provider.model, "gpt-image-2");
        assert_eq!(provider.log_label, "image-2:line4-pockgo");
        assert!(!provider.api_key_env_keys.contains(&"IMAGE_2_LINE2_API_KEY"));
    }

    #[test]
    fn line5_uses_apimart_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line5);

        assert_eq!(
            provider.api_url,
            "https://api.apimart.ai/v1/images/generations"
        );
        assert_eq!(provider.model, "gpt-image-2");
        assert_eq!(provider.log_label, "image-2:line5-apimart");
        assert_eq!(provider.api_key_env_keys[0], "APIMART_IMAGE_2_API_KEY");
    }

    #[test]
    fn line6_uses_manxiaobai_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line6);

        assert_eq!(
            provider.api_url,
            "https://api.manxiaobai.online/v1/images/generations"
        );
        assert_eq!(
            provider.edit_api_url,
            Some("https://api.manxiaobai.online/v1/images/edits")
        );
        assert_eq!(provider.model, "codex-gpt-image-2");
        assert_eq!(provider.log_label, "image-2:line6-manxiaobai");
        assert_eq!(provider.api_key_env_keys[0], "MANXIAOBAI_IMAGE_2_API_KEY");
        assert_eq!(provider.quality, Some("high"));
        assert_eq!(provider.format, Some("png"));
    }
}
