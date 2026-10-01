use super::{generation_size_for_line, GatewayLimiter};
use crate::line_health::{LineHealthRegistry, LineHealthStatus};
use std::collections::HashMap;

fn default_limiter() -> GatewayLimiter {
    GatewayLimiter::new(
        30,
        HashMap::from([
            ("line2", 6),
            ("line3", 6),
            ("line4", 6),
            ("line5", 8),
            ("line6", 8),
            ("line7", 6),
        ]),
    )
}

#[test]
fn enforces_global_limit_of_thirty_active_generations() {
    let mut limiter = default_limiter();

    for _ in 0..6 {
        assert!(limiter.try_acquire("line2").allowed);
    }
    for _ in 0..6 {
        assert!(limiter.try_acquire("line3").allowed);
    }
    assert!(limiter.try_acquire("line4").allowed);
    assert!(limiter.try_acquire("line4").allowed);
    assert!(limiter.try_acquire("line4").allowed);
    assert!(limiter.try_acquire("line4").allowed);
    for _ in 0..8 {
        assert!(limiter.try_acquire("line5").allowed);
    }
    for _ in 0..6 {
        assert!(limiter.try_acquire("line7").allowed);
    }

    let rejected = limiter.try_acquire("line3");
    assert!(!rejected.allowed);
    assert_eq!(
        rejected.reason.as_deref(),
        Some("当前生图请求较多，已达到全局并发上限 30，请稍后再试")
    );
}

#[test]
fn enforces_line_specific_limits() {
    let mut limiter = default_limiter();

    for _ in 0..8 {
        assert!(limiter.try_acquire("line6").allowed);
    }
    let line6_rejected = limiter.try_acquire("line6");
    assert!(!line6_rejected.allowed);
    assert_eq!(
        line6_rejected.reason.as_deref(),
        Some("line6 当前请求较多，已达到线路并发上限 8，请稍后再试")
    );

    for _ in 0..6 {
        assert!(limiter.try_acquire("line7").allowed);
    }
    let line7_rejected = limiter.try_acquire("line7");
    assert!(!line7_rejected.allowed);
    assert_eq!(
        line7_rejected.reason.as_deref(),
        Some("line7 当前请求较多，已达到线路并发上限 6，请稍后再试")
    );
}

#[test]
fn release_frees_capacity_for_next_request() {
    let mut limiter = default_limiter();

    for _ in 0..8 {
        assert!(limiter.try_acquire("line5").allowed);
    }
    assert!(!limiter.try_acquire("line5").allowed);

    limiter.release("line5");

    assert!(limiter.try_acquire("line5").allowed);
}

#[test]
fn auto_routing_selects_available_line_and_skips_full_lines() {
    let mut limiter = default_limiter();
    let health = LineHealthRegistry::new().snapshot();

    let first = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(first.line, Some("line2"));
    let second = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(second.line, Some("line3"));
    let third = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(third.line, Some("line4"));
    let fourth = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(fourth.line, Some("line5"));
}

#[test]
fn auto_routing_excludes_red_health_lines() {
    let mut limiter = default_limiter();
    let registry = LineHealthRegistry::new();
    for _ in 0..5 {
        registry.record("line5", 0, false);
    }
    let health = registry.snapshot();
    assert_eq!(health.lines["line5"].status, LineHealthStatus::Red);

    let selected = limiter.try_acquire_auto("1024x1536", &health);

    assert_eq!(selected.line, Some("line2"));
}

#[test]
fn auto_routing_uses_line2_first_when_all_lines_available() {
    let limiter = default_limiter();
    let health = LineHealthRegistry::new().snapshot();
    let line = limiter.select_generation_line("1024x1536", &health);
    assert_eq!(line, Some("line2"));
}

#[test]
fn auto_routing_uses_remaining_active_lines_when_earlier_lines_busy() {
    let mut limiter = default_limiter();
    let health = LineHealthRegistry::new().snapshot();
    let _ = limiter.try_acquire("line2");
    let _ = limiter.try_acquire("line3");
    let _ = limiter.try_acquire("line4");
    let _ = limiter.try_acquire("line5");
    let line = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(line.line, Some("line6"));
}

#[test]
fn auto_routing_stays_on_only_available_line_without_fallback() {
    let mut limiter = default_limiter();
    let registry = LineHealthRegistry::new();
    for line in ["line3", "line4", "line5", "line6", "line7"] {
        for _ in 0..5 {
            registry.record(line, 0, false);
        }
    }
    let health = registry.snapshot();

    let first = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(first.line, Some("line2"));
    let second = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(second.line, Some("line2"));
}

#[test]
fn auto_routing_returns_none_when_all_lines_unavailable() {
    let mut limiter = default_limiter();
    let registry = LineHealthRegistry::new();
    for line in ["line2", "line3", "line4", "line5", "line6", "line7"] {
        for _ in 0..5 {
            registry.record(line, 0, false);
        }
    }
    let health = registry.snapshot();
    let line = limiter.try_acquire_auto("1024x1536", &health);
    assert_eq!(line.line, None);
}

#[test]
fn auto_routing_prefers_lower_latency_among_available_lines() {
    let limiter = default_limiter();
    let registry = LineHealthRegistry::new();
    registry.record("line2", 100_000, true);
    registry.record("line3", 10_000, true);
    let health = registry.snapshot();
    let line = limiter.select_generation_line("1024x1536", &health);
    assert_eq!(line, Some("line3"));
}

#[test]
fn auto_routing_respects_size_compatibility() {
    let mut limiter = default_limiter();
    let health = LineHealthRegistry::new().snapshot();

    assert_eq!(
        limiter.try_acquire_auto("16:9", &health).line,
        Some("line2")
    );
    assert_eq!(
        limiter.try_acquire_auto("16:9", &health).line,
        Some("line3")
    );

    let routed = limiter.try_acquire_auto("16:9", &health);
    assert_eq!(routed.line, Some("line4"));
}

#[test]
fn maps_auto_request_size_to_selected_provider_size() {
    assert_eq!(
        generation_size_for_line("line2", "16:9").as_deref(),
        Some("16:9")
    );
    assert_eq!(
        generation_size_for_line("line2", "21:9").as_deref(),
        Some("21:9")
    );
    assert_eq!(
        generation_size_for_line("line2", "1792x768").as_deref(),
        Some("21:9")
    );
    assert_eq!(
        generation_size_for_line("line2", "3:2").as_deref(),
        Some("1536x1024")
    );
    assert_eq!(
        generation_size_for_line("line6", "1792x768").as_deref(),
        Some("2384x1024")
    );
    assert_eq!(
        generation_size_for_line("line6", "16:9").as_deref(),
        Some("1824x1024")
    );
    assert_eq!(
        generation_size_for_line("line7", "21:9").as_deref(),
        Some("1792x768")
    );
    assert_eq!(
        generation_size_for_line("line5", "1536x1024").as_deref(),
        Some("3:2")
    );
    assert_eq!(
        generation_size_for_line("line4", "auto").as_deref(),
        Some("16:9")
    );
}
