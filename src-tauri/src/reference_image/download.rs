use futures_util::StreamExt;
use reqwest::{header::{CONTENT_TYPE, LOCATION}, redirect::Policy, Url};
use std::{net::{IpAddr, Ipv4Addr, SocketAddr}, time::Duration};

pub const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;

pub fn validate_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "图片地址格式无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some()
        || !matches!(url.port_or_known_default(), Some(80 | 443)) {
        return Err("图片地址仅支持无凭据的公共 HTTP/HTTPS 标准端口".into());
    }
    if let Some(host) = url.host_str() {
        let host = host.trim_matches(['[', ']']);
        if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost")
            || host.parse::<IpAddr>().is_ok_and(|address| !is_public_address(address)) {
            return Err("图片地址不能访问本机或非公共网络".into());
        }
    }
    Ok(url)
}

fn public_ipv4(address: Ipv4Addr) -> bool {
    let [first, second, third, _] = address.octets();
    !address.is_private() && !address.is_loopback() && !address.is_link_local()
        && !address.is_broadcast() && !address.is_documentation()
        && first != 0 && first < 224
        && !(first == 100 && (64..=127).contains(&second))
        && !(first == 192 && second == 0 && third == 0)
        && !(first == 192 && second == 88 && third == 99)
        && !(first == 198 && matches!(second, 18 | 19))
}

pub fn is_public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => public_ipv4(address),
        IpAddr::V6(address) => {
            if let Some(mapped) = address.to_ipv4_mapped() { return public_ipv4(mapped); }
            let segments = address.segments();
            (segments[0] & 0xe000) == 0x2000
                && !(segments[0] == 0x2001 && (segments[1] < 0x200 || segments[1] == 0xdb8))
                && segments[0] != 0x2002
                && !(segments[0] == 0x3fff && segments[1] < 0x1000)
        }
    }
}

pub async fn download(value: &str, timeout: Duration) -> Result<(Vec<u8>, String), String> {
    tokio::time::timeout(timeout, download_inner(value)).await
        .map_err(|_| "下载图片超时".to_string())?
}

async fn download_inner(value: &str) -> Result<(Vec<u8>, String), String> {
    let mut url = validate_url(value)?;
    for hop in 0..=5 {
        let host = url.host_str().ok_or("图片地址缺少主机")?.trim_matches(['[', ']']).to_string();
        let port = url.port_or_known_default().ok_or("图片地址缺少端口")?;
        let addresses: Vec<_> = tokio::net::lookup_host((host.as_str(), port)).await
            .map_err(|_| "图片地址 DNS 解析失败".to_string())?.collect();
        validate_addresses(&addresses)?;
        let client = reqwest::Client::builder().no_proxy().redirect(Policy::none())
            .connect_timeout(Duration::from_secs(15)).resolve_to_addrs(&host, &addresses)
            .build().map_err(|_| "初始化图片下载客户端失败".to_string())?;
        let response = client.get(url.clone()).header("Connection", "close").send().await
            .map_err(|error| format!("请求图片失败：{}", error.without_url()))?;
        if response.status().is_redirection() {
            if hop == 5 { return Err("图片地址重定向次数过多".into()); }
            let target = response.headers().get(LOCATION).and_then(|value| value.to_str().ok())
                .ok_or("图片重定向缺少有效目标")?;
            url = redirect_target(&url, target)?;
            continue;
        }
        let response = response.error_for_status()
            .map_err(|error| format!("图片下载失败：{}", error.without_url()))?;
        if response.content_length().is_some_and(|size| size > MAX_IMAGE_BYTES as u64) {
            return Err("图片超过 32 MiB 下载限制".into());
        }
        let mime = response.headers().get(CONTENT_TYPE).and_then(|value| value.to_str().ok())
            .unwrap_or("image/png").split(';').next().unwrap_or("image/png").trim().to_string();
        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| format!("读取图片失败：{}", error.without_url()))?;
            append_chunk(&mut bytes, &chunk, MAX_IMAGE_BYTES)?;
        }
        if bytes.is_empty() { return Err("图片下载结果为空".into()); }
        return Ok((bytes, mime));
    }
    Err("图片重定向失败".into())
}

fn validate_addresses(addresses: &[SocketAddr]) -> Result<(), String> {
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_address(address.ip())) {
        return Err("图片地址解析到非公共网络，已拒绝下载".into());
    }
    Ok(())
}

fn redirect_target(current: &Url, target: &str) -> Result<Url, String> {
    let next = current.join(target).map_err(|_| "图片重定向地址无效")?;
    let next = validate_url(next.as_str())?;
    if current.scheme() == "https" && next.scheme() != "https" {
        return Err("图片重定向不能从 HTTPS 降级".into());
    }
    Ok(next)
}

fn append_chunk(bytes: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<(), String> {
    if chunk.len() > limit.saturating_sub(bytes.len()) { return Err("图片超过下载大小限制".into()); }
    bytes.extend_from_slice(chunk);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_private_reserved_and_encoded_addresses() {
        for value in ["http://localhost/x", "http://127.1/x", "http://2130706433/x", "http://0x7f000001/x",
            "http://169.254.169.254/x", "http://10.1.2.3/x", "http://100.64.0.1/x", "http://198.18.0.1/x",
            "http://[::1]/x", "http://[::ffff:127.0.0.1]/x", "http://[fc00::1]/x", "http://[2002:7f00:1::]/x",
            "http://[2001:db8::1]/x", "http://name:secret@example.com/x", "https://example.com:8787/x", "file:///tmp/image"] {
            assert!(validate_url(value).is_err(), "{value}");
        }
        assert!(validate_url("https://example.com/image?signature=test").is_ok());
        assert!(is_public_address("8.8.8.8".parse().unwrap()));
        assert!(is_public_address("2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn rejects_stream_overflow_without_appending() {
        let mut bytes = vec![1, 2];
        assert!(append_chunk(&mut bytes, &[3, 4], 3).is_err());
        assert_eq!(bytes, vec![1, 2]);
        append_chunk(&mut bytes, &[3], 3).unwrap();
        assert_eq!(bytes.len(), 3);
    }

    #[tokio::test]
    async fn rejects_loopback_before_making_a_request() {
        let error = download("http://127.0.0.1/private?signature=secret", Duration::from_secs(1)).await.unwrap_err();
        assert!(error.contains("非公共网络"));
        assert!(!error.contains("secret"));
    }

    #[test]
    fn validates_all_dns_answers_and_each_redirect() {
        assert!(validate_addresses(&[]).is_err());
        assert!(validate_addresses(&["8.8.8.8:443".parse().unwrap(), "127.0.0.1:443".parse().unwrap()]).is_err());
        assert!(validate_addresses(&["8.8.8.8:443".parse().unwrap()]).is_ok());
        let current = Url::parse("https://example.com/image").unwrap();
        assert!(redirect_target(&current, "http://example.com/image").is_err());
        assert!(redirect_target(&current, "https://127.0.0.1/image").is_err());
        assert_eq!(redirect_target(&current, "/next").unwrap().path(), "/next");
    }
}
