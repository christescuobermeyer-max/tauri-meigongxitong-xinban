//! 生图线路健康度统计（内存环形缓冲）
//!
//! 网关进程中，每次 `/api/generate-image` 完成（无论成功失败）调用 `record`
//! 把一条样本压入对应线路的 10 元素环形缓冲；前端拉 `/api/line-health` 时
//! `snapshot()` 按线路计算状态。
//!
//! 阈值：
//! - green   median < 150_000 ms 且最近未连续失败 5 次
//! - yellow  median ≥ 150_000 ms 且最近未连续失败 5 次（仅作 UI 警示，不影响路由）
//! - red     最近连续 5 次全部失败（唯一进入 Red 的条件）
//! - unknown 无样本或最近样本距今超过 5 分钟（视为陈旧 → 自动复活给一次探测机会）

use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::SystemTime;

pub const RING_BUFFER_CAP: usize = 10;
pub const RED_FAILURE_STREAK: usize = 5;
pub const GREEN_MAX_MS: u64 = 150_000;
pub const STALE_AFTER_SECS: u64 = 300;

const LINES: [&str; 6] = ["line2", "line3", "line4", "line5", "line6", "line7"];

#[derive(Debug, Clone)]
struct Sample {
    occurred_at: SystemTime,
    latency_ms: u64,
    success: bool,
}

#[derive(Default)]
pub struct LineHealthRegistry {
    inner: Mutex<HashMap<String, VecDeque<Sample>>>,
}

