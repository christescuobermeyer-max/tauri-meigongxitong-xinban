use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, env, fs, path::PathBuf};

const DEFAULT_TEMPLATE_RELATIVE_PATH: &str = "prompts/generation-prompts.json";
const REPO_TEMPLATE_RELATIVE_PATH: &str = "prompt-templates/generation-prompts.json";
const PRODUCTION_TEMPLATE_PATH: &str = "/opt/csgh-gateway/prompts/generation-prompts.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PromptRenderRequest {
    pub key: String,
    #[serde(default)]
    pub variables: Value,
}

#[derive(Clone, Debug)]
pub struct PromptTemplateStore {
    explicit_path: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
struct PromptTemplateFile {
    templates: HashMap<String, String>,
    #[serde(default)]
    theme_color_hints: HashMap<String, String>,
    #[serde(default)]
    brand_style_hints: HashMap<String, String>,
    #[serde(default)]
    detail_page_types: Vec<DetailPageType>,
}

#[derive(Clone, Debug, Deserialize)]
struct DetailPageType {
    name: String,
    english: String,
    desc: String,
}

impl Default for PromptTemplateStore {
    fn default() -> Self {
        Self::from_env()
    }
}

impl PromptTemplateStore {
    pub fn from_env() -> Self {
        let explicit_path = env::var("PROMPT_TEMPLATE_PATH")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(PathBuf::from);
        Self { explicit_path }
    }

    #[cfg(test)]
    pub fn from_path(path: impl Into<PathBuf>) -> Self {
        Self {
            explicit_path: Some(path.into()),
        }
    }

    pub fn render(&self, req: &PromptRenderRequest) -> Result<String, String> {
        let path = self.resolve_path()?;
        let file = read_template_file(&path)?;
        render_prompt(&file, req)
    }

    fn resolve_path(&self) -> Result<PathBuf, String> {
        if let Some(path) = &self.explicit_path {
            if path.exists() {
                return Ok(path.clone());
            }
            return Err(format!("PROMPT_TEMPLATE_PATH 指向的文件不存在：{}", path.display()));
        }

        for candidate in default_template_candidates() {
            if candidate.exists() {
                return Ok(candidate);
            }
        }

        Err(format!(
            "未找到云端 prompt 模板文件，请配置 PROMPT_TEMPLATE_PATH 或放置 {}",
            PRODUCTION_TEMPLATE_PATH
        ))
    }
}

pub fn render_prompt_from_default_store(key: &str, variables: Value) -> Result<String, String> {
    PromptTemplateStore::from_env().render(&PromptRenderRequest {
        key: key.to_string(),
        variables,
    })
}

fn default_template_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    candidates.push(PathBuf::from(DEFAULT_TEMPLATE_RELATIVE_PATH));
    candidates.push(PathBuf::from(REPO_TEMPLATE_RELATIVE_PATH));
    candidates.push(PathBuf::from("..").join(REPO_TEMPLATE_RELATIVE_PATH));
    if let Ok(exe_path) = env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            candidates.push(dir.join(DEFAULT_TEMPLATE_RELATIVE_PATH));
            candidates.push(dir.join(REPO_TEMPLATE_RELATIVE_PATH));
        }
    }
    candidates.push(PathBuf::from(PRODUCTION_TEMPLATE_PATH));
    candidates
}

fn read_template_file(path: &PathBuf) -> Result<PromptTemplateFile, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("读取 prompt 模板文件失败 {}：{error}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("解析 prompt 模板 JSON 失败 {}：{error}", path.display()))
}

#[path = "prompt_templates/renderer.rs"]
mod renderer;
use renderer::*;
#[path = "prompt_templates/context.rs"]
mod context;
use context::*;
#[path = "prompt_templates/image_edit.rs"]
mod image_edit;
use image_edit::*;
#[path = "prompt_templates/values.rs"]
mod values;
use values::*;
#[path = "prompt_templates/appearance.rs"]
mod appearance;
use appearance::*;

#[cfg(test)]
#[path = "prompt_templates/tests.rs"]
mod tests;
