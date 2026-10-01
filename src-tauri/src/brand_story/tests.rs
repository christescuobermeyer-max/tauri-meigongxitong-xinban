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
