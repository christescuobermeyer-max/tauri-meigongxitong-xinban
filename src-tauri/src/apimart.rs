use crate::apimart_reference::build_apimart_image_urls;
use crate::apimart_task::{poll_apimart_task, submit_apimart_task};
use serde::Serialize;

#[derive(Serialize)]
struct ApimartGeneratePayload<'a> {
    model: &'a str,
    prompt: &'a str,
    size: &'a str,
    resolution: &'static str,
    n: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    image_urls: Vec<String>,
}

pub async fn generate_apimart_image(
    client: &reqwest::Client,
    api_url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
    size: &str,
    product_images: &[String],
) -> Result<String, String> {
    let payload = ApimartGeneratePayload {
        model,
        prompt,
        size: normalize_apimart_size(size),
        resolution: "1k",
        n: 1,
        image_urls: build_apimart_image_urls(client, product_images).await?,
    };
    let task_id = submit_apimart_task(client, api_url, api_key, &payload).await?;
    poll_apimart_task(client, api_key, &task_id).await
}

fn normalize_apimart_size(size: &str) -> &str {
    if size == "auto" {
        "3:2"
    } else if size == "1024x1536" {
        "2:3"
    } else {
        size
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_apimart_size;

    #[test]
    fn translate_auto_size_to_three_two() {
        assert_eq!(normalize_apimart_size("auto"), "3:2");
        assert_eq!(normalize_apimart_size("16:9"), "16:9");
        assert_eq!(normalize_apimart_size("1024x1536"), "2:3");
    }
}
