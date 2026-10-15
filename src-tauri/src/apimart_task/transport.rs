use crate::http_client::format_reqwest_error;
use serde::Serialize;
use std::time::Duration;

const CONNECT_ATTEMPTS: usize = 3;

pub(super) async fn submit_request<T: Serialize + ?Sized>(
    client: &reqwest::Client,
    api_url: &str,
    api_key: &str,
    payload: &T,
    label: &str,
) -> Result<reqwest::Response, String> {
    for attempt in 1..=CONNECT_ATTEMPTS {
        let result = client
            .post(api_url)
            .bearer_auth(api_key)
            .header("Content-Type", "application/json")
            .json(payload)
            .send()
            .await;
        match result {
            Ok(response) => return Ok(response),
            Err(error) => {
                // 仅连接建立失败时重试；请求发出后的超时或响应丢失可能已扣费。
                if !error.is_connect() || attempt == CONNECT_ATTEMPTS {
                    return Err(format!(
                        "调用{label}接口失败：{}",
                        format_reqwest_error(&error)
                    ));
                }
                eprintln!(
                    "[apimart-task] {label}建立连接失败，准备第 {} 次连接（最多 {} 次）",
                    attempt + 1,
                    CONNECT_ATTEMPTS
                );
                tokio::time::sleep(Duration::from_millis(300 * attempt as u64)).await;
            }
        }
    }
    unreachable!("连接循环应返回响应或错误")
}
