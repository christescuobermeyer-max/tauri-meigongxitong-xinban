use super::*;

pub(super) fn add_image_edit_context(context: &mut HashMap<String, String>, variables: &Value) {
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

pub(super) fn image_edit_label(kind: &str) -> &'static str {
    match kind {
        "avatar" => "头像",
        "storefront" => "店招",
        "poster" => "海报",
        "picture_wall" => "图片墙",
        _ => "产品图",
    }
}

pub(super) fn format_reference_text(label: &str, reference_urls: &[String], start_index: usize) -> String {
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

pub(super) fn format_optional_reference_text(
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

pub(super) fn format_image_edit_role_text(
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

pub(super) fn should_use_optional_reference_as_edit_base(instruction: &str) -> bool {
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
