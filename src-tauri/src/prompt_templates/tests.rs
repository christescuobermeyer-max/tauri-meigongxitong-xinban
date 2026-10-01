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
