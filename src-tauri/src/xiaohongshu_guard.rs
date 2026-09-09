use reqwest::redirect::Policy;

const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

fn is_direct_web_link(url: &str) -> bool {
    url.contains("xiaohongshu.com/")
}

fn has_share_signature(url: &str) -> bool {
    url.contains("xsec_token=") || url.contains("xhslink.com/")
}

fn build_share_hint(url: &str) -> String {
    if is_direct_web_link(url) && !has_share_signature(url) {
        return "请从小红书 App 重新复制完整分享链接后重试，避免缺少 xsec_token。".to_string();
    }

    "请换一个仍可公开打开的视频笔记链接后重试。".to_string()
}

pub async fn explain_parse_failure(url: &str, stderr: &str) -> Option<String> {
    if !stderr.contains("No video formats found") {
        return None;
    }

    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .build()
        .ok()?;

    let response = client
        .get(url)
        .header("User-Agent", BROWSER_USER_AGENT)
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .send()
        .await
        .ok()?;

    let location = response
        .headers()
        .get("location")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    if location.contains("/404/") && location.contains("error_code=300031") {
        return Some(format!(
            "该小红书笔记当前对未登录访问不可见，工具无法获取视频地址。{}",
            build_share_hint(url)
        ));
    }

    Some(format!(
        "未能从该小红书链接提取视频地址。{}",
        build_share_hint(url)
    ))
}
