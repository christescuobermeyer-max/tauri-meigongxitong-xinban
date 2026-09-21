use crate::brand_story_clients::{build_openai_chat_completions_url, extract_text_from_response, BrandStoryProtocol};
use crate::env_config::read_required_env;
use crate::http_client::build_api_client;
use crate::prompt_templates::render_prompt_from_default_store;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Deserialize)]
pub struct MenuOrganizeRequest {
    #[serde(default)]
    pub text: String,
    pub category: String,
    #[serde(default)]
    pub screenshots: Vec<String>,
}

#[derive(Serialize)]
pub struct MenuOrganizeResponse { pub menu: String }

fn validate(req: &MenuOrganizeRequest) -> Result<(), String> {
    if req.category.trim().is_empty() || req.category.chars().count() > 60 {
        return Err("经营品类需为 1-60 个字符".into());
    }
    if req.text.chars().count() > 12000 || req.screenshots.len() > 6 {
        return Err("菜单文字最多 12000 字，截图最多 6 张".into());
    }
    if req.text.trim().is_empty() && req.screenshots.is_empty() {
        return Err("请输入菜品信息或上传菜单截图".into());
    }
    for screenshot in &req.screenshots {
        let data = screenshot.strip_prefix("data:image/jpeg;base64,")
            .or_else(|| screenshot.strip_prefix("data:image/png;base64,"))
            .or_else(|| screenshot.strip_prefix("data:image/webp;base64,"))
            .ok_or("仅支持 PNG、JPEG 或 WebP 图片数据")?;
        if data.is_empty() || data.len() > 8 * 1024 * 1024 {
            return Err("截图为空或过大".into());
        }
        base64::engine::general_purpose::STANDARD.decode(data).map_err(|_| "截图编码无效")?;
    }
    Ok(())
}

pub async fn organize(req: MenuOrganizeRequest) -> Result<MenuOrganizeResponse, String> {
    validate(&req)?;
    let key = read_required_env(&["MENU_TEXT_API_KEY", "BRAND_STORY_THREAD1_TEXT_API_KEY", "TEXT_API_KEY", "IMAGE_2_API_KEY"])?;
    let base = std::env::var("MENU_TEXT_BASE_URL").or_else(|_| std::env::var("BRAND_STORY_THREAD1_BASE_URL"))
        .or_else(|_| std::env::var("API_BASE_URL")).unwrap_or_else(|_| "https://api.zhongzhuan.vip".into());
    let model = std::env::var("MENU_TEXT_MODEL").unwrap_or_else(|_| "gemini-3.1-flash-lite".into());
    let system = render_prompt_from_default_store("menu.organize", json!({}))?;
    let mut content = vec![json!({"type":"text", "text": format!("经营品类：{}\n原始菜单资料：\n{}", req.category, req.text)})];
    for screenshot in req.screenshots {
        content.push(json!({"type":"image_url","image_url":{"url":screenshot}}));
    }
    let response = build_api_client("menu-organize")?
        .post(build_openai_chat_completions_url(&base))
        .bearer_auth(key)
        .json(&json!({"model":model,"messages":[{"role":"system","content":system},{"role":"user","content":content}],"temperature":0.1,"stream":false}))
        .send().await.map_err(|_| "菜单整理请求失败，请稍后重试")?;
    if !response.status().is_success() {
        return Err(format!("菜单整理接口返回 HTTP {}，请稍后重试", response.status().as_u16()));
    }
    let body = response.text().await.map_err(|_| "读取菜单整理响应失败")?;
    let menu = extract_text_from_response(BrandStoryProtocol::OpenAi, &body)?;
    if menu.chars().count() > 12000 { return Err("整理后的菜单过长，请分批整理".into()); }
    Ok(MenuOrganizeResponse { menu })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renders_menu_templates_without_recursive_interpolation() {
        let store = crate::prompt_templates::PromptTemplateStore::from_path(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../prompt-templates/generation-prompts.json")
        );
        let rendered = store.render(&crate::prompt_templates::PromptRenderRequest {
            key: "menu.image".into(), variables: json!({"storeName":"测试店", "category":"烧烤", "menu":"羊肉串 5元/串 {{unknown}}"})
        }).unwrap();
        assert!(rendered.contains("羊肉串 5元/串 {{unknown}}"));
        assert!(rendered.contains("烧烤"));
        assert!(!rendered.contains("{{storeName}}"));
        assert!(store.render(&crate::prompt_templates::PromptRenderRequest { key:"menu.organize".into(), variables:json!({}) }).is_ok());
    }
    #[test]
    fn accepts_text_or_screenshot_only() {
        assert!(validate(&MenuOrganizeRequest { text: "羊肉串 5元/串".into(), category: "烧烤".into(), screenshots: vec![] }).is_ok());
        assert!(validate(&MenuOrganizeRequest { text: String::new(), category: "烧烤".into(), screenshots: vec!["data:image/jpeg;base64,YQ==".into()] }).is_ok());
    }
    #[test]
    fn rejects_empty_input_and_external_urls() {
        assert!(validate(&MenuOrganizeRequest { text: String::new(), category: "烧烤".into(), screenshots: vec![] }).is_err());
        assert!(validate(&MenuOrganizeRequest { text: String::new(), category: "烧烤".into(), screenshots: vec!["http://localhost/private".into()] }).is_err());
    }
}
