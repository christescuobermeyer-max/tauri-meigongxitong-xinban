use super::*;

pub(super) fn render_prompt(file: &PromptTemplateFile, req: &PromptRenderRequest) -> Result<String, String> {
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

pub(super) fn render_template(template: &str, context: &HashMap<String, String>) -> Result<String, String> {
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
