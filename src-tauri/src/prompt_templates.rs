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

fn render_prompt(file: &PromptTemplateFile, req: &PromptRenderRequest) -> Result<String, String> {
    let key = req.key.trim();
    if key.is_empty() {
        return Err("prompt_config.key 不能为空".to_string());
    }
    let template = file
        .templates
        .get(key)
        .ok_or_else(|| format!("prompt 模板不存在：{key}"))?;
    let context = build_context(file, req);
    render_template(template, &context)
}

fn render_template(template: &str, context: &HashMap<String, String>) -> Result<String, String> {
    let placeholder = Regex::new(r"\{\{([A-Za-z0-9_.-]+)\}\}").map_err(|e| e.to_string())?;
    let mut missing = Vec::new();
    let rendered = placeholder
        .replace_all(template, |caps: &regex::Captures<'_>| {
            let key = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            match context.get(key) {
                Some(value) => value.to_string(),
                None => {
                    missing.push(key.to_string());
                    String::new()
                }
            }
        })
        .into_owned();
    if !missing.is_empty() {
        missing.sort();
        missing.dedup();
        return Err(format!("prompt 模板变量未提供：{}", missing.join(", ")));
    }
    Ok(rendered)
}

fn build_context(file: &PromptTemplateFile, req: &PromptRenderRequest) -> HashMap<String, String> {
    let mut context = HashMap::new();
    if let Some(object) = req.variables.as_object() {
        for (key, value) in object {
            context.insert(key.clone(), value_to_prompt_string(value));
        }
    }

    let shop = first_non_empty(&req.variables, &["shopName", "storeName"])
        .unwrap_or_else(|| "未命名店铺".to_string());
    let store_name = str_var(&req.variables, "storeName").unwrap_or_else(|| shop.clone());
    let category = str_var(&req.variables, "category").unwrap_or_default();
    let product = str_var(&req.variables, "productName").unwrap_or_default();
    let platform = str_var(&req.variables, "platform").unwrap_or_default();
    let theme_color = str_var(&req.variables, "themeColor").unwrap_or_default();
    let brand_style = str_var(&req.variables, "brandStyle").unwrap_or_default();

    context.insert("shop".to_string(), shop.clone());
    context.insert("storeName".to_string(), store_name.clone());
    context.insert("categoryName".to_string(), category.clone());
    context.insert(
        "categoryDisplay".to_string(),
        if category.is_empty() {
            "该".to_string()
        } else {
            category.clone()
        },
    );
    context.insert(
        "categoryText".to_string(),
        if category.is_empty() {
            String::new()
        } else {
            format!("店铺经营品类：{category}。")
        },
    );
    context.insert("product".to_string(), product.clone());
    context.insert("layout".to_string(), platform_layout(&platform));
    context.insert(
        "appearanceClause".to_string(),
        build_appearance_clause(file, &theme_color, &brand_style),
    );

    let include_product_name = bool_var(&req.variables, "includeProductName").unwrap_or(true);
    context.insert(
        "productNameIntro".to_string(),
        if include_product_name {
            format!("产品名称：{product}。")
        } else {
            "生成时产品名称为空。".to_string()
        },
    );
    context.insert(
        "productNameInstruction".to_string(),
        if include_product_name {
            format!("并写入产品名称“{product}”在图中。")
        } else {
            "不要写入产品名称文字，也不要保留参考产品图中的原产品名或其他产品名称文字。".to_string()
        },
    );
    context.insert(
        "copyReplacement".to_string(),
        if include_product_name {
            format!("请把第1张图中的店铺名、产品名或其他原有产品文案替换为店铺名“{shop}”和产品名称“{product}”，并自然融入原参考图的文案排版区域。")
        } else {
            format!("请把第1张图中的店铺名、产品名或其他原有产品文案替换为店铺名“{shop}”；生成时产品名称为空，不要写入产品名称文字，也不要保留参考设计风格图里的原产品名。")
        },
    );

    add_package_context(&mut context, &req.variables);
    add_detail_page_context(&mut context, file, &req.variables);
    add_image_edit_context(&mut context, &req.variables);
    context
}

