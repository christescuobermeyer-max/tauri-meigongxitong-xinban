use crate::*;
use crate::gateway_test_support::*;

#[test]
fn douyin_ytdlp_json_returns_direct_url_and_safe_headers_only() {
    let value = parse_ytdlp_json(
        r#"{
            "title":"测试视频",
            "uploader":"测试作者",
            "url":"https://v3-dy-o.zjcdn.com/fallback.mp4",
            "http_headers":{
                "User-Agent":"Desktop UA",
                "Referer":"https://www.douyin.com/",
                "Cookie":"server-cookie=secret",
                "Authorization":"Bearer secret"
            },
            "requested_downloads":[{
                "url":"https://v26-dy-o.zjcdn.com/video/tos/cn/tos.mp4?token=abc",
                "http_headers":{
                    "Accept":"*/*",
                    "Cookie":"never-return-this"
                }
            }]
        }"#,
    )
    .expect("parse yt-dlp fixture");

    assert_eq!(
        extract_url_from_ytdlp_value(&value).expect("extract direct video url"),
        "https://v26-dy-o.zjcdn.com/video/tos/cn/tos.mp4?token=abc"
    );
    assert_eq!(
        extract_title_from_ytdlp_value(&value).as_deref(),
        Some("测试视频")
    );
    assert_eq!(
        extract_author_from_ytdlp_value(&value).as_deref(),
        Some("测试作者")
    );

    let headers = extract_safe_http_headers_from_ytdlp_value(&value).expect("safe headers");
    assert_eq!(headers.get("Accept").map(String::as_str), Some("*/*"));
    assert_eq!(
        headers.get("User-Agent").map(String::as_str),
        Some("Desktop UA")
    );
    assert!(!headers.contains_key("Cookie"));
    assert!(!headers.contains_key("Authorization"));
}

#[test]
fn douyin_share_url_parser_accepts_common_share_text() {
    let url = extract_share_url(
        "复制这条消息，打开抖音看看 https://v.douyin.com/AbCdE/，",
        is_douyin_url,
    )
    .expect("douyin url");

    assert_eq!(url, "https://v.douyin.com/AbCdE/");
}

#[test]
fn gateway_douyin_netscape_cookie_is_copied_to_temp_before_ytdlp() {
    let source_path =
        env::temp_dir().join(format!("douyin-source-cookie-{}.txt", uuid::Uuid::new_v4()));
    let source_content = format!(
        "{}\n.douyin.com\tTRUE\t/\tTRUE\t1900000000\tttwid\tplaceholder",
        NETSCAPE_COOKIE_HEADER
    );
    std::fs::write(&source_path, &source_content).expect("write source cookie");

    let temp_path = copy_cookie_file_to_temp(&source_path, "douyin-gateway")
        .expect("copy cookie to temp file");

    assert_ne!(temp_path, source_path);
    assert_eq!(
        std::fs::read_to_string(&temp_path).expect("read temp cookie"),
        source_content
    );

    cleanup_temp_cookie_file(Some(temp_path));
    let _ = std::fs::remove_file(source_path);
}
