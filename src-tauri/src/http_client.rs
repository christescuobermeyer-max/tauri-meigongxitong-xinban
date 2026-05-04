use std::{error::Error, time::Duration};

pub fn build_api_client(client_label: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(600))
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| {
            format!(
                "初始化{client_label} HTTP 客户端失败：{}",
                format_reqwest_error(&error)
            )
        })
}

pub fn format_reqwest_error(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut source = error.source();

    while let Some(cause) = source {
        let message = cause.to_string();
        if !parts.iter().any(|part| part == &message) {
            parts.push(message);
        }
        source = cause.source();
    }

    parts.join("；")
}
