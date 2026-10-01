use crate::*;
use crate::gateway_test_support::*;

#[test]
fn excludes_all_shared_zikl_lines_after_line2_failure() {
    let mut tried_lines = HashSet::from(["line2".to_string()]);

    assert!(exclude_shared_zikl_lines(
        &mut tried_lines,
        ImageApiLine::Line2
    ));
    assert_eq!(tried_lines.len(), 3);
    for line in ZIKL_SHARED_LINES {
        assert!(tried_lines.contains(line));
    }
}

#[test]
fn excludes_all_shared_zikl_lines_after_line3_or_line4_failure() {
    for failed_line in [ImageApiLine::Line3, ImageApiLine::Line4] {
        let mut tried_lines = HashSet::new();

        assert!(exclude_shared_zikl_lines(&mut tried_lines, failed_line));
        assert_eq!(tried_lines.len(), 3);
        for line in ZIKL_SHARED_LINES {
            assert!(tried_lines.contains(line));
        }
    }
}

#[test]
fn does_not_exclude_zikl_siblings_after_other_line_failure() {
    let mut tried_lines = HashSet::from(["line5".to_string()]);

    assert!(!exclude_shared_zikl_lines(
        &mut tried_lines,
        ImageApiLine::Line5
    ));
    assert_eq!(tried_lines, HashSet::from(["line5".to_string()]));
}

#[test]
fn detects_upstream_quota_exhaustion_errors() {
    assert!(is_quota_exhausted_error(
        r#"线路6编辑接口返回 403 Forbidden: {"error":{"message":"预扣费额度失败, 用户剩余额度: ¤0.025000, 需要预扣费额度: ¤0.050000","code":"insufficient_user_quota"}}"#
    ));
    assert!(is_quota_exhausted_error(
        r#"线路5 APIMart接口返回 402 Payment Required: {"error":{"message":"insufficient balance (current: 0.032)"}}"#
    ));
}

#[test]
fn ignores_transient_upstream_errors_for_auto_pause() {
    assert!(!is_quota_exhausted_error(
        "调用线路6编辑接口失败：Connection timed out"
    ));
    assert!(!is_quota_exhausted_error(
        "线路3 vectorengine接口返回 524 <unknown status code>: error code: 524"
    ));
}
