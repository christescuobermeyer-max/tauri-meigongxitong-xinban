use crate::line_health::{LineHealthSnapshot, LineHealthStatus};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};

const AUTO_GENERATION_LINES: [&str; 6] = ["line2", "line3", "line4", "line5", "line6", "line7"];

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

#[path = "gateway_limiter/capacity.rs"]
mod capacity;
#[path = "gateway_limiter/routing.rs"]
mod routing;
#[path = "gateway_limiter/sizes.rs"]
mod sizes;
pub use sizes::{generation_size_for_line, supports_generation_size};

#[cfg(test)]
#[path = "gateway_limiter/tests.rs"]
mod tests;
