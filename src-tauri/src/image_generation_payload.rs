use crate::api::GenerateRequest;
use crate::image_provider::{ImageProvider, ReferenceImageJsonField};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiPayload<'a> {
    model: &'a str,
    prompt: &'a str,
    size: &'a str,
    n: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reference_images: Option<&'a [String]>,
}

pub fn build_json_payload<'a>(
    provider: &ImageProvider,
    req: &'a GenerateRequest,
) -> ApiPayload<'a> {
    let refs = (!req.product_images.is_empty()).then_some(req.product_images.as_slice());
    let (image, reference_images) = match provider.reference_image_json_field {
        ReferenceImageJsonField::Image => (refs, None),
        ReferenceImageJsonField::ReferenceImages => (None, refs),
    };

    ApiPayload {
        model: provider.model,
        prompt: &req.prompt,
        size: &req.size,
        n: 1,
        quality: provider.quality,
        format: provider.format,
        image,
        reference_images,
    }
}
