use crate::api::GenerateRequest;
use crate::image_provider::ImageApiLine;

const MAX_REFERENCE_IMAGES: usize = 5;

pub fn validate_generate_request(req: &GenerateRequest) -> Result<(), String> {
    if req.api_line == ImageApiLine::Line5 && req.product_images.len() > 4 {
        return Err("线路5 APIMart 最多支持 4 张参考图，请删除多余图片后重试".to_string());
    }
    if req.product_images.len() > MAX_REFERENCE_IMAGES {
        return Err(format!(
            "产品图最多支持 {MAX_REFERENCE_IMAGES} 张，请删除多余图片后重试"
        ));
    }
    if !is_supported_size_for_line(req) {
        return Err(format!("不支持的尺寸：{}", req.size));
    }
    Ok(())
}

fn is_supported_size_for_line(req: &GenerateRequest) -> bool {
    match req.api_line {
        ImageApiLine::Line5 => matches!(
            req.size.as_str(),
            "1:1" | "16:9" | "21:9" | "4:3" | "3:4" | "3:2" | "2:3" | "1024x1536" | "auto"
        ),
        ImageApiLine::Line4 => matches!(
            req.size.as_str(),
            "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "16:9" | "21:9" | "3:4"
        ),
        ImageApiLine::Line1 | ImageApiLine::Line2 | ImageApiLine::Line3 => matches!(
            req.size.as_str(),
            "1024x1024" | "1024x1536" | "1536x1024" | "21:9" | "3:4"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image_provider::resolve_image_provider;

    #[test]
    fn reject_more_than_five_reference_images() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "1024x1024".into(),
            product_images: vec!["x".into(); 6],
            api_line: ImageApiLine::Line1,
        };

        let err = validate_generate_request(&req).unwrap_err();

        assert_eq!(err, "产品图最多支持 5 张，请删除多余图片后重试");
    }

    #[test]
    fn use_wlai_api_endpoint() {
        let provider = resolve_image_provider(ImageApiLine::Line1);

        assert_eq!(
            provider.api_url,
            "https://api3.wlai.vip/v1/images/generations"
        );
    }

    #[test]
    fn allow_generate_without_reference_images() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "1024x1024".into(),
            product_images: vec![],
            api_line: ImageApiLine::Line1,
        };

        assert!(validate_generate_request(&req).is_ok());
    }

    #[test]
    fn allow_poster_wide_ratio_size() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "21:9".into(),
            product_images: vec!["https://example.com/storefront.png".into()],
            api_line: ImageApiLine::Line1,
        };

        assert!(validate_generate_request(&req).is_ok());
    }

    #[test]
    fn allow_pockgo_storefront_16_9_ratio_size() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "16:9".into(),
            product_images: vec!["https://example.com/avatar.png".into()],
            api_line: ImageApiLine::Line4,
        };

        assert!(validate_generate_request(&req).is_ok());
    }

    #[test]
    fn reject_1792_storefront_size_for_image_generation_lines() {
        for api_line in [
            ImageApiLine::Line1,
            ImageApiLine::Line2,
            ImageApiLine::Line3,
            ImageApiLine::Line5,
        ] {
            let req = GenerateRequest {
                prompt: "测试".into(),
                size: "1792x1024".into(),
                product_images: vec!["https://example.com/avatar.png".into()],
                api_line,
            };

            assert!(validate_generate_request(&req).is_err());
        }
    }

    #[test]
    fn default_to_line1_when_api_line_is_missing() {
        let req: GenerateRequest =
            serde_json::from_str(r#"{"prompt":"测试","size":"1024x1024","product_images":[]}"#)
                .unwrap();

        assert_eq!(req.api_line, ImageApiLine::Line1);
    }

    #[test]
    fn allow_apimart_ratio_sizes() {
        for size in ["1:1", "16:9", "21:9", "4:3", "3:4", "3:2", "2:3", "1024x1536", "auto"] {
            let req = GenerateRequest {
                prompt: "测试".into(),
                size: size.into(),
                product_images: vec![],
                api_line: ImageApiLine::Line5,
            };

            assert!(validate_generate_request(&req).is_ok(), "应允许 {size}");
        }
    }

    #[test]
    fn reject_more_than_four_reference_images_for_apimart() {
        let req = GenerateRequest {
            prompt: "测试".into(),
            size: "1:1".into(),
            product_images: vec!["x".into(); 5],
            api_line: ImageApiLine::Line5,
        };

        let err = validate_generate_request(&req).unwrap_err();
        assert_eq!(err, "线路5 APIMart 最多支持 4 张参考图，请删除多余图片后重试");
    }
}
