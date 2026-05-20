use crate::line_health::{LineHealthSnapshot, LineHealthStatus};
use std::borrow::Cow;
use std::collections::HashMap;

const AUTO_GENERATION_LINES: [&str; 5] = ["line2", "line3", "line4", "line5", "line6"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LimitDecision {
    pub allowed: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcquireDecision {
    pub line: Option<&'static str>,
    pub reason: Option<String>,
}

#[derive(Debug)]
pub struct GatewayLimiter {
    global_limit: usize,
    line_limits: HashMap<&'static str, usize>,
    active_global: usize,
    active_by_line: HashMap<String, usize>,
}

impl GatewayLimiter {
    pub fn new(global_limit: usize, line_limits: HashMap<&'static str, usize>) -> Self {
        Self {
            global_limit,
            line_limits,
            active_global: 0,
            active_by_line: HashMap::new(),
        }
    }

    pub fn try_acquire(&mut self, line: &str) -> LimitDecision {
        if self.global_limit == 0 {
            return LimitDecision {
                allowed: false,
                reason: Some("当前生图队列已暂停，请稍后再试".to_string()),
            };
        }
        if self.active_global >= self.global_limit {
            return LimitDecision {
                allowed: false,
                reason: Some(format!(
                    "当前生图请求较多，已达到全局并发上限 {}，请稍后再试",
                    self.global_limit
                )),
            };
        }

        let line_limit = self.line_limits.get(line).copied().unwrap_or(1);
        if line_limit == 0 {
            return LimitDecision {
                allowed: false,
                reason: Some(format!("{line} 当前已暂停，请切换线路或稍后再试")),
            };
        }

        let active_line = self.active_by_line.get(line).copied().unwrap_or(0);
        if active_line >= line_limit {
            return LimitDecision {
                allowed: false,
                reason: Some(format!(
                    "{line} 当前请求较多，已达到线路并发上限 {}，请稍后再试",
                    line_limit
                )),
            };
        }

        self.active_global += 1;
        self.active_by_line
            .insert(line.to_string(), active_line.saturating_add(1));
        LimitDecision {
            allowed: true,
            reason: None,
        }
    }

    pub fn try_acquire_auto(&mut self, size: &str, health: &LineHealthSnapshot) -> AcquireDecision {
        if self.global_limit == 0 {
            return AcquireDecision {
                line: None,
                reason: Some("当前生图队列已暂停，请稍后再试".to_string()),
            };
        }
        if self.active_global >= self.global_limit {
            return AcquireDecision {
                line: None,
                reason: Some(format!(
                    "当前生图请求较多，已达到全局并发上限 {}，请稍后再试",
                    self.global_limit
                )),
            };
        }

        let selected = self.select_generation_line(size, health);
        let Some(line) = selected else {
            return AcquireDecision {
                line: None,
                reason: Some("当前没有可用生图线路，请稍后重新提交".to_string()),
            };
        };

        let active_line = self.active_by_line.get(line).copied().unwrap_or(0);
        self.active_global += 1;
        self.active_by_line
            .insert(line.to_string(), active_line.saturating_add(1));
        AcquireDecision {
            line: Some(line),
            reason: None,
        }
    }

    pub fn select_generation_line(
        &self,
        size: &str,
        health: &LineHealthSnapshot,
    ) -> Option<&'static str> {
        let mut candidates = AUTO_GENERATION_LINES
            .iter()
            .copied()
            .filter(|line| supports_generation_size(line, size))
            .filter_map(|line| {
                let line_limit = self.line_limits.get(line).copied().unwrap_or(1);
                if line_limit == 0 {
                    return None;
                }
                let active_line = self.active_by_line.get(line).copied().unwrap_or(0);
                if active_line >= line_limit {
                    return None;
                }
                let entry = health.lines.get(line);
                let status = entry
                    .map(|entry| entry.status)
                    .unwrap_or(LineHealthStatus::Unknown);
                if status == LineHealthStatus::Red {
                    return None;
                }
                let latency_ms = entry.and_then(|entry| entry.latency_ms).unwrap_or(u64::MAX);
                Some((
                    line,
                    health_rank(status),
                    active_line,
                    latency_ms,
                    auto_line_order(line),
                ))
            })
            .collect::<Vec<_>>();

        candidates.sort_by_key(|(_, health_rank, active_line, latency_ms, order)| {
            (*active_line, *health_rank, *latency_ms, *order)
        });
        candidates.first().map(|candidate| candidate.0)
    }

    pub fn release(&mut self, line: &str) {
        self.active_global = self.active_global.saturating_sub(1);
        let current = self.active_by_line.get(line).copied().unwrap_or(0);
        if current <= 1 {
            self.active_by_line.remove(line);
        } else {
            self.active_by_line.insert(line.to_string(), current - 1);
        }
    }
}

pub fn supports_generation_size(line: &str, size: &str) -> bool {
    generation_size_for_line(line, size).is_some()
}

pub fn generation_size_for_line<'a>(line: &str, size: &'a str) -> Option<Cow<'a, str>> {
    let mapped = match line {
        "line5" => match size {
            "1024x1024" => Cow::Borrowed("1:1"),
            "1536x1024" => Cow::Borrowed("3:2"),
            "1792x1024" => Cow::Borrowed("16:9"),
            "1792x768" => Cow::Borrowed("21:9"),
            other => Cow::Borrowed(other),
        },
        "line4" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "4:3" | "3:2" => Cow::Borrowed("1536x1024"),
            "2:3" => Cow::Borrowed("1024x1536"),
            "auto" => Cow::Borrowed("16:9"),
            other => Cow::Borrowed(other),
        },
        "line2" | "line6" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "21:9" | "auto" => Cow::Borrowed("1792x768"),
            "4:3" | "3:2" => Cow::Borrowed("1536x1024"),
            "2:3" => Cow::Borrowed("1024x1536"),
            other => Cow::Borrowed(other),
        },
        "line1" | "line3" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "4:3" | "3:2" | "auto" => Cow::Borrowed("1536x1024"),
            "2:3" => Cow::Borrowed("1024x1536"),
            other => Cow::Borrowed(other),
        },
        _ => return None,
    };

    if supports_provider_size(line, mapped.as_ref()) {
        Some(mapped)
    } else {
        None
    }
}

