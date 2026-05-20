use crate::gateway_limiter::GatewayLimiter;
use crate::line_health::{LineHealthRegistry, LineHealthSnapshot};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

pub struct GatewayGenerationQueue {
    inner: Mutex<QueueState>,
    notify: Notify,
    line_health: Arc<LineHealthRegistry>,
}

#[derive(Debug)]
struct QueueState {
    limiter: GatewayLimiter,
    next_ticket: u64,
    waiting: VecDeque<QueueTicket>,
}

#[derive(Debug)]
struct QueueTicket {
    id: u64,
    request: QueueRequest,
}

#[derive(Debug, Clone)]
enum QueueRequest {
    Auto { size: String },
    Line { line: String },
}

pub struct QueuedGenerationPermit {
    queue: Arc<GatewayGenerationQueue>,
    line: String,
}

impl GatewayGenerationQueue {
    pub fn new(limiter: GatewayLimiter, line_health: Arc<LineHealthRegistry>) -> Self {
        Self {
            inner: Mutex::new(QueueState {
                limiter,
                next_ticket: 0,
                waiting: VecDeque::new(),
            }),
            notify: Notify::new(),
            line_health,
        }
    }

    pub async fn acquire_auto(
        self: &Arc<Self>,
        size: &str,
    ) -> Result<QueuedGenerationPermit, String> {
        self.acquire(QueueRequest::Auto {
            size: size.to_string(),
        })
        .await
    }

    pub async fn acquire_line(
        self: &Arc<Self>,
        line: &str,
    ) -> Result<QueuedGenerationPermit, String> {
        self.acquire(QueueRequest::Line {
            line: line.to_string(),
        })
        .await
    }

    async fn acquire(
        self: &Arc<Self>,
        request: QueueRequest,
    ) -> Result<QueuedGenerationPermit, String> {
        let ticket_id = {
            let mut state = self
                .inner
                .lock()
                .expect("gateway generation queue mutex poisoned");
            let health = self.line_health.snapshot();
            if !request.can_ever_run(&state.limiter, &health) {
                return Err(request.unavailable_message());
            }

            let ticket_id = state.next_ticket;
            state.next_ticket = state.next_ticket.saturating_add(1);
            state.waiting.push_back(QueueTicket {
                id: ticket_id,
                request,
            });
            ticket_id
        };
        let mut ticket_guard = WaitingTicketGuard::new(Arc::clone(self), ticket_id);

        loop {
            let notified = self.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            match self.try_acquire_front(ticket_id).await {
                Ok(Some(line)) => {
                    ticket_guard.dismiss();
                    return Ok(QueuedGenerationPermit {
                        queue: Arc::clone(self),
                        line,
                    });
                }
                Ok(None) => {}
                Err(message) => {
                    ticket_guard.dismiss();
                    return Err(message);
                }
            }
            notified.as_mut().await;
        }
    }

    async fn try_acquire_front(&self, ticket_id: u64) -> Result<Option<String>, String> {
        let mut state = self
            .inner
            .lock()
            .expect("gateway generation queue mutex poisoned");
        let front = match state.waiting.front() {
            Some(front) => front,
            None => return Ok(None),
        };
        if front.id != ticket_id {
            return Ok(None);
        }
        let request = front.request.clone();

        let acquired_line = match request {
            QueueRequest::Auto { size } => {
                let health = self.line_health.snapshot();
                if !state.limiter.has_auto_candidate(&size, &health) {
                    state.waiting.pop_front();
                    drop(state);
                    self.notify.notify_waiters();
                    return Err("当前没有可用生图线路，请稍后重新提交".to_string());
                }
                state
                    .limiter
                    .try_acquire_auto(&size, &health)
                    .line
                    .map(str::to_string)
            }
            QueueRequest::Line { line } => {
                if !state.limiter.can_queue_line(&line) {
                    state.waiting.pop_front();
                    drop(state);
                    self.notify.notify_waiters();
                    return Err(format!("{line} 当前已暂停，请切换线路或稍后再试"));
                }
                if state.limiter.try_acquire(&line).allowed {
                    Some(line)
                } else {
                    None
                }
            }
        };
        let Some(acquired_line) = acquired_line else {
            return Ok(None);
        };

        state.waiting.pop_front();
        self.notify.notify_waiters();
        Ok(Some(acquired_line))
    }

    fn release(&self, line: &str) {
        let mut state = self
            .inner
            .lock()
            .expect("gateway generation queue mutex poisoned");
        state.limiter.release(line);
        drop(state);
        self.notify.notify_waiters();
    }