fn add_package_context(context: &mut HashMap<String, String>, variables: &Value) {
    let names = string_array_var(variables, "productNames")
        .into_iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .take(6)
        .collect::<Vec<_>>();
    let count = usize_var(variables, "productImageCount")
        .unwrap_or(names.len())
        .clamp(1, 6);
    let product_range_text = if count == 1 {
        "第2张".to_string()
    } else {
        format!("第2张到第{}张", count + 1)
    };
    context.insert("productRangeText".to_string(), product_range_text);
    context.insert(
        "packageNameText".to_string(),
        if names.is_empty() {
            String::new()
        } else {
            format!("套餐包含产品：{}。", names.join("、"))
        },
    );
}

fn add_detail_page_context(
    context: &mut HashMap<String, String>,
    file: &PromptTemplateFile,
    variables: &Value,
) {
    let page_index = usize_var(variables, "pageIndex").unwrap_or(0);
    let fallback = DetailPageType {
        name: "主KV视觉".to_string(),
        english: "Hero Shot".to_string(),
        desc: "产品主图展示，突出店铺和核心卖点".to_string(),
    };
    let page_type = file
        .detail_page_types
        .get(page_index)
        .or_else(|| file.detail_page_types.first())
        .unwrap_or(&fallback);
    context.insert("pageNumber".to_string(), (page_index + 1).to_string());
    context.insert("detailPageName".to_string(), page_type.name.clone());
    context.insert("detailPageEnglish".to_string(), page_type.english.clone());
    context.insert("detailPageDesc".to_string(), page_type.desc.clone());
}

fn add_image_edit_context(context: &mut HashMap<String, String>, variables: &Value) {
    let kind = str_var(variables, "kind").unwrap_or_default();
    let label = str_var(variables, "label").unwrap_or_else(|| image_edit_label(&kind).to_string());
    let product = str_var(variables, "productName").unwrap_or_default();
    let instruction = str_var(variables, "instruction").unwrap_or_default();
    let source_urls = first_string_array_var(variables, &["sourceReferenceUrls", "referenceUrls"]);
    let optional_urls = string_array_var(variables, "optionalReferenceUrls");
    let optional_reference_first =
        !optional_urls.is_empty() && should_use_optional_reference_as_edit_base(&instruction);

    context.insert("imageEditLabel".to_string(), label.clone());
    context.insert(
        "imageEditProductText".to_string(),
        if kind == "product" && !product.is_empty() {
            format!("产品名称：“{product}”。")
        } else {
            String::new()
        },
    );
    context.insert(
        "imageEditReferenceText".to_string(),
        format_reference_text(
            &label,
            &source_urls,
            if optional_reference_first {
                optional_urls.len()
            } else {
                0
            },
        ),
    );
    context.insert(
        "imageEditOptionalReferenceText".to_string(),
        format_optional_reference_text(source_urls.len(), &optional_urls, optional_reference_first),
    );
    context.insert(
        "imageEditRoleText".to_string(),
        format_image_edit_role_text(
            &label,
            source_urls.len(),
            optional_urls.len(),
            optional_reference_first,
        ),
    );
    context.insert(
        "imageEditPackageText".to_string(),
        if kind == "product" && source_urls.len() > 1 {
            format!("本次是多产品套餐图修改，请把这 {} 张产品图中的主体食物都合理融入同一张成图，不能遗漏任何一张，不能只保留第一张。", source_urls.len())
        } else {
            String::new()
        },
    );

    let batch_index = usize_var(variables, "batchIndex").unwrap_or(0);
    let batch_total = usize_var(variables, "batchTotal").unwrap_or(0);
    context.insert(
        "imageEditBatchText".to_string(),
        if batch_index > 0 && batch_total > 0 {
            format!("本次是批量逐张修改中的第 {batch_index}/{batch_total} 张，只处理当前这一张原图，不要融合、引用或复刻其他批量图片的主体内容。")
        } else {
            String::new()
        },
    );
}

fn build_appearance_clause(
    file: &PromptTemplateFile,
    theme_color: &str,
    brand_style: &str,
) -> String {
    let mut parts = Vec::new();
    if let Some(value) = file.theme_color_hints.get(theme_color) {
        if !value.trim().is_empty() {
            parts.push(value.trim().to_string());
        }
    }
    if let Some(value) = file.brand_style_hints.get(brand_style) {
        if !value.trim().is_empty() {
            parts.push(value.trim().to_string());
        }
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!("{}。", parts.join("；"))
    }
}

