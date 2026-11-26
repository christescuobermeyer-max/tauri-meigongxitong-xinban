// 数据分析截图读数：截图只交给视觉文本模型提取指标，生图阶段不再携带截图。
// 截图直接送进 image edits 接口时，上游有一半以上概率把原截图原样返回。
use crate::brand_story_clients::{build_openai_chat_completions_url, extract_text_from_response, BrandStoryProtocol};
use crate::env_config::read_required_env;
use crate::http_client::build_api_client;
use crate::prompt_templates::render_prompt_from_default_store;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;

const METRICS_MAX_CHARS: usize = 2000;
const UNREADABLE_MARK: &str = "无法识别";

#[derive(Deserialize)]
pub struct DataAnalysisExtractRequest {
    pub screenshot: String,
}

#[derive(Serialize)]
pub struct DataAnalysisExtractResponse {
    pub metrics: String,
}

fn validate(req: &DataAnalysisExtractRequest) -> Result<(), String> {
    let data = req.screenshot.strip_prefix("data:image/jpeg;base64,")
        .or_else(|| req.screenshot.strip_prefix("data:image/png;base64,"))
        .or_else(|| req.screenshot.strip_prefix("data:image/webp;base64,"))
        .ok_or("仅支持 PNG、JPEG 或 WebP 图片数据")?;
    if data.is_empty() || data.len() > 8 * 1024 * 1024 {
        return Err("截图为空或过大".into());
    }
    base64::engine::general_purpose::STANDARD.decode(data).map_err(|_| "截图编码无效")?;
    Ok(())
}

fn normalize_metrics(text: &str) -> Result<String, String> {
    let metrics = text.trim();
    if metrics.is_empty() || (metrics.contains(UNREADABLE_MARK) && metrics.chars().count() < 20) {
        return Err("没有从截图中识别到数据，请上传更清晰的店铺数据截图".into());
    }
    if metrics.chars().count() > METRICS_MAX_CHARS {
        return Err("截图识别结果过长，请只截取流量数据区域".into());
    }
    Ok(metrics.to_string())
}

pub async fn extract(req: DataAnalysisExtractRequest) -> Result<DataAnalysisExtractResponse, String> {
    validate(&req)?;
    let key = read_required_env(&["BRAND_STORY_THREAD1_TEXT_API_KEY", "TEXT_API_KEY", "IMAGE_2_API_KEY"])?;
    let base = std::env::var("BRAND_STORY_THREAD1_BASE_URL")
        .or_else(|_| std::env::var("API_BASE_URL")).unwrap_or_else(|_| "https://api.zhongzhuan.vip".into());
    let model = std::env::var("DATA_ANALYSIS_TEXT_MODEL").unwrap_or_else(|_| "gemini-3.1-flash-lite".into());
    let system = render_prompt_from_default_store("data_analysis.extract", json!({}))?;
    let content = json!([
        {"type": "text", "text": "请识别这张外卖店铺数据截图里的全部指标。"},
        {"type": "image_url", "image_url": {"url": req.screenshot}}
    ]);
    let response = build_api_client("data-analysis-extract")?
        .post(build_openai_chat_completions_url(&base))
        .bearer_auth(key)
        .json(&json!({"model":model,"messages":[{"role":"system","content":system},{"role":"user","content":content}],"temperature":0,"stream":false}))
        .send().await.map_err(|_| "数据截图识别请求失败，请稍后重试")?;
    if !response.status().is_success() {
        return Err(format!("数据截图识别接口返回 HTTP {}，请稍后重试", response.status().as_u16()));
    }
    let body = response.text().await.map_err(|_| "读取数据截图识别响应失败")?;
    let metrics = normalize_metrics(&extract_text_from_response(BrandStoryProtocol::OpenAi, &body)?)?;
    Ok(DataAnalysisExtractResponse { metrics })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_image_data_urls_only() {
        assert!(validate(&DataAnalysisExtractRequest { screenshot: "data:image/jpeg;base64,YQ==".into() }).is_ok());
        assert!(validate(&DataAnalysisExtractRequest { screenshot: "https://example.com/a.jpg".into() }).is_err());
        assert!(validate(&DataAnalysisExtractRequest { screenshot: "data:image/png;base64,".into() }).is_err());
    }

    #[test]
    fn rejects_empty_or_unreadable_metrics() {
        assert!(normalize_metrics("  ").is_err());
        assert!(normalize_metrics("无法识别").is_err());
        assert_eq!(normalize_metrics(" 曝光人数：5,644人\n下单人数：22人 ").unwrap(), "曝光人数：5,644人\n下单人数：22人");
    }

    #[test]
    fn extract_template_exists() {
        let store = crate::prompt_templates::PromptTemplateStore::from_path(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../prompt-templates/generation-prompts.json")
        );
        let rendered = store.render(&crate::prompt_templates::PromptRenderRequest {
            key: "data_analysis.extract".into(), variables: json!({})
        }).unwrap();
        assert!(rendered.contains("人数和次数分开"));
    }
}
