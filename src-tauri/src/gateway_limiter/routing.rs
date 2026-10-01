use super::*;

impl GatewayLimiter {
    pub fn try_acquire_auto(&mut self, size: &str, health: &LineHealthSnapshot) -> AcquireDecision {
        self.try_acquire_auto_excluding(size, health, &HashSet::new())
    }

    pub fn try_acquire_auto_excluding(
        &mut self,
        size: &str,
        health: &LineHealthSnapshot,
        exclude: &HashSet<String>,
    ) -> AcquireDecision {
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

        let selected = self.select_generation_line_excluding(size, health, exclude);
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
        self.select_generation_line_excluding(size, health, &HashSet::new())
    }

    pub fn select_generation_line_excluding(
        &self,
        size: &str,
        health: &LineHealthSnapshot,
        exclude: &HashSet<String>,
    ) -> Option<&'static str> {
        let candidates = self.collect_auto_candidates(size, health, exclude);
        Self::pick_best_candidate(candidates)
    }

    /// 返回所有满足"自动路由可挑选"条件的候选行（包含排序键）。
    fn collect_auto_candidates(
        &self,
        size: &str,
        health: &LineHealthSnapshot,
        exclude: &HashSet<String>,
    ) -> Vec<(&'static str, usize, usize, u64, usize)> {
        AUTO_GENERATION_LINES
            .iter()
            .copied()
            .filter(|line| !exclude.contains(*line))
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
            .collect()
    }

    fn pick_best_candidate(
        mut candidates: Vec<(&'static str, usize, usize, u64, usize)>,
    ) -> Option<&'static str> {
        candidates.sort_by_key(|(_, health_rank, active_line, latency_ms, order)| {
            (*active_line, *health_rank, *latency_ms, *order)
        });
        candidates.first().map(|candidate| candidate.0)
    }

    pub fn has_auto_candidate(&self, size: &str, health: &LineHealthSnapshot) -> bool {
        self.has_auto_candidate_excluding(size, health, &HashSet::new())
    }

    pub fn has_auto_candidate_excluding(
        &self,
        size: &str,
        health: &LineHealthSnapshot,
        exclude: &HashSet<String>,
    ) -> bool {
        if self.global_limit == 0 {
            return false;
        }

        AUTO_GENERATION_LINES.iter().copied().any(|line| {
            if exclude.contains(line) {
                return false;
            }
            let line_limit = self.line_limits.get(line).copied().unwrap_or(1);
            if line_limit == 0 || !supports_generation_size(line, size) {
                return false;
            }
            let entry = health.lines.get(line);
            let status = entry
                .map(|entry| entry.status)
                .unwrap_or(LineHealthStatus::Unknown);
            status != LineHealthStatus::Red
        })
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
