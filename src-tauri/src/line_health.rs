//! 生图线路健康度统计（内存环形缓冲）
//!
//! 网关进程中，每次 `/api/generate-image` 完成（无论成功失败）调用 `record`
//! 把一条样本压入对应线路的 5 元素环形缓冲；前端拉 `/api/line-health` 时
//! `snapshot()` 按线路计算状态。
//!
//! 阈值：
//! - green  < 150_000 ms
//! - yellow 150_000–350_000 ms
//! - red    > 350_000 ms 或最近 5 次中 ≥3 次失败
//! - unknown 无样本或最近样本距今超过 60 分钟（视为陈旧）

use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::SystemTime;

pub const RING_BUFFER_CAP: usize = 5;
pub const GREEN_MAX_MS: u64 = 150_000;
pub const YELLOW_MAX_MS: u64 = 350_000;
pub const STALE_AFTER_SECS: u64 = 3600;

const LINES: [&str; 5] = ["line1", "line2", "line3", "line4", "line5"];

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
        let buf = guard
            .entry(line.to_string())
            .or_insert_with(VecDeque::new);
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

    let status = if failure_count >= 3 {
        LineHealthStatus::Red
    } else if median > YELLOW_MAX_MS {
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
        assert_eq!(snap.lines["line1"].status, LineHealthStatus::Unknown);
        assert_eq!(snap.lines["line1"].sample_count, 0);
    }

    #[test]
    fn single_fast_sample_is_green() {
        let reg = LineHealthRegistry::new();
        push(&reg, "line1", 100_000, true);
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line1"].status, LineHealthStatus::Green);
        assert_eq!(snap.lines["line1"].latency_ms, Some(100_000));
    }

    #[test]
    fn median_in_yellow_range_is_yellow() {
        let reg = LineHealthRegistry::new();
        for ms in [100_000u64, 160_000, 200_000, 240_000, 260_000] {
            push(&reg, "line1", ms, true);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line1"].status, LineHealthStatus::Yellow);
    }

    #[test]
    fn median_above_threshold_is_red() {
        let reg = LineHealthRegistry::new();
        for ms in [200_000u64, 300_000, 400_000, 500_000, 600_000] {
            push(&reg, "line1", ms, true);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line1"].status, LineHealthStatus::Red);
    }

    #[test]
    fn three_failures_force_red() {
        let reg = LineHealthRegistry::new();
        push(&reg, "line1", 90_000, true);
        push(&reg, "line1", 90_000, true);
        push(&reg, "line1", 0, false);
        push(&reg, "line1", 0, false);
        push(&reg, "line1", 0, false);
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line1"].status, LineHealthStatus::Red);
        assert_eq!(snap.lines["line1"].failure_count, 3);
    }

    #[test]
    fn ring_buffer_caps_at_5() {
        let reg = LineHealthRegistry::new();
        for ms in [10_000u64, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000] {
            push(&reg, "line1", ms, true);
        }
        let snap = reg.snapshot();
        assert_eq!(snap.lines["line1"].sample_count, 5);
    }
}
