use super::*;

impl GatewayLimiter {
    pub fn new(global_limit: usize, line_limits: HashMap<&'static str, usize>) -> Self {
        Self {
            global_limit,
            line_limits,
            active_global: 0,
            active_by_line: HashMap::new(),
        }
    }

    pub fn global_limit(&self) -> usize {
        self.global_limit
    }

    pub fn active_global(&self) -> usize {
        self.active_global
    }

    pub fn line_limits(&self) -> &HashMap<&'static str, usize> {
        &self.line_limits
    }

    pub fn active_by_line(&self) -> &HashMap<String, usize> {
        &self.active_by_line
    }

    /// 监控用：返回所有已配置线路的 (line, limit, active_count) 列表。
    /// 顺序按 AUTO_GENERATION_LINES 顺序。
    pub fn line_snapshots(&self) -> Vec<(&'static str, usize, usize)> {
        AUTO_GENERATION_LINES
            .iter()
            .copied()
            .map(|line| {
                let limit = self.line_limits.get(line).copied().unwrap_or(0);
                let active = self.active_by_line.get(line).copied().unwrap_or(0);
                (line, limit, active)
            })
            .collect()
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

    pub fn has_global_capacity(&self) -> bool {
        self.global_limit > 0 && self.active_global < self.global_limit
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
