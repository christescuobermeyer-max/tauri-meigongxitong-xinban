use super::*;

#[test]
fn scores_fresh_douyin_cookie_above_expired_login_cookie() {
    let now = 1_800_000_000;
    let expired = r#"[
      {"domain":".douyin.com","name":"sessionid","value":"x","path":"/","expirationDate":1700000000,"hostOnly":false,"secure":true,"session":false}
    ]"#;
    let fresh = r#"[
      {"domain":".douyin.com","name":"ttwid","value":"x","path":"/","expirationDate":1900000000,"hostOnly":false,"secure":true,"session":false}
    ]"#;

    let expired_score = score_cookie_content(expired, "抖音cookie.txt", now).unwrap();
    let fresh_score = score_cookie_content(fresh, "抖音cookie.txt", now).unwrap();

    assert!(fresh_score > expired_score);
}

fn score_cookie_content(
    content: &str,
    cookie_file_name: &str,
    now_secs: i64,
) -> Result<CookieCandidateScore, String> {
    let cookies = parse_cookie_metadata(content)?;
    let relevant: Vec<&CookieMeta> = cookies
        .iter()
        .filter(|cookie| is_relevant_cookie(cookie_file_name, &cookie.domain))
        .collect();
    let fresh_relevant_count = relevant
        .iter()
        .filter(|cookie| is_fresh_cookie(cookie.expires, now_secs))
        .count();
    let fresh_important_count = relevant
        .iter()
        .filter(|cookie| {
            is_important_cookie(cookie_file_name, &cookie.name)
                && is_fresh_cookie(cookie.expires, now_secs)
        })
        .count();
    Ok(CookieCandidateScore {
        fresh_important_count,
        fresh_relevant_count,
        relevant_count: relevant.len(),
        modified_secs: 0,
    })
}