fn supports_provider_size(line: &str, size: &str) -> bool {
    match line {
        "line5" => matches!(
            size,
            "1:1" | "16:9" | "21:9" | "4:3" | "3:4" | "3:2" | "2:3" | "1024x1536" | "auto"
        ),
        "line4" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "16:9" | "21:9" | "3:4"
        ),
        "line2" | "line6" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "1792x768" | "3:4"
        ),
        "line1" | "line3" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "21:9" | "3:4"
        ),
        _ => false,
    }
}

fn health_rank(status: LineHealthStatus) -> usize {
    match status {
        LineHealthStatus::Green => 0,
        LineHealthStatus::Unknown => 1,
        LineHealthStatus::Yellow => 2,
        LineHealthStatus::Red => 3,
    }
}

fn auto_line_order(line: &str) -> usize {
    AUTO_GENERATION_LINES
        .iter()
        .position(|candidate| *candidate == line)
        .unwrap_or(AUTO_GENERATION_LINES.len())
}

#[cfg(test)]
mod tests {
    use super::{generation_size_for_line, GatewayLimiter};
    use crate::line_health::{LineHealthRegistry, LineHealthStatus};
    use std::collections::HashMap;

    fn default_limiter() -> GatewayLimiter {
        GatewayLimiter::new(
            6,
            HashMap::from([
                ("line2", 2),
                ("line3", 2),
                ("line4", 2),
                ("line5", 2),
                ("line6", 2),
            ]),
        )
    }

    #[test]
    fn enforces_global_limit_of_six_active_generations() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line2").allowed);
        assert!(limiter.try_acquire("line2").allowed);
        assert!(limiter.try_acquire("line3").allowed);
        assert!(limiter.try_acquire("line3").allowed);
        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line5").allowed);

        let rejected = limiter.try_acquire("line2");
        assert!(!rejected.allowed);
        assert_eq!(
            rejected.reason.as_deref(),
            Some("当前生图请求较多，已达到全局并发上限 6，请稍后再试")
        );
    }

    #[test]
    fn enforces_line_specific_limits() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line6").allowed);
        assert!(limiter.try_acquire("line6").allowed);
        let line6_rejected = limiter.try_acquire("line6");
        assert!(!line6_rejected.allowed);
        assert_eq!(
            line6_rejected.reason.as_deref(),
            Some("line6 当前请求较多，已达到线路并发上限 2，请稍后再试")
        );
    }

    #[test]
    fn release_frees_capacity_for_next_request() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line5").allowed);
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
    }

    #[test]
    fn auto_routing_excludes_red_health_lines() {
        let mut limiter = default_limiter();
        let registry = LineHealthRegistry::new();
        for _ in 0..3 {
            registry.record("line5", 0, false);
        }
        let health = registry.snapshot();
        assert_eq!(health.lines["line5"].status, LineHealthStatus::Red);

        let selected = limiter.try_acquire_auto("1024x1536", &health);

        assert_eq!(selected.line, Some("line2"));
    }

    #[test]
    fn auto_routing_respects_size_compatibility() {
        let mut limiter = default_limiter();
        let health = LineHealthRegistry::new().snapshot();

        assert_eq!(limiter.try_acquire_auto("16:9", &health).line, Some("line2"));
        assert_eq!(limiter.try_acquire_auto("16:9", &health).line, Some("line3"));

        let routed = limiter.try_acquire_auto("16:9", &health);
        assert_eq!(routed.line, Some("line4"));
    }

    #[test]
    fn maps_auto_request_size_to_selected_provider_size() {
        assert_eq!(
            generation_size_for_line("line2", "3:2").as_deref(),
            Some("1536x1024")
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
}
