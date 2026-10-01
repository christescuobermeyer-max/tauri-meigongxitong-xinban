use crate::gateway_limiter::GatewayLimiter;
use crate::line_health::{LineHealthRegistry, LineHealthSnapshot};
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::Notify;

pub struct GatewayGenerationQueue {
    inner: Mutex<QueueState>,
    notify: Notify,
    line_health: Arc<LineHealthRegistry>,
}

#[derive(Debug)]
struct QueueState {
    limiter: GatewayLimiter,
    user_limit: usize,
    active_by_user: HashMap<String, usize>,
    next_ticket: u64,
    waiting: VecDeque<QueueTicket>,
}

#[derive(Debug)]
struct QueueTicket {
    id: u64,
    user_id: String,
    request: QueueRequest,
    enqueued_at: Instant,
}

#[derive(Debug, Clone)]
enum QueueRequest {
    /// `exclude` 列出本次请求已经试过且失败的线路，自动路由会跳过它们
    Auto {
        size: String,
        exclude: HashSet<String>,
    },
}

pub struct QueuedGenerationPermit {
    queue: Arc<GatewayGenerationQueue>,
    line: String,
    user_id: String,
}


#[path = "gateway_queue/acquisition.rs"]
mod acquisition;
#[path = "gateway_queue/scheduling.rs"]
mod scheduling;
#[path = "gateway_queue/snapshot.rs"]
mod snapshot;
pub use snapshot::{GatewayQueueSnapshot, LineLimiterSnapshot, WaitingTicketSnapshot};

impl QueuedGenerationPermit {
    pub fn line(&self) -> &str {
        &self.line
    }
}

impl Drop for QueuedGenerationPermit {
    fn drop(&mut self) {
        self.queue.release(&self.line, &self.user_id);
    }
}

/// 网关运行时快照，由 `/api/admin/gateway-stats` 端点返回给后台监控面板。
struct WaitingTicketGuard {
    queue: Arc<GatewayGenerationQueue>,
    ticket_id: u64,
    active: bool,
}

impl WaitingTicketGuard {
    fn new(queue: Arc<GatewayGenerationQueue>, ticket_id: u64) -> Self {
        Self {
            queue,
            ticket_id,
            active: true,
        }
    }

    fn dismiss(&mut self) {
        self.active = false;
    }
}

impl Drop for WaitingTicketGuard {
    fn drop(&mut self) {
        if self.active {
            self.queue.remove_waiting_ticket(self.ticket_id);
        }
    }
}

impl QueueRequest {
    fn can_ever_run(&self, limiter: &GatewayLimiter, health: &LineHealthSnapshot) -> bool {
        match self {
            QueueRequest::Auto { size, exclude } => {
                limiter.has_auto_candidate_excluding(size, health, exclude)
            }
        }
    }

    fn unavailable_message(&self) -> String {
        match self {
            QueueRequest::Auto { .. } => "当前没有可用生图线路，请稍后重新提交".to_string(),
        }
    }
}

impl QueueTicket {
    fn can_acquire(
        &self,
        limiter: &GatewayLimiter,
        health: &LineHealthSnapshot,
        user_limit: usize,
        active_by_user: &HashMap<String, usize>,
    ) -> bool {
        if user_limit == 0 {
            return false;
        }
        let active_user = active_by_user.get(&self.user_id).copied().unwrap_or(0);
        if active_user >= user_limit {
            return false;
        }
        match &self.request {
            QueueRequest::Auto { size, exclude } => {
                limiter.has_global_capacity()
                    && limiter
                        .select_generation_line_excluding(size, health, exclude)
                        .is_some()
            }
        }
    }
}

fn normalize_user_id(user_id: &str) -> String {
    let trimmed = user_id.trim();
    if trimmed.is_empty() {
        "anonymous".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
#[path = "gateway_queue/tests.rs"]
mod tests;
