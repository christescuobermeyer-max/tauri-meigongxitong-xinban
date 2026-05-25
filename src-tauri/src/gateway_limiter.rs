use crate::line_health::{LineHealthSnapshot, LineHealthStatus};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

const AUTO_GENERATION_LINES: [&str; 7] =
    ["line2", "line3", "line4", "line5", "line6", "line7", "line1"];

/// line1（wlai）成本最高，作"备用"使用：
/// 只有当其他可用线路（line2..line6 中健康 + 未满 + 尺寸匹配）少于这个阈值时，
/// 才把 line1 加入候选池。其余情况下 line1 永远不被自动选中。
const FALLBACK_LINE: &str = "line1";
const FALLBACK_PROMOTE_THRESHOLD: usize = 2;

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
    /// 顺序按 AUTO_GENERATION_LINES 顺序，line1 在末尾（fallback）。
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

    pub fn can_acquire_line(&self, line: &str) -> bool {
        if !self.has_global_capacity() {
            return false;
        }
        let line_limit = self.line_limits.get(line).copied().unwrap_or(1);
        if line_limit == 0 {
            return false;
        }
        self.active_by_line.get(line).copied().unwrap_or(0) < line_limit
    }

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
        // 第一轮：只看非 line1 候选。
        // 只要还有 >= FALLBACK_PROMOTE_THRESHOLD (=2) 个非 line1 健康+未满的线路，永远不动用 line1。
        let primary = self.collect_auto_candidates(size, health, exclude, /*include_fallback=*/ false);
        if primary.len() >= FALLBACK_PROMOTE_THRESHOLD {
            return Self::pick_best_candidate(primary);
        }

        // 第二轮：非 line1 候选不足（其他线路 ≤1 条可用），把 line1 加进来一起挑。
        let with_fallback = self.collect_auto_candidates(size, health, exclude, /*include_fallback=*/ true);
        Self::pick_best_candidate(with_fallback)
    }

    /// 返回所有满足"自动路由可挑选"条件的候选行（包含排序键）。
    /// 当 `include_fallback=false` 时，line1（FALLBACK_LINE）被显式排除。
    fn collect_auto_candidates(
        &self,
        size: &str,
        health: &LineHealthSnapshot,
        exclude: &HashSet<String>,
        include_fallback: bool,
    ) -> Vec<(&'static str, usize, usize, u64, usize)> {
        AUTO_GENERATION_LINES
            .iter()
            .copied()
            .filter(|line| include_fallback || *line != FALLBACK_LINE)
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

    pub fn can_queue_line(&self, line: &str) -> bool {
        self.global_limit > 0 && self.line_limits.get(line).copied().unwrap_or(1) > 0
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
        "line2" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "21:9" | "auto" => Cow::Borrowed("1792x768"),
            "4:3" | "3:2" => Cow::Borrowed("1536x1024"),
            // line2 上游不接受 "3:4" 比例字面量，必须映射成像素值
            "2:3" | "3:4" => Cow::Borrowed("1024x1536"),
            other => Cow::Borrowed(other),
        },
        // line6 = manxiaobai，gpt-image-2-1k 模型支持的尺寸：
        //   1024x1024 / 1536x1024 / 1024x1536 / 1824x1024 / 1024x1824
        //   / 1360x1024 / 1024x1360 / 2384x1024
        // 不支持 1792x768 / 1792x1024 / 比例字面量；客户端传过来的需要全部映射。
        "line6" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            // 16:9 ≈ 1.778, 1824/1024 = 1.781 最接近
            "16:9" | "auto" | "1792x768" | "1792x1024" => Cow::Borrowed("1824x1024"),
            // 21:9 ≈ 2.333, 2384/1024 = 2.328 最接近
            "21:9" => Cow::Borrowed("2384x1024"),
            // 4:3 ≈ 1.333, 1360/1024 = 1.328 最接近
            "4:3" => Cow::Borrowed("1360x1024"),
            // 3:2 = 1.5, 1536/1024 = 1.5 精确匹配
            "3:2" => Cow::Borrowed("1536x1024"),
            // 2:3 ↔ 3:2 翻转
            "2:3" => Cow::Borrowed("1024x1536"),
            // 3:4 ↔ 4:3 翻转, 1024/1360 = 0.753
            "3:4" => Cow::Borrowed("1024x1360"),
            other => Cow::Borrowed(other),
        },
        "line1" | "line3" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "4:3" | "3:2" | "auto" => Cow::Borrowed("1536x1024"),
            "2:3" => Cow::Borrowed("1024x1536"),
            other => Cow::Borrowed(other),
        },
        // line7 = otuapi。文档支持 1024x1024 / 1024x1792 / 1792x1024。
        // 没有 1024x1536 / 1536x1024 这两个尺寸，比例字段映射到最接近的尺寸。
        "line7" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "21:9" | "3:2" | "4:3" | "auto" => Cow::Borrowed("1792x1024"),
            "2:3" | "3:4" | "1024x1536" => Cow::Borrowed("1024x1792"),
            "1536x1024" => Cow::Borrowed("1792x1024"),
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
        // line2 上游不接受 "3:4" 字面量（之前误报，导致 4xx 浪费 retry）
        "line2" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "1792x768"
        ),
        // line6 = manxiaobai/gpt-image-2-1k 严格只接受这 8 个像素值
        "line6" => matches!(
            size,
            "1024x1024"
                | "1536x1024"
                | "1024x1536"
                | "1824x1024"
                | "1024x1824"
                | "1360x1024"
                | "1024x1360"
                | "2384x1024"
        ),
        "line1" | "line3" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "21:9" | "3:4"
        ),
        "line7" => matches!(size, "1024x1024" | "1024x1792" | "1792x1024"),
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
            24,
            HashMap::from([
                ("line1", 2),
                ("line2", 4),
                ("line3", 4),
                ("line4", 4),
                ("line5", 4),
                ("line6", 3),
                ("line7", 3),
            ]),
        )
    }

    #[test]
    fn enforces_global_limit_of_twenty_four_active_generations() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line1").allowed);
        assert!(limiter.try_acquire("line1").allowed);
        assert!(limiter.try_acquire("line2").allowed);
        assert!(limiter.try_acquire("line2").allowed);
        assert!(limiter.try_acquire("line2").allowed);
        assert!(limiter.try_acquire("line2").allowed);
        assert!(limiter.try_acquire("line3").allowed);
        assert!(limiter.try_acquire("line3").allowed);
        assert!(limiter.try_acquire("line3").allowed);
        assert!(limiter.try_acquire("line3").allowed);
        assert!(limiter.try_acquire("line4").allowed);
        assert!(limiter.try_acquire("line4").allowed);
        assert!(limiter.try_acquire("line4").allowed);
        assert!(limiter.try_acquire("line4").allowed);
        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line6").allowed);
        assert!(limiter.try_acquire("line6").allowed);
        assert!(limiter.try_acquire("line6").allowed);
        assert!(limiter.try_acquire("line7").allowed);
        assert!(limiter.try_acquire("line7").allowed);
        assert!(limiter.try_acquire("line7").allowed);

        let rejected = limiter.try_acquire("line3");
        assert!(!rejected.allowed);
        assert_eq!(
            rejected.reason.as_deref(),
            Some("当前生图请求较多，已达到全局并发上限 24，请稍后再试")
        );
    }

    #[test]
    fn enforces_line_specific_limits() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line6").allowed);
        assert!(limiter.try_acquire("line6").allowed);
        assert!(limiter.try_acquire("line6").allowed);
        let line6_rejected = limiter.try_acquire("line6");
        assert!(!line6_rejected.allowed);
        assert_eq!(
            line6_rejected.reason.as_deref(),
            Some("line6 当前请求较多，已达到线路并发上限 3，请稍后再试")
        );
    }

    #[test]
    fn release_frees_capacity_for_next_request() {
        let mut limiter = default_limiter();

        assert!(limiter.try_acquire("line5").allowed);
        assert!(limiter.try_acquire("line5").allowed);
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
    fn line1_excluded_from_primary_when_two_or_more_other_lines_available() {
        // 所有线路健康且空闲时，line1 不应被自动路由选中（line1=fallback）。
        let limiter = default_limiter();
        let health = LineHealthRegistry::new().snapshot();
        let line = limiter.select_generation_line("1024x1536", &health);
        assert_ne!(line, Some("line1"));
        assert_eq!(line, Some("line2"));
    }

    #[test]
    fn line1_excluded_from_primary_even_when_other_lines_busy() {
        // line2,3,4,5 都已被占走 1 个，但 line6 仍空闲 → primary 仍有 >=2 个非 line1 候选。
        // line1 active=0 即使是最快候选也不应被选中。
        let mut limiter = default_limiter();
        let health = LineHealthRegistry::new().snapshot();
        let _ = limiter.try_acquire("line2");
        let _ = limiter.try_acquire("line3");
        let _ = limiter.try_acquire("line4");
        let _ = limiter.try_acquire("line5");
        // 此时 primary = [line2(active=1), line3(1), line4(1), line5(1), line6(0)]，5 个 >= 2
        let line = limiter.try_acquire_auto("1024x1536", &health);
        assert_ne!(line.line, Some("line1"));
        assert_eq!(line.line, Some("line6"));
    }

    #[test]
    fn line1_promoted_when_only_one_other_line_available() {
        // line3,4,5,6,7 全 Red（5/5 失败），只剩 line2 → primary.len()==1 < 2，line1 被纳入候选。
        let mut limiter = default_limiter();
        let registry = LineHealthRegistry::new();
        for line in ["line3", "line4", "line5", "line6", "line7"] {
            for _ in 0..5 {
                registry.record(line, 0, false);
            }
        }
        let health = registry.snapshot();

        // 第 1 次：line2 active=0、line1 active=0；按 order line2 优先。
        let first = limiter.try_acquire_auto("1024x1536", &health);
        assert_eq!(first.line, Some("line2"));
        // 第 2 次：line2 active=1、line1 active=0；按 active 排序，line1 胜出（这正是"补位"作用）。
        let second = limiter.try_acquire_auto("1024x1536", &health);
        assert_eq!(second.line, Some("line1"));
    }

    #[test]
    fn line1_used_when_all_other_lines_unavailable() {
        // 所有非 line1 线路全 Red → line1 是唯一可用线路。
        let mut limiter = default_limiter();
        let registry = LineHealthRegistry::new();
        for line in ["line2", "line3", "line4", "line5", "line6", "line7"] {
            for _ in 0..5 {
                registry.record(line, 0, false);
            }
        }
        let health = registry.snapshot();
        let line = limiter.try_acquire_auto("1024x1536", &health);
        assert_eq!(line.line, Some("line1"));
    }

    #[test]
    fn line1_not_selected_even_when_faster_than_others() {
        // 即使 line1 latency=10s，而 line2-6 latency=100s，
        // primary 不含 line1，所以 line1 永远不会因为"快"而被选中。
        let limiter = default_limiter();
        let registry = LineHealthRegistry::new();
        registry.record("line1", 10_000, true);
        registry.record("line2", 100_000, true);
        registry.record("line3", 100_000, true);
        let health = registry.snapshot();
        let line = limiter.select_generation_line("1024x1536", &health);
        assert_ne!(line, Some("line1"));
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
