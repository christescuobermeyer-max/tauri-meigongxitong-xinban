use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LimitDecision {
    pub allowed: bool,
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

#[cfg(test)]
mod tests {
    use super::GatewayLimiter;
    use std::collections::HashMap;

    fn default_limiter() -> GatewayLimiter {
        GatewayLimiter::new(
            3,
            HashMap::from([
                ("line2", 1),
                ("line3", 1),
                ("line4", 0),
                ("line5", 2),
                ("line6", 1),
            ]),
        )
    }

    #[test]
    fn enforces_global_limit_of_three_active_generations() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line6").allowed);

        let rejected = limiter.try_acquire("line2");
        assert!(!rejected.allowed);
        assert_eq!(
            rejected.reason.as_deref(),
            Some("当前生图请求较多，已达到全局并发上限 3，请稍后再试")
        );
    }

    #[test]
    fn enforces_line_specific_limits_and_pauses_line4() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line6").allowed);
        let line6_rejected = limiter.try_acquire("line6");
        assert!(!line6_rejected.allowed);
        assert_eq!(
            line6_rejected.reason.as_deref(),
            Some("line6 当前请求较多，已达到线路并发上限 1，请稍后再试")
        );

        let line4_rejected = limiter.try_acquire("line4");
        assert!(!line4_rejected.allowed);
        assert_eq!(
            line4_rejected.reason.as_deref(),
            Some("line4 当前已暂停，请切换线路或稍后再试")
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
}
