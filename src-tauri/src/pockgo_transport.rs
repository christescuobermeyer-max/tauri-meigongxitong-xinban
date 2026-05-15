use serde::Serialize;
#[cfg(not(windows))]
use std::time::Duration;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const STATUS_MARKER: &str = "__CSGH_HTTP_STATUS__:";

pub async fn send_pockgo_chat_request<T: Serialize>(
    api_url: &str,
    api_key: &str,
    payload: &T,
) -> Result<(u16, String), String> {
    let body =
        serde_json::to_string(payload).map_err(|error| format!("序列化线路4请求失败：{error}"))?;
    send_pockgo_chat_body(api_url, api_key, body).await
}

#[cfg(windows)]
async fn send_pockgo_chat_body(
    api_url: &str,
    api_key: &str,
    body: String,
) -> Result<(u16, String), String> {
    let api_url = api_url.to_string();
    let api_key = api_key.to_string();

    tokio::task::spawn_blocking(move || run_curl_post(&api_url, &api_key, &body))
        .await
        .map_err(|error| format!("执行线路4 curl 传输任务失败：{error}"))?
}

#[cfg(not(windows))]
async fn send_pockgo_chat_body(
    api_url: &str,
    api_key: &str,
    body: String,
) -> Result<(u16, String), String> {
    let client = reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(350))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("初始化线路4 HTTP 客户端失败：{error}"))?;
    let response = client
        .post(api_url)
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .body(body)
        .send()
        .await
        .map_err(|error| format!("线路4 HTTP 请求失败：{error}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取线路4响应失败：{error}"))?;
    Ok((status, body))
}

fn run_curl_post(api_url: &str, api_key: &str, body: &str) -> Result<(u16, String), String> {
    let temp = temp_paths();
    write_temp_files(&temp, api_url, api_key, body)?;

    let output = Command::new("curl.exe")
        .arg("--config")
        .arg(&temp.config)
        .output()
        .map_err(|error| format!("启动系统 curl 失败：{error}"))?;
    cleanup_temp_files(&temp);

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    handle_curl_output(
        output.status.success(),
        output.status.code(),
        &stdout,
        &stderr,
    )
}

struct TempPaths {
    config: PathBuf,
    body: PathBuf,
}

fn temp_paths() -> TempPaths {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let pid = std::process::id();
    let base = std::env::temp_dir();
    TempPaths {
        config: base.join(format!("csgh-pockgo-{pid}-{stamp}.curlrc")),
        body: base.join(format!("csgh-pockgo-{pid}-{stamp}.json")),
    }
}

fn write_temp_files(
    temp: &TempPaths,
    api_url: &str,
    api_key: &str,
    body: &str,
) -> Result<(), String> {
    fs::write(&temp.body, body).map_err(|error| format!("写入线路4请求体临时文件失败：{error}"))?;
    let config = build_curl_config(api_url, api_key, &temp.body);
    fs::write(&temp.config, config).map_err(|error| format!("写入线路4 curl 配置失败：{error}"))
}

fn build_curl_config(api_url: &str, api_key: &str, body_path: &Path) -> String {
    let body_arg = body_path.to_string_lossy().replace('\\', "/");
    [
        format!("url = \"{}\"", escape_config_value(api_url)),
        "http1.1".to_string(),
        "silent".to_string(),
        "show-error".to_string(),
        "ignore-content-length".to_string(),
        "request = \"POST\"".to_string(),
        "connect-timeout = 20".to_string(),
        "max-time = 350".to_string(),
        format!(
            "header = \"Authorization: Bearer {}\"",
            escape_config_value(api_key)
        ),
        "header = \"Content-Type: application/json\"".to_string(),
        "header = \"Accept: */*\"".to_string(),
        "user-agent = \"curl/8.10.1\"".to_string(),
        format!("data-binary = \"@{}\"", escape_config_value(&body_arg)),
        format!("write-out = \"\\n{STATUS_MARKER}%{{http_code}}\""),
    ]
    .join("\n")
}

fn escape_config_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn cleanup_temp_files(temp: &TempPaths) {
    let _ = fs::remove_file(&temp.config);
    let _ = fs::remove_file(&temp.body);
}

fn parse_curl_output(output: &str) -> Result<(u16, String), String> {
    let Some(index) = output.rfind(STATUS_MARKER) else {
        return Err("线路4 curl 响应中未找到 HTTP 状态码".to_string());
    };
    let body = output[..index].trim_end_matches(['\r', '\n']).to_string();
    let status_text = output[index + STATUS_MARKER.len()..].trim();
    let status = status_text
        .parse::<u16>()
        .map_err(|error| format!("解析线路4 HTTP 状态码失败：{error}; 原始值：{status_text}"))?;
    Ok((status, body))
}

fn handle_curl_output(
    success: bool,
    code: Option<i32>,
    stdout: &str,
    stderr: &str,
) -> Result<(u16, String), String> {
    if let Ok(parsed) = parse_curl_output(stdout) {
        return Ok(parsed);
    }
    if !success {
        let code = code.map_or("unknown".to_string(), |value| value.to_string());
        return Err(format!("系统 curl 调用线路4失败，退出码 {code}：{stderr}"));
    }
    parse_curl_output(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_status_marker_from_curl_output() {
        let output = "{\"ok\":true}\n__CSGH_HTTP_STATUS__:200";

        let (status, body) = parse_curl_output(output).unwrap();

        assert_eq!(status, 200);
        assert_eq!(body, "{\"ok\":true}");
    }

    #[test]
    fn keep_response_body_when_curl_exit_is_nonzero() {
        let stdout = "{\"data\":[{\"url\":\"https://example.com/generated.png\"}]}\n__CSGH_HTTP_STATUS__:200";

        let (status, body) =
            handle_curl_output(false, Some(18), stdout, "transfer closed").unwrap();

        assert_eq!(status, 200);
        assert!(body.contains("generated.png"));
    }

    #[test]
    fn curl_config_ignores_incorrect_content_length() {
        let config = build_curl_config("https://example.com", "test-key", Path::new("body.json"));

        assert!(config.contains("ignore-content-length"));
    }

    #[test]
    #[ignore]
    fn curl_transport_reaches_line4_with_invalid_token() {
        let body = r#"{"model":"gpt-image-2","messages":[{"role":"user","content":"ping"}],"stream":false}"#;

        let (status, response) = run_curl_post(
            "https://newapi.aicohere.org/v1/chat/completions",
            "invalid-test-key",
            body,
        )
        .unwrap();

        assert_eq!(status, 401);
        assert!(response.contains("Invalid token"));
    }
}
