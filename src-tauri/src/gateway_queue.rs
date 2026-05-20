use crate::gateway_limiter::GatewayLimiter;
use crate::line_health::{LineHealthRegistry, LineHealthSnapshot};
use std::collections::{HashMap, VecDeque};
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
}

#[derive(Debug, Clone)]
enum QueueRequest {
    Auto { size: String },
    Line { line: String },
}

pub struct QueuedGenerationPermit {
    queue: Arc<GatewayGenerationQueue>,
    line: String,
    user_id: String,
}

impl GatewayGenerationQueue {
    pub fn new(
        limiter: GatewayLimiter,
        line_health: Arc<LineHealthRegistry>,
        user_limit: usize,
    ) -> Self {
        Self {
            inner: Mutex::new(QueueState {
                limiter,
                user_limit,
                active_by_user: HashMap::new(),
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
        self.acquire_auto_for_user("anonymous", size).await
    }

    pub async fn acquire_auto_for_user(
        self: &Arc<Self>,
        user_id: &str,
        size: &str,
    ) -> Result<QueuedGenerationPermit, String> {
        self.acquire(
            QueueRequest::Auto {
                size: size.to_string(),
            },
            user_id,
        )
        .await
    }

    pub async fn acquire_line(
        self: &Arc<Self>,
        line: &str,
    ) -> Result<QueuedGenerationPermit, String> {
        self.acquire_line_for_user("anonymous", line).await
    }

    pub async fn acquire_line_for_user(
        self: &Arc<Self>,
        user_id: &str,
        line: &str,
    ) -> Result<QueuedGenerationPermit, String> {
        self.acquire(
            QueueRequest::Line {
                line: line.to_string(),
            },
            user_id,
        )
        .await
    }

    async fn acquire(
        self: &Arc<Self>,
        request: QueueRequest,
        user_id: &str,
    ) -> Result<QueuedGenerationPermit, String> {
        let user_id = normalize_user_id(user_id);
        let ticket_id = {
            let mut state = self
                .inner
                .lock()
                .expect("gateway generation queue mutex poisoned");
            let health = self.line_health.snapshot();
            if state.user_limit == 0 {
                return Err("当前账号生图队列已暂停，请稍后再试".to_string());
            }
            if !request.can_ever_run(&state.limiter, &health) {
                return Err(request.unavailable_message());
            }

            let ticket_id = state.next_ticket;
            state.next_ticket = state.next_ticket.saturating_add(1);
            state.waiting.push_back(QueueTicket {
                id: ticket_id,
                user_id: user_id.clone(),
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
                        user_id,
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
        let own_position = match state
            .waiting
            .iter()
            .position(|ticket| ticket.id == ticket_id)
        {
            Some(position) => position,
            None => return Ok(None),
        };
        let own_request = state.waiting[own_position].request.clone();
        let health = self.line_health.snapshot();
        if !own_request.can_ever_run(&state.limiter, &health) {
            state.waiting.remove(own_position);
            drop(state);
            self.notify.notify_waiters();
            return Err(own_request.unavailable_message());
        }

        let selected_ticket_id = state
            .waiting
            .iter()
            .find(|ticket| {
                ticket.can_acquire(
                    &state.limiter,
                    &health,
                    state.user_limit,
                    &state.active_by_user,
                )
            })
            .map(|ticket| ticket.id);

        if selected_ticket_id != Some(ticket_id) {
            return Ok(None);
        }

        let ticket = state
            .waiting
            .get(own_position)
            .expect("own waiting ticket should still exist");
        let request = ticket.request.clone();
        let user_id = ticket.user_id.clone();

        let acquired_line = match request {
            QueueRequest::Auto { size } => {
                if !state.limiter.has_auto_candidate(&size, &health) {
                    state.waiting.remove(own_position);
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
                    state.waiting.remove(own_position);
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

        state.waiting.remove(own_position);
        let active_user = state.active_by_user.get(&user_id).copied().unwrap_or(0);
        state
            .active_by_user
            .insert(user_id, active_user.saturating_add(1));
        self.notify.notify_waiters();
        Ok(Some(acquired_line))
    }

    fn release(&self, line: &str, user_id: &str) {
        let mut state = self
            .inner
            .lock()
            .expect("gateway generation queue mutex poisoned");
        state.limiter.release(line);
        let active_user = state.active_by_user.get(user_id).copied().unwrap_or(0);
        if active_user <= 1 {
            state.active_by_user.remove(user_id);
        } else {
            state
                .active_by_user
                .insert(user_id.to_string(), active_user - 1);
        }
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
        self.queue.release(&self.line, &self.user_id);
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
            QueueRequest::Auto { size } => {
                limiter.has_global_capacity()
                    && limiter.select_generation_line(size, health).is_some()
            }
            QueueRequest::Line { line } => limiter.can_acquire_line(line),
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
            3,
        ))
    }

    fn queue_with_lines(
        global_limit: usize,
        health: Arc<LineHealthRegistry>,
        user_limit: usize,
    ) -> Arc<GatewayGenerationQueue> {
        Arc::new(GatewayGenerationQueue::new(
            GatewayLimiter::new(global_limit, HashMap::from([("line2", 1), ("line3", 1)])),
            health,
            user_limit,
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
        let queue = queue_with_lines(1, Arc::clone(&health), 3);
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

    #[tokio::test]
    async fn lets_other_users_run_when_front_user_is_at_limit() {
        let health = Arc::new(LineHealthRegistry::new());
        let queue = queue_with_lines(2, Arc::clone(&health), 1);
        let occupied_by_a = queue
            .acquire_auto_for_user("user-a", "1024x1024")
            .await
            .expect("user-a should occupy one user slot");

        let second_a = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto_for_user("user-a", "1024x1024").await })
        };
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert!(!second_a.is_finished());

        let first_b = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto_for_user("user-b", "1024x1024").await })
        };
        let b_permit = tokio::time::timeout(Duration::from_secs(1), first_b)
            .await
            .expect("user-b should not be blocked by user-a's queued request")
            .expect("user-b task should not panic")
            .expect("user-b should acquire capacity");
        assert!(!second_a.is_finished());

        drop(occupied_by_a);
        let a_permit = tokio::time::timeout(Duration::from_secs(1), second_a)
            .await
            .expect("user-a queued request should run after user-a releases")
            .expect("user-a task should not panic")
            .expect("user-a second request should acquire capacity");

        drop(b_permit);
        drop(a_permit);
    }

    #[tokio::test]
    async fn enforces_configured_user_limit() {
        let health = Arc::new(LineHealthRegistry::new());
        let queue = Arc::new(GatewayGenerationQueue::new(
            GatewayLimiter::new(4, HashMap::from([("line2", 4), ("line3", 4)])),
            health,
            3,
        ));

        let a1 = queue
            .acquire_auto_for_user("user-a", "1024x1024")
            .await
            .expect("first user-a request should run");
        let a2 = queue
            .acquire_auto_for_user("user-a", "1024x1024")
            .await
            .expect("second user-a request should run");
        let a3 = queue
            .acquire_auto_for_user("user-a", "1024x1024")
            .await
            .expect("third user-a request should run");

        let fourth_a = {
            let queue = Arc::clone(&queue);
            tokio::spawn(async move { queue.acquire_auto_for_user("user-a", "1024x1024").await })
        };
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert!(!fourth_a.is_finished());

        let b1 = queue
            .acquire_auto_for_user("user-b", "1024x1024")
            .await
            .expect("another user should use remaining global capacity");

        drop(a1);
        let a4 = tokio::time::timeout(Duration::from_secs(1), fourth_a)
            .await
            .expect("fourth user-a request should run after a user-a release")
            .expect("fourth user-a task should not panic")
            .expect("fourth user-a request should acquire capacity");

        drop(a2);
        drop(a3);
        drop(a4);
        drop(b1);
    }
}
