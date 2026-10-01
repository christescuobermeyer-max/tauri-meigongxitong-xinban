use super::*;

pub(super) fn build_appearance_clause(
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

pub(super) fn platform_layout(platform: &str) -> String {
    if platform == "meituan" {
        "横版产品图".to_string()
    } else {
        "正方形产品图".to_string()
    }
}
