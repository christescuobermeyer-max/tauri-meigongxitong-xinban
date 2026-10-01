use crate::*;
use crate::gateway_test_support::*;

#[test]
fn legacy_generate_request_defaults_to_inline_base64() {
    let request: GatewayGenerateImageRequest = serde_json::from_value(json!({
        "prompt": "test",
        "size": "1024x1024",
        "product_images": []
    }))
    .expect("deserialize legacy request");

    assert_eq!(request.result_delivery, ResultDelivery::InlineBase64);
    assert!(validate_result_delivery_request(&request).is_ok());
}

#[test]
fn oss_url_delivery_requires_archive_metadata() {
    let request: GatewayGenerateImageRequest = serde_json::from_value(json!({
        "prompt": "test",
        "size": "1024x1024",
        "product_images": [],
        "result_delivery": "oss_url"
    }))
    .expect("deserialize URL delivery request");

    let error = validate_result_delivery_request(&request)
        .expect_err("URL delivery without archive must fail");
    assert_eq!(error.status, StatusCode::BAD_REQUEST);
    assert!(error.message.contains("archive"));
}

#[test]
fn oss_url_delivery_omits_inline_image_after_archive_success() {
    let delivered = select_result_delivery(
        ResultDelivery::OssUrl,
        "large-base64".to_string(),
        Some("https://oss.example.com/generated/result.jpg".to_string()),
    );

    assert_eq!(delivered.result_delivery, ResultDelivery::OssUrl);
    assert_eq!(delivered.image, None);
    assert_eq!(
        delivered.image_url.as_deref(),
        Some("https://oss.example.com/generated/result.jpg")
    );
}

#[test]
fn oss_url_delivery_falls_back_to_inline_when_archive_fails() {
    let delivered =
        select_result_delivery(ResultDelivery::OssUrl, "generated-base64".to_string(), None);

    assert_eq!(delivered.result_delivery, ResultDelivery::InlineBase64);
    assert_eq!(delivered.image.as_deref(), Some("generated-base64"));
    assert_eq!(delivered.image_url, None);
}

#[test]
fn delivery_archive_specs_cover_largest_export_dimensions() {
    let avatar = compression_config_for_asset_kind("avatar").expect("avatar config");
    let poster = compression_config_for_asset_kind("poster").expect("poster config");
    let signboard = compression_config_for_asset_kind("p_signboard").expect("signboard config");
    let picture_wall =
        compression_config_for_asset_kind("picture_wall").expect("picture wall config");

    assert!(avatar.max_dimension >= 800);
    assert!(poster.max_dimension >= 2048);
    assert!(signboard.max_dimension >= 1792);
    assert!(picture_wall.max_dimension >= 1448);
}
