use super::*;

pub(super) fn build_context(file: &PromptTemplateFile, req: &PromptRenderRequest) -> HashMap<String, String> {
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

pub(super) fn add_package_context(context: &mut HashMap<String, String>, variables: &Value) {
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

pub(super) fn add_detail_page_context(
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
