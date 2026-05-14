//! 品牌故事工作区 — 文案生成与线路可用性
//!
//! - 4 条线路（thread1..thread4）映射到不同的文本接口供应商
//! - 文案部分走 Rust 端，密钥不暴露到前端
//! - 图片部分由前端通过现有 image-2 `generate_image` 接口完成

use crate::brand_story_clients::{
    build_text_request, extract_text_from_response, BrandStoryProtocol,
};
use crate::env_config::read_required_env;
use crate::http_client::{build_api_client, format_reqwest_error};
use serde::{Deserialize, Serialize};

const BRAND_STORY_SYSTEM_PROMPT_TEMPLATE: &str = include_str!("../brand_story_prompt.md");

const SYSTEM_PROMPT_JSON_SUFFIX: &str = r#"

## 重要：输出格式要求
你必须返回纯 JSON 格式的数据，不要使用 markdown 代码块包裹。直接返回 JSON 对象。

JSON 结构如下：
{
  "mainSlogan": "主文案内容",
  "subSlogan": "副文案内容",
  "featureTitle": "品牌特色标题",
  "featureContent": "品牌亮点文案内容",
  "detailsTitle": "细节总标题",
  "details": [
    {"title": "细节1标题", "content": "细节1文案内容"},
    {"title": "细节2标题", "content": "细节2文案内容"},
    {"title": "细节3标题", "content": "细节3文案内容"}
  ]
}"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum BrandStoryThreadId {
    #[serde(rename = "thread1")]
    Thread1,
    #[serde(rename = "thread2")]
    Thread2,
    #[serde(rename = "thread3")]
    Thread3,
    #[serde(rename = "thread4")]
    Thread4,
}

impl Default for BrandStoryThreadId {
    fn default() -> Self {
        Self::Thread1
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BrandStoryThreadDefinition {
    pub id: BrandStoryThreadId,
    pub name: &'static str,
    pub description: &'static str,
    pub protocol: BrandStoryProtocol,
    pub text_model: &'static str,
}

pub const BRAND_STORY_THREAD_DEFINITIONS: [BrandStoryThreadDefinition; 4] = [
    BrandStoryThreadDefinition {
        id: BrandStoryThreadId::Thread1,
        name: "线路1",
        description: "yunwu-API",
        protocol: BrandStoryProtocol::OpenAi,
        text_model: "gemini-3.1-flash-lite-preview",
    },
    BrandStoryThreadDefinition {
        id: BrandStoryThreadId::Thread2,
        name: "线路2",
        description: "糖果-API",
        protocol: BrandStoryProtocol::OpenAi,
        text_model: "gemini-3-flash-preview",
    },
    BrandStoryThreadDefinition {
        id: BrandStoryThreadId::Thread3,
        name: "线路3",
        description: "向量-API",
        protocol: BrandStoryProtocol::Gemini,
        text_model: "gemini-3.1-flash-lite-preview",
    },
    BrandStoryThreadDefinition {
        id: BrandStoryThreadId::Thread4,
        name: "线路4",
        description: "128API",
        protocol: BrandStoryProtocol::OpenAi,
        text_model: "gemini-3-flash-preview",
    },
];

fn thread_runtime_env(id: BrandStoryThreadId) -> ThreadRuntimeEnv {
    match id {
        BrandStoryThreadId::Thread1 => ThreadRuntimeEnv {
            base_url_keys: &[
                "BRAND_STORY_THREAD1_BASE_URL",
                "API_BASE_URL",
            ],
            base_url_default: "https://yunwu.ai",
            text_key_envs: &[
                "BRAND_STORY_THREAD1_TEXT_API_KEY",
                "TEXT_API_KEY",
                "IMAGE_2_API_KEY",
            ],
        },
        BrandStoryThreadId::Thread2 => ThreadRuntimeEnv {
            base_url_keys: &["BRAND_STORY_THREAD2_BASE_URL"],
            base_url_default: "https://newapi.aicohere.org/v1/chat/completions",
            text_key_envs: &["BRAND_STORY_THREAD2_TEXT_API_KEY"],
        },
        BrandStoryThreadId::Thread3 => ThreadRuntimeEnv {
            base_url_keys: &["BRAND_STORY_THREAD3_BASE_URL"],
            base_url_default: "https://api.vectorengine.ai",
            text_key_envs: &["BRAND_STORY_THREAD3_TEXT_API_KEY"],
        },
        BrandStoryThreadId::Thread4 => ThreadRuntimeEnv {
            base_url_keys: &[
                "BRAND_STORY_THREAD4_BASE_URL",
                "NEW_PICTURE_WALL_128API_BASE_URL",
            ],
            base_url_default: "https://128api.cn/v1",
            text_key_envs: &[
                "BRAND_STORY_THREAD4_TEXT_API_KEY",
                "BRAND_STORY_THREAD4_API_KEY",
                "NEW_PICTURE_WALL_128API_KEY",
            ],
        },
    }
}

struct ThreadRuntimeEnv {
    base_url_keys: &'static [&'static str],
    base_url_default: &'static str,
    text_key_envs: &'static [&'static str],
}