    fn remove_waiting_ticket(&self, ticket_id: u64) {
        let mut state = self
            .inner
            .lock()
            .expect("gateway generation queue mutex poisoned");
        if let Some(position) = state
            .waiting
            .iter()
            .position(|ticket| ticket.id == ticket_id)
        {
            state.waiting.remove(position);
        }
        drop(state);
        self.notify.notify_waiters();
    }
}

impl QueuedGenerationPermit {
    pub fn line(&self) -> &str {
        &self.line
    }
}

impl Drop for QueuedGenerationPermit {
    fn drop(&mut self) {
        self.queue.release(&self.line);
    }
}

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
            QueueRequest::Auto { size } => limiter.has_auto_candidate(size, health),
            QueueRequest::Line { line } => limiter.can_queue_line(line),
        }
    }

    fn unavailable_message(&self) -> String {
        match self {
            QueueRequest::Auto { .. } => "当前没有可用生图线路，请稍后重新提交".to_string(),
            QueueRequest::Line { line } => format!("{line} 当前已暂停，请切换线路或稍后再试"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::GatewayGenerationQueue;
    use crate::gateway_limiter::GatewayLimiter;
    use crate::line_health::LineHealthRegistry;
    use std::collections::HashMap;
    use std::sync::Arc;
    use std::time::Duration;

    fn test_queue(global_limit: usize) -> Arc<GatewayGenerationQueue> {
        let health = Arc::new(LineHealthRegistry::new());
        Arc::new(GatewayGenerationQueue::new(
            GatewayLimiter::new(global_limit, HashMap::from([("line1", 2), ("line2", 1)])),
            health,
        ))
    }

    fn queue_with_lines(
        global_limit: usize,
        health: Arc<LineHealthRegistry>,
    ) -> Arc<GatewayGenerationQueue> {
        Arc::new(GatewayGenerationQueue::new(
            GatewayLimiter::new(global_limit, HashMap::from([("line2", 1), ("line3", 1)])),
            health,
        ))
    }

    #[tokio::test]
    async fn waits_for_capacity_in_fifo_order_when_all_lines_are_full() {
        let queue = test_queue(1);
        let occupied = queue
            .acquire_auto("1024x1024")
            .await
            .expect("first request should occupy the only slot");

        let first_waiter = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
        };
        let second_waiter = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
        };

        tokio::time::sleep(Duration::from_millis(25)).await;
        assert!(!first_waiter.is_finished());
        assert!(!second_waiter.is_finished());

        drop(occupied);
        let first = tokio::time::timeout(Duration::from_secs(1), first_waiter)
            .await
            .expect("first waiter should be released first")
            .expect("first waiter task should not panic")
            .expect("first waiter should acquire a slot");
        assert!(!second_waiter.is_finished());

        drop(first);
        tokio::time::timeout(Duration::from_secs(1), second_waiter)
            .await
            .expect("second waiter should be released after the first permit drops")
            .expect("second waiter task should not panic")
            .expect("second waiter should acquire a slot");
    }

    #[tokio::test]
    async fn returns_immediately_when_no_compatible_line_can_ever_run_request() {
        let queue = test_queue(1);

        let result = queue.acquire_auto("unsupported-size").await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn removes_cancelled_waiter_so_later_requests_can_continue() {
        let queue = test_queue(1);
        let occupied = queue
            .acquire_auto("1024x1024")
            .await
            .expect("first request should occupy the only slot");
        let cancelled_waiter = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
        };

        tokio::time::sleep(Duration::from_millis(25)).await;
        cancelled_waiter.abort();
        let _ = cancelled_waiter.await;

        let next_waiter = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
        };
        drop(occupied);

        tokio::time::timeout(Duration::from_secs(1), next_waiter)
            .await
            .expect("later waiter should not be blocked by a cancelled ticket")
            .expect("later waiter task should not panic")
            .expect("later waiter should acquire a slot");
    }

    #[tokio::test]
    async fn queued_auto_request_rechecks_health_before_selecting_line() {
        let health = Arc::new(LineHealthRegistry::new());
        let queue = queue_with_lines(1, Arc::clone(&health));
        let occupied = queue
            .acquire_auto("1024x1024")
            .await
            .expect("first request should occupy the only slot");

        let waiter = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
        };
        tokio::time::sleep(Duration::from_millis(25)).await;

        for _ in 0..3 {
            health.record("line2", 0, false);
        }
        drop(occupied);

        let permit = tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("waiter should acquire a healthy line")
            .expect("waiter task should not panic")
            .expect("waiter should acquire a slot");
        assert_eq!(permit.line(), "line3");
    }
}
