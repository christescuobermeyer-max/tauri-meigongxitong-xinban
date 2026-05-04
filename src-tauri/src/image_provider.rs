use serde::Deserialize;

const LINE1_API_URL: &str = "https://api3.wlai.vip/v1/images/generations";
const LINE1_MODEL: &str = "gpt-image-2-all";
const LINE1_API_KEY_ENV_KEYS: [&str; 4] = [
    "IMAGE_2_API_KEY",
    "GPT_IMAGE_2_API_KEY",
    "WLAI_IMAGE_2_API_KEY",
    "NEW_PICTURE_WALL_IMAGE2_API_KEY",
];

const LINE2_API_URL: &str = "https://newapi.aicohere.org/v1/chat/completions";
const LINE2_MODEL: &str = "gpt-image-2";
const LINE2_API_KEY_ENV_KEYS: [&str; 3] = [
    "POCKGO_IMAGE_2_API_KEY",
    "POCKGO_API_KEY",
    "IMAGE_2_LINE2_API_KEY",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum ImageApiLine {
    #[serde(rename = "line1")]
    Line1,
    #[serde(rename = "line2")]
    Line2,
}

impl Default for ImageApiLine {
    fn default() -> Self {
        Self::Line1
    }
}

pub struct ImageProvider {
    pub api_url: &'static str,
    pub model: &'static str,
    pub log_label: &'static str,
    pub user_label: &'static str,
    pub api_key_env_keys: &'static [&'static str],
}

pub fn resolve_image_provider(line: ImageApiLine) -> ImageProvider {
    match line {
        ImageApiLine::Line1 => ImageProvider {
            api_url: LINE1_API_URL,
            model: LINE1_MODEL,
            log_label: "image-2:line1",
            user_label: "线路1",
            api_key_env_keys: &LINE1_API_KEY_ENV_KEYS,
        },
        ImageApiLine::Line2 => ImageProvider {
            api_url: LINE2_API_URL,
            model: LINE2_MODEL,
            log_label: "image-2:line2-pockgo",
            user_label: "线路2 pockgo",
            api_key_env_keys: &LINE2_API_KEY_ENV_KEYS,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{resolve_image_provider, ImageApiLine};

    #[test]
    fn line1_uses_default_image_2_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line1);

        assert_eq!(provider.api_url, "https://api3.wlai.vip/v1/images/generations");
        assert_eq!(provider.model, "gpt-image-2-all");
        assert_eq!(provider.log_label, "image-2:line1");
    }

    #[test]
    fn line2_uses_pockgo_provider() {
        let provider = resolve_image_provider(ImageApiLine::Line2);

        assert_eq!(provider.api_url, "https://newapi.aicohere.org/v1/chat/completions");
        assert_eq!(provider.model, "gpt-image-2");
        assert_eq!(provider.log_label, "image-2:line2-pockgo");
    }
}