fn platform_layout(platform: &str) -> String {
    if platform == "meituan" {
        "横版产品图".to_string()
    } else {
        "正方形产品图".to_string()
    }
}

fn value_to_prompt_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        Value::Bool(value) => value.to_string(),
        Value::Array(items) => items
            .iter()
            .map(value_to_prompt_string)
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join("、"),
        Value::Object(_) => value.to_string(),
    }
}

fn str_var(variables: &Value, key: &str) -> Option<String> {
    variables
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn first_non_empty(variables: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| str_var(variables, key))
}

fn bool_var(variables: &Value, key: &str) -> Option<bool> {
    variables.get(key).and_then(Value::as_bool)
}

fn usize_var(variables: &Value, key: &str) -> Option<usize> {
    variables
        .get(key)
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_i64().and_then(|v| (v >= 0).then_some(v as u64)))
        })
        .map(|value| value as usize)
}

fn string_array_var(variables: &Value, key: &str) -> Vec<String> {
    variables
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn first_string_array_var(variables: &Value, keys: &[&str]) -> Vec<String> {
    for key in keys {
        let values = string_array_var(variables, key);
        if !values.is_empty() {
            return values;
        }
    }
    Vec::new()
}

fn image_edit_label(kind: &str) -> &'static str {
    match kind {
        "avatar" => "头像",
        "storefront" => "店招",
        "poster" => "海报",
        "picture_wall" => "图片墙",
        _ => "产品图",
    }
}

fn format_reference_text(label: &str, reference_urls: &[String], start_index: usize) -> String {
    if reference_urls.len() <= 1 {
        let order_text = if start_index > 0 {
            format!("（传图顺序第 {} 张）", start_index + 1)
        } else {
            String::new()
        };
        return format!(
            "上传的{label} OSS 地址{order_text}：{}。",
            reference_urls.first().cloned().unwrap_or_default()
        );
    }
    let list = reference_urls
        .iter()
        .enumerate()
        .map(|(index, url)| format!("第 {} 张 {url}", start_index + index + 1))
        .collect::<Vec<_>>()
        .join("；");
    format!("上传的{label} OSS 地址共 {} 张：{list}。", reference_urls.len())
}

fn format_optional_reference_text(
    source_count: usize,
    optional_reference_urls: &[String],
    optional_reference_first: bool,
) -> String {
    if optional_reference_urls.is_empty() {
        return String::new();
    }
    let start_index = if optional_reference_first { 0 } else { source_count };
    let list = optional_reference_urls
        .iter()
        .enumerate()
        .map(|(index, url)| format!("第 {} 张 {url}", start_index + index + 1))
        .collect::<Vec<_>>()
        .join("；");
    format!(
        "可选参考图 OSS 地址共 {} 张：{list}。",
        optional_reference_urls.len()
    )
}

fn format_image_edit_role_text(
    label: &str,
    source_count: usize,
    optional_reference_count: usize,
    optional_reference_first: bool,
) -> String {
    if optional_reference_count == 0 {
        return String::new();
    }
    let source_start = if optional_reference_first {
        optional_reference_count + 1
    } else {
        1
    };
    let source_range = if source_count > 1 {
        format!("第 {source_start}-{} 张", source_start + source_count - 1)
    } else {
        format!("第 {source_start} 张")
    };
    let optional_start = if optional_reference_first {
        1
    } else {
        source_count + 1
    };
    let optional_range = if optional_reference_count > 1 {
        format!(
            "第 {optional_start}-{} 张",
            optional_start + optional_reference_count - 1
        )
    } else {
        format!("第 {optional_start} 张")
    };
    let base_rule = if optional_reference_first {
        format!("请严格区分图片角色：{optional_range}是“参考图（可选）”，也是最终画面的底图/场景图；{source_range}是主上传区的{label}原图/产品主体图，是要放入参考图场景的食物来源。除非修改要求明确指定使用参考图里的食物，严禁把参考图中的菜品、食物或商品主体复制、迁移或替换到主上传区原图里。")
    } else {
        format!("请严格区分图片角色：{source_range}是主上传区的{label}原图/产品主体图；{optional_range}是“参考图（可选）”，默认只用于风格、构图、容器、场景、光影或细节参照。除非修改要求明确指定使用参考图里的食物，严禁把参考图中的菜品、食物或商品主体复制、迁移或替换到主上传区原图里。")
    };
    if !optional_reference_first {
        return base_rule;
    }
    format!("{base_rule}本次修改要求明确要把产品图食物放入参考图场景：最终画面必须以“参考图（可选）”作为构图、锅/盘/容器、背景、光影和透视基础；移除参考图锅里或容器里的原有食物，只保留容器与环境；再把主上传区产品图中的食物主体替换到参考图对应位置。严禁反向操作，不能把参考图里的食物替换到产品图中。")
}