impl LineHealthRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, line: &str, latency_ms: u64, success: bool) {
        let mut guard = self
            .inner
            .lock()
            .expect("line health registry mutex poisoned");
        let buf = guard.entry(line.to_string()).or_insert_with(VecDeque::new);
        if buf.len() >= RING_BUFFER_CAP {
            buf.pop_front();
        }
        buf.push_back(Sample {
            occurred_at: SystemTime::now(),
            latency_ms,
            success,
        });
    }

    pub fn snapshot(&self) -> LineHealthSnapshot {
        let guard = self
            .inner
            .lock()
            .expect("line health registry mutex poisoned");
        let now = SystemTime::now();
        let mut lines = HashMap::with_capacity(LINES.len());
        for line in LINES.iter() {
            let entry = match guard.get(*line) {
                Some(buf) if !buf.is_empty() => classify(buf, now),
                _ => LineHealthEntry::unknown(),
            };
            lines.insert(line.to_string(), entry);
        }
        LineHealthSnapshot { lines }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum LineHealthStatus {
    Green,
    Yellow,
    Red,
    Unknown,
}

#[derive(Debug, Serialize, Clone)]
pub struct LineHealthEntry {
    pub status: LineHealthStatus,
    /// 最近 N 次样本（含成功+失败）的中位延迟，ms；无样本时为 None
    pub latency_ms: Option<u64>,
    pub sample_count: usize,
    pub failure_count: usize,
    /// 最近一次样本的 ISO8601 时间；无样本时为 None
    pub last_at: Option<String>,
    /// 最近一次样本是否成功；无样本时为 None
    pub last_success: Option<bool>,
}

impl LineHealthEntry {
    fn unknown() -> Self {
        Self {
            status: LineHealthStatus::Unknown,
            latency_ms: None,
            sample_count: 0,
            failure_count: 0,
            last_at: None,
            last_success: None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct LineHealthSnapshot {
    pub lines: HashMap<String, LineHealthEntry>,
}

fn classify(buf: &VecDeque<Sample>, now: SystemTime) -> LineHealthEntry {
    let last = buf.back().expect("classify called on empty buf");
    let stale = now
        .duration_since(last.occurred_at)
        .map(|d| d.as_secs() > STALE_AFTER_SECS)
        .unwrap_or(false);
    if stale {
        return LineHealthEntry::unknown();
    }

    let sample_count = buf.len();
    let failure_count = buf.iter().filter(|s| !s.success).count();
    let mut latencies: Vec<u64> = buf.iter().map(|s| s.latency_ms).collect();
    latencies.sort_unstable();
    let median = latencies[latencies.len() / 2];

    let recent_failures = buf
        .iter()
        .rev()
        .take(RED_FAILURE_STREAK)
        .filter(|s| !s.success)
        .count();

    let status = if recent_failures >= RED_FAILURE_STREAK {
        LineHealthStatus::Red
    } else if median >= GREEN_MAX_MS {
        LineHealthStatus::Yellow
    } else {
        LineHealthStatus::Green
    };

    LineHealthEntry {
        status,
        latency_ms: Some(median),
        sample_count,
        failure_count,
        last_at: Some(format_iso(last.occurred_at)),
        last_success: Some(last.success),
    }
}

fn format_iso(t: SystemTime) -> String {
    let dt: chrono::DateTime<chrono::Utc> = t.into();
    dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push(reg: &LineHealthRegistry, line: &str, latency_ms: u64, success: bool) {
        reg.record(line, latency_ms, success);
    }

    #[test]
    fn empty_is_unknown() {
        let reg = LineHealthRegistry::new();
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line2"].status, LineHealthStatus::Unknown);
        assert_eq!(snap.lines["line2"].sample_count, 0);
    }

    #[test]
    fn single_fast_sample_is_green() {
        let reg = LineHealthRegistry::new();
        push(&reg, "line2", 100_000, true);
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line2"].status, LineHealthStatus::Green);
        assert_eq!(snap.lines["line2"].latency_ms, Some(100_000));
    }

    #[test]
    fn median_in_yellow_range_is_yellow() {
        let reg = LineHealthRegistry::new();
        for ms in [100_000u64, 160_000, 200_000, 240_000, 260_000] {
            push(&reg, "line2", ms, true);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line2"].status, LineHealthStatus::Yellow);
    }

    #[test]
    fn high_latency_with_successes_is_yellow_not_red() {
        // 高延迟但全部成功，仅 Yellow，不应进入 Red（Red 现在只由失败次数触发）
        let reg = LineHealthRegistry::new();
        for ms in [200_000u64, 300_000, 400_000, 500_000, 600_000] {
            push(&reg, "line2", ms, true);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line2"].status, LineHealthStatus::Yellow);
        assert_eq!(snap.lines["line2"].failure_count, 0);
    }

    #[test]
    fn five_failures_force_red() {
        let reg = LineHealthRegistry::new();
        for _ in 0..5 {
            push(&reg, "line2", 0, false);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line2"].status, LineHealthStatus::Red);
        assert_eq!(snap.lines["line2"].failure_count, 5);
    }

    #[test]
    fn four_failures_with_one_success_is_not_red() {
        let reg = LineHealthRegistry::new();
        push(&reg, "line2", 90_000, true);
        for _ in 0..4 {
            push(&reg, "line2", 0, false);
        }
        let snap = reg.snapshot();
        // 4 个失败 + 1 个 90s 成功，median latency = 0，不应触发 Red
        assert_ne!(snap.lines["line2"].status, LineHealthStatus::Red);
        assert_eq!(snap.lines["line2"].failure_count, 4);
    }

    #[test]
    fn ring_buffer_caps_at_10() {
        let reg = LineHealthRegistry::new();
        for ms in [
            10_000u64, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000,
            110_000, 120_000,
        ] {
            push(&reg, "line2", ms, true);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line2"].sample_count, 10);
    }

    #[test]
    fn older_failures_without_recent_streak_do_not_force_red() {
        let reg = LineHealthRegistry::new();
        for _ in 0..5 {
            push(&reg, "line2", 0, false);
        }
        for _ in 0..5 {
            push(&reg, "line2", 90_000, true);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line2"].sample_count, 10);
        assert_eq!(snap.lines["line2"].failure_count, 5);
        assert_ne!(snap.lines["line2"].status, LineHealthStatus::Red);
    }
}
