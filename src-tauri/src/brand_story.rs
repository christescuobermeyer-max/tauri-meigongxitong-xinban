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
use crate::prompt_templates;
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
        description: "向量引擎",
        protocol: BrandStoryProtocol::OpenAi,
        text_model: "gemini-3.1-flash-lite",
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
        text_model: "gemini-3.1-flash-lite",
    },
    BrandStoryThreadDefinition {
        id: BrandStoryThreadId::Thread4,
        name: "线路4",
        description: "128API",
        protocol: BrandStoryProtocol::OpenAi,
        text_model: "gemini-3-flash-preview",
    },
];

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


#[path = "brand_story/runtime.rs"]
mod runtime;
use runtime::*;
#[path = "brand_story/service.rs"]
mod service;
use service::*;
#[path = "brand_story/text.rs"]
mod text;
use text::*;
pub use service::{brand_story_generate_text, brand_story_thread_availability};
#[cfg(feature = "tauri-commands")]
pub use service::{__cmd__brand_story_generate_text, __cmd__brand_story_thread_availability};

#[cfg(test)]
#[path = "brand_story/tests.rs"]
mod tests;