fn should_use_optional_reference_as_edit_base(instruction: &str) -> bool {
    let text = instruction.split_whitespace().collect::<String>();
    if !text.contains("参考图") {
        return false;
    }
    [
        r"(以|用|按照|保留)参考图(作为|为|的)?(底图|基础|画面|场景|构图|背景|容器|锅|盘|碗)",
        r"产品图.*(替换|放入|放进|放到|移入|移到|加入|合成到).*参考图",
        r"参考图.*(锅|盘|碗|容器|场景|画面|背景).*(替换|放入|放进|放到|移入|加入|放置)",
    ]
    .iter()
    .any(|pattern| Regex::new(pattern).map(|regex| regex.is_match(&text)).unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn renders_template_with_computed_context() {
        let file = PromptTemplateFile {
            templates: HashMap::from([(
                "product.single".to_string(),
                "{{shop}} {{productNameIntro}} {{layout}} {{appearanceClause}}".to_string(),
            )]),
            theme_color_hints: HashMap::from([("red".to_string(), "红色主题".to_string())]),
            brand_style_hints: HashMap::from([("fresh".to_string(), "清爽风格".to_string())]),
            detail_page_types: Vec::new(),
        };
        let rendered = render_prompt(
            &file,
            &PromptRenderRequest {
                key: "product.single".to_string(),
                variables: json!({
                    "shopName": "测试店",
                    "productName": "牛肉饭",
                    "platform": "meituan",
                    "themeColor": "red",
                    "brandStyle": "fresh"
                }),
            },
        )
        .expect("render prompt");

        assert!(rendered.contains("测试店"));
        assert!(rendered.contains("产品名称：牛肉饭。"));
        assert!(rendered.contains("横版产品图"));
        assert!(rendered.contains("红色主题；清爽风格。"));
    }

    #[test]
    fn image_edit_reference_base_reorders_role_text() {
        let file = PromptTemplateFile {
            templates: HashMap::from([(
                "image_edit".to_string(),
                "{{imageEditReferenceText}}{{imageEditOptionalReferenceText}}{{imageEditRoleText}}".to_string(),
            )]),
            theme_color_hints: HashMap::new(),
            brand_style_hints: HashMap::new(),
            detail_page_types: Vec::new(),
        };
        let rendered = render_prompt(
            &file,
            &PromptRenderRequest {
                key: "image_edit".to_string(),
                variables: json!({
                    "kind": "product",
                    "label": "产品图",
                    "instruction": "把参考图中的锅里的食物移除，然后把产品图中的食物替换到参考图的锅中",
                    "sourceReferenceUrls": ["https://oss.example.com/product.jpg"],
                    "optionalReferenceUrls": ["https://oss.example.com/pot.jpg"]
                }),
            },
        )
        .expect("render prompt");

        assert!(rendered.contains("上传的产品图 OSS 地址（传图顺序第 2 张）"));
        assert!(rendered.contains("可选参考图 OSS 地址共 1 张：第 1 张"));
        assert!(rendered.contains("最终画面的底图/场景图"));
        assert!(rendered.contains("严禁反向操作"));
    }

    #[test]
    fn missing_template_variable_fails_fast() {
        let file = PromptTemplateFile {
            templates: HashMap::from([("x".to_string(), "{{missing}}".to_string())]),
            theme_color_hints: HashMap::new(),
            brand_style_hints: HashMap::new(),
            detail_page_types: Vec::new(),
        };
        let error = render_prompt(
            &file,
            &PromptRenderRequest {
                key: "x".to_string(),
                variables: json!({}),
            },
        )
        .expect_err("missing variable should fail");
        assert!(error.contains("missing"));
    }
}
