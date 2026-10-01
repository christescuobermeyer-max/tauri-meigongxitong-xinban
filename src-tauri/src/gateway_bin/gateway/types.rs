use super::*;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) client: reqwest::Client,
    pub(crate) supabase_url: String,
    pub(crate) supabase_anon_key: String,
    pub(crate) supabase_service_role_key: Option<String>,
    pub(crate) line_health: Arc<LineHealthRegistry>,
    pub(crate) generation_queue: Arc<GatewayGenerationQueue>,
    pub(crate) oss_archive_limiter: Arc<Semaphore>,
    pub(crate) pause_state: Arc<PauseStateRegistry>,
    pub(crate) apimart_tasks: Arc<ApimartTaskStore>,
    pub(crate) prompt_templates: Arc<prompt_templates::PromptTemplateStore>,
}

#[derive(Serialize)]
pub(crate) struct HealthResponse {
    pub(crate) ok: bool,
    pub(crate) service: &'static str,
}

pub(crate) const DOUYIN_COOKIE_FILE_NAME: &str = "抖音cookie.txt";
pub(crate) const DOUYIN_BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
pub(crate) const NETSCAPE_COOKIE_HEADER: &str = "# Netscape HTTP Cookie File";

#[derive(Serialize)]
pub(crate) struct ErrorResponse {
    pub(crate) error: String,
}

#[derive(serde::Deserialize)]
pub(crate) struct ParseDouyinVideoRequest {
    pub(crate) share_text: String,
}

#[derive(Serialize)]
pub(crate) struct ParsedVideoInfo {
    #[serde(rename = "videoUrl")]
    pub(crate) video_url: String,
    pub(crate) title: String,
    pub(crate) author: String,
    pub(crate) platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) headers: Option<HashMap<String, String>>,
}

#[derive(Debug, serde::Deserialize)]
pub(crate) struct BrowserCookie {
    pub(crate) domain: String,
    #[serde(rename = "expirationDate")]
    pub(crate) expiration_date: Option<f64>,
    #[serde(rename = "hostOnly")]
    pub(crate) host_only: Option<bool>,
    pub(crate) name: String,
    pub(crate) path: Option<String>,
    pub(crate) secure: Option<bool>,
    pub(crate) session: Option<bool>,
    pub(crate) value: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ResultDelivery {
    #[default]
    InlineBase64,
    OssUrl,
}

#[derive(Serialize)]
pub(crate) struct GenerateImageResponse {
    pub(crate) image: Option<String>,
    pub(crate) image_url: Option<String>,
    pub(crate) result_delivery: ResultDelivery,
    pub(crate) generation_line: String,
    pub(crate) archive_url: Option<String>,
    pub(crate) archive_key: Option<String>,
    pub(crate) archive_error: Option<String>,
    pub(crate) history_recorded: Option<bool>,
    pub(crate) history_error: Option<String>,
}

#[derive(serde::Deserialize)]
pub(crate) struct GatewayGenerateImageRequest {
    #[serde(default)]
    pub(crate) prompt: Option<String>,
    #[serde(default)]
    pub(crate) prompt_config: Option<prompt_templates::PromptRenderRequest>,
    pub(crate) size: String,
    pub(crate) product_images: Vec<String>,
    #[serde(default)]
    pub(crate) result_delivery: ResultDelivery,
    #[serde(default)]
    pub(crate) archive: Option<ArchiveGeneratedImageRequest>,
}

pub(crate) struct DeliveredImage {
    pub(crate) image: Option<String>,
    pub(crate) image_url: Option<String>,
    pub(crate) result_delivery: ResultDelivery,
}

#[derive(Clone, serde::Deserialize)]
pub(crate) struct ArchiveGeneratedImageRequest {
    pub(crate) asset_kind: String,
    pub(crate) file_name_stem: String,
    #[serde(default)]
    pub(crate) shop_name: Option<String>,
    #[serde(default)]
    pub(crate) product_name: Option<String>,
    #[serde(default)]
    pub(crate) platform: Option<String>,
}

pub(crate) struct ArchiveGeneratedImageResult {
    pub(crate) url: String,
    pub(crate) key: String,
}
