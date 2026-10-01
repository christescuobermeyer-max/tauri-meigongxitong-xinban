use super::*;

impl GatewayGenerationQueue {
    /// 拍下网关当前的运行快照（限流器 + 用户活跃数 + 等待队列）。
    /// 监控端点 /api/admin/gateway-stats 实时拉取这个数据。
    pub fn snapshot(&self) -> GatewayQueueSnapshot {
        let state = self
            .inner
            .lock()
            .expect("gateway generation queue mutex poisoned");
        let now = Instant::now();
        let waiting = state
            .waiting
            .iter()
            .map(|ticket| {
                let waited_ms = now
                    .checked_duration_since(ticket.enqueued_at)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                let (kind, detail, excluded_lines) = match &ticket.request {
                    QueueRequest::Auto { size, exclude } => {
                        let mut excl: Vec<String> = exclude.iter().cloned().collect();
                        excl.sort();
                        ("auto".to_string(), size.clone(), excl)
                    }
                };
                WaitingTicketSnapshot {
                    ticket_id: ticket.id,
                    user_id: ticket.user_id.clone(),
                    kind,
                    detail,
                    excluded_lines,
                    waited_ms,
                }
            })
            .collect();
        let line_snapshots = state
            .limiter
            .line_snapshots()
            .into_iter()
            .map(|(line, limit, active)| LineLimiterSnapshot {
                line: line.to_string(),
                limit,
                active,
            })
            .collect();
        let active_by_user: HashMap<String, usize> = state.active_by_user.clone();
        GatewayQueueSnapshot {
            global_limit: state.limiter.global_limit(),
            global_active: state.limiter.active_global(),
            user_limit: state.user_limit,
            lines: line_snapshots,
            active_by_user,
            waiting,
        }
    }

}

#[derive(Debug, Serialize)]
pub struct GatewayQueueSnapshot {
    pub global_limit: usize,
    pub global_active: usize,
    pub user_limit: usize,
    pub lines: Vec<LineLimiterSnapshot>,
    /// 每个用户当前正在跑的任务数（不含队列里等待的）
    pub active_by_user: HashMap<String, usize>,
    /// 当前在 FIFO 队列里等待 acquire 的 ticket
    pub waiting: Vec<WaitingTicketSnapshot>,
}

#[derive(Debug, Serialize)]
pub struct LineLimiterSnapshot {
    pub line: String,
    pub limit: usize,
    pub active: usize,
}

#[derive(Debug, Serialize)]
pub struct WaitingTicketSnapshot {
    pub ticket_id: u64,
    pub user_id: String,
    /// "auto" 或 "line"
    pub kind: String,
    /// auto 模式是 size 字符串；line 模式是线路名
    pub detail: String,
    /// 本次请求 retry 时已经试过、需排除的线路（auto 模式才有）
    pub excluded_lines: Vec<String>,
    pub waited_ms: u64,
}
