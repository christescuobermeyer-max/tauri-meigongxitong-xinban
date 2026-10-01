use super::*;

pub(super) fn validate_text_request(req: &BrandStoryTextRequestInput) -> Result<(), String> {
    let trimmed = req.store_name.trim();
    if trimmed.chars().count() < 2 || trimmed.chars().count() > 20 {
        return Err("店铺名称需为 2-20 个字符".into());
    }
    if req.category.trim().is_empty() {
        return Err("经营品类不能为空".into());
    }
    Ok(())
}

pub(super) fn compose_system_prompt() -> String {
    match prompt_templates::render_prompt_from_default_store("brand_story.system", serde_json::json!({})) {
        Ok(prompt) if !prompt.trim().is_empty() => return prompt,
        Ok(_) => eprintln!("[brand-story] 云端 prompt 模板 brand_story.system 为空，使用内置兜底"),
        Err(error) => eprintln!("[brand-story] 读取云端 prompt 模板失败：{error}，使用内置兜底"),
    }
    format!("{BRAND_STORY_SYSTEM_PROMPT_TEMPLATE}{SYSTEM_PROMPT_JSON_SUFFIX}")
}

pub(super) fn parse_brand_copy(generated_text: &str) -> Result<BrandCopy, String> {
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

pub(super) fn extract_json_block(text: &str) -> String {
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

pub(super) fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        let cut: String = text.chars().take(max).collect();
        format!("{cut}…")
    }
}
