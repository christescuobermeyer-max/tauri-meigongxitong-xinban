use std::{error::Error, time::Duration};

const API_TIMEOUT_SECS: u64 = 600;
// 连接阶段 15 秒建不起来，继续等也不会成功，只会吃掉整条请求的时间预算。
// 上游实测连接耗时约 0.2s；90s 会让 6 次换线最坏情况累积到 540s，
// 超过客户端总超时，换线机制失去意义。
const CONNECT_TIMEOUT_SECS: u64 = 15;

pub fn build_api_client(client_label: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(API_TIMEOUT_SECS))
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .build()
        .map_err(|error| format_build_error(client_label, &error))
}

fn format_build_error(client_label: &str, error: &reqwest::Error) -> String {
    format!(
        "初始化{client_label} HTTP 客户端失败：{}",
        format_reqwest_error(error)
    )
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

/// 判断一次上游调用是否已经进入“结果不确定”状态。
///
/// 这类错误可能发生在上游已经接收请求、甚至已经扣费之后；继续重试
/// 会把一次无结果请求放大成多次扣费请求。明确的 4xx 额度/鉴权错误不
/// 在这里处理，调用方仍可按原有策略切换线路。
pub fn is_ambiguous_upstream_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    [
        "timed out",
        "timeout",
        "network is unreachable",
        "connection reset",
        "connection aborted",
        "broken pipe",
        "unexpected eof",
        "unexpected end of file",
        "error decoding response body",
        "error decoding response",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
        || ["500 ", "502 ", "503 ", "504 ", "524 ", " 500 ", " 502 ", " 503 ", " 504 ", " 524 "]
            .iter()
            .any(|marker| lower.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::is_ambiguous_upstream_error;

    #[test]
    fn marks_transport_and_stream_errors_as_ambiguous() {
        assert!(is_ambiguous_upstream_error("Connection timed out"));
        assert!(is_ambiguous_upstream_error("error decoding response body"));
        assert!(is_ambiguous_upstream_error("image_stream_timeout"));
        assert!(is_ambiguous_upstream_error("502 Bad Gateway"));
    }

    #[test]
    fn keeps_explicit_auth_and_quota_errors_retryable_by_caller_policy() {
        assert!(!is_ambiguous_upstream_error("403 Forbidden: insufficient_user_quota"));
        assert!(!is_ambiguous_upstream_error("401 Unauthorized: auth_invalid"));
    }
}