fn resolve_base_url(env: &ThreadRuntimeEnv) -> String {
    for key in env.base_url_keys {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    env.base_url_default.to_string()
}

#[derive(Debug, Deserialize)]
pub struct BrandStoryTextRequestInput {
    pub store_name: String,
    pub category: String,
    pub thread_id: BrandStoryThreadId,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BrandCopyDetail {
    pub title: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BrandCopy {
    #[serde(rename = "mainSlogan")]
    pub main_slogan: String,
    #[serde(rename = "subSlogan")]
    pub sub_slogan: String,
    #[serde(rename = "featureTitle")]
    pub feature_title: String,
    #[serde(rename = "featureContent")]
    pub feature_content: String,
    #[serde(rename = "detailsTitle")]
    pub details_title: String,
    pub details: Vec<BrandCopyDetail>,
}

#[derive(Debug, Serialize)]
pub struct BrandStoryThreadAvailabilityItem {
    pub available: bool,
    pub name: &'static str,
    pub description: &'static str,
}

#[derive(Debug, Serialize)]
pub struct BrandStoryThreadAvailability {
    pub thread1: BrandStoryThreadAvailabilityItem,
    pub thread2: BrandStoryThreadAvailabilityItem,
    pub thread3: BrandStoryThreadAvailabilityItem,
    pub thread4: BrandStoryThreadAvailabilityItem,
}

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn brand_story_generate_text(
    req: BrandStoryTextRequestInput,
) -> Result<BrandCopy, String> {
    validate_text_request(&req)?;

    let definition = lookup_definition(req.thread_id);
    let env = thread_runtime_env(definition.id);
    let api_key = read_required_env(env.text_key_envs)?;
    let base_url = resolve_base_url(&env);

    let system_prompt = compose_system_prompt();
    let request = build_text_request(
        definition.protocol,
        &base_url,
        definition.text_model,
        &api_key,
        req.store_name.trim(),
        req.category.trim(),
        &system_prompt,
    );

    let client = build_api_client("brand-story-text")?;
    let mut builder = client.post(&request.url);
    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }
    let response = builder
        .json(&request.body)
        .send()
        .await
        .map_err(|error| {
            format!(
                "{} 文案接口请求失败：{}",
                definition.name,
                format_reqwest_error(&error)
            )
        })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取 {} 响应失败：{error}", definition.name))?;

    if !status.is_success() {
        return Err(format!(
            "{} 接口返回 {}：{}",
            definition.name,
            status,
            truncate(&body, 400)
        ));
    }

    let raw_text = extract_text_from_response(definition.protocol, &body).map_err(|error| {
        format!(
            "{} 解析响应失败：{error}；原始响应：{}",
            definition.name,
            truncate(&body, 240)
        )
    })?;

    parse_brand_copy(&raw_text).map_err(|error| {
        format!(
            "{} 文案 JSON 解析失败：{error}；原始内容：{}",
            definition.name,
            truncate(&raw_text, 240)
        )
    })
}

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub fn brand_story_thread_availability() -> BrandStoryThreadAvailability {
    BrandStoryThreadAvailability {
        thread1: availability_for(BrandStoryThreadId::Thread1),
        thread2: availability_for(BrandStoryThreadId::Thread2),
        thread3: availability_for(BrandStoryThreadId::Thread3),
        thread4: availability_for(BrandStoryThreadId::Thread4),
    }
}

fn availability_for(id: BrandStoryThreadId) -> BrandStoryThreadAvailabilityItem {
    let definition = lookup_definition(id);
    let env = thread_runtime_env(id);
    let available = read_required_env(env.text_key_envs).is_ok();
    BrandStoryThreadAvailabilityItem {
        available,
        name: definition.name,
        description: definition.description,
    }
}

fn lookup_definition(id: BrandStoryThreadId) -> BrandStoryThreadDefinition {
    BRAND_STORY_THREAD_DEFINITIONS
        .iter()
        .copied()
        .find(|item| item.id == id)
        .unwrap_or(BRAND_STORY_THREAD_DEFINITIONS[0])
}

fn validate_text_request(req: &BrandStoryTextRequestInput) -> Result<(), String> {
    let trimmed = req.store_name.trim();
    if trimmed.chars().count() < 2 || trimmed.chars().count() > 20 {
        return Err("店铺名称需为 2-20 个字符".into());
    }
    if req.category.trim().is_empty() {
        return Err("经营品类不能为空".into());
    }
    Ok(())
}

fn compose_system_prompt() -> String {
    format!("{BRAND_STORY_SYSTEM_PROMPT_TEMPLATE}{SYSTEM_PROMPT_JSON_SUFFIX}")
}

fn parse_brand_copy(generated_text: &str) -> Result<BrandCopy, String> {
    let json_text = extract_json_block(generated_text);
    let copy: BrandCopy =
        serde_json::from_str(json_text.trim()).map_err(|error| error.to_string())?;
    if copy.main_slogan.is_empty()
        || copy.sub_slogan.is_empty()
        || copy.feature_title.is_empty()
        || copy.feature_content.is_empty()
        || copy.details_title.is_empty()
        || copy.details.len() != 3
    {
        return Err("返回数据结构不完整".into());
    }
    Ok(copy)
}

fn extract_json_block(text: &str) -> String {
    if let Some(start) = text.find("```json") {
        if let Some(end) = text[start + 7..].find("```") {
            return text[start + 7..start + 7 + end].to_string();
        }
    }
    if let Some(start) = text.find("```") {
        if let Some(end) = text[start + 3..].find("```") {
            return text[start + 3..start + 3 + end].to_string();
        }
    }
    text.to_string()
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        let cut: String = text.chars().take(max).collect();
        format!("{cut}…")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_brand_copy_from_plain_json() {
        let body = r#"{
            "mainSlogan":"小炒鲜香",
            "subSlogan":"地道滋味家常风味",
            "featureTitle":"匠心慢炒鲜辣开胃",
            "featureContent":"严选食材现炒锁鲜",
            "detailsTitle":"三大亮点用心呈现",
            "details":[
                {"title":"鲜辣","content":"匠心慢炒锁住鲜辣，香气浓郁满足味蕾"},
                {"title":"现做","content":"接单后明火现炒，分量足够诚意十足"},
                {"title":"暖心","content":"温度恰到好处入口，让每一口都暖心十足"}
            ]
        }"#;
        let copy = parse_brand_copy(body).unwrap();
        assert_eq!(copy.details.len(), 3);
        assert_eq!(copy.main_slogan, "小炒鲜香");
    }

    #[test]
    fn parses_brand_copy_from_markdown_code_block() {
        let body = "```json\n{\n\"mainSlogan\":\"a\",\"subSlogan\":\"bb\",\"featureTitle\":\"c\",\"featureContent\":\"d\",\"detailsTitle\":\"e\",\"details\":[{\"title\":\"1\",\"content\":\"x\"},{\"title\":\"2\",\"content\":\"x\"},{\"title\":\"3\",\"content\":\"x\"}]\n}\n```";
        let copy = parse_brand_copy(body).unwrap();
        assert_eq!(copy.main_slogan, "a");
    }

    #[test]
    fn rejects_too_short_store_name() {
        let err = validate_text_request(&BrandStoryTextRequestInput {
            store_name: "a".into(),
            category: "甜品".into(),
            thread_id: BrandStoryThreadId::Thread1,
        })
        .unwrap_err();
        assert!(err.contains("2-20"));
    }
}
