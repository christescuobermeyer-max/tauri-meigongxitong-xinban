use super::*;

impl GatewayGenerationQueue {
    pub fn new(
        limiter: GatewayLimiter,
        line_health: Arc<LineHealthRegistry>,
        user_limit: usize,
    ) -> Self {
        Self::with_wait_limits(limiter, line_health, user_limit, 100, std::time::Duration::from_secs(120))
    }

    pub fn with_wait_limits(
        limiter: GatewayLimiter,
        line_health: Arc<LineHealthRegistry>,
        user_limit: usize,
        max_waiting: usize,
        wait_timeout: std::time::Duration,
    ) -> Self {
        Self {
            inner: Mutex::new(QueueState {
                limiter,
                user_limit,
                active_by_user: HashMap::new(),
                next_ticket: 0,
                waiting: VecDeque::new(),
                max_waiting: max_waiting.max(1),
            }),
            notify: Notify::new(),
            line_health,
            wait_timeout,
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
        self.acquire_auto_for_user_excluding(user_id, size, HashSet::new())
            .await
    }

    /// 与 acquire_auto_for_user 相同，但额外允许排除已经在本次重试中试过的线路。
    pub async fn acquire_auto_for_user_excluding(
        self: &Arc<Self>,
        user_id: &str,
        size: &str,
        exclude: HashSet<String>,
    ) -> Result<QueuedGenerationPermit, String> {
        self.acquire(
            QueueRequest::Auto {
                size: size.to_string(),
                exclude,
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

            if state.waiting.len() >= state.max_waiting {
                return Err("生图等待队列已满，请稍后提交".to_string());
            }
            if state.waiting.iter().filter(|ticket| ticket.user_id == user_id).count()
                >= state.user_limit.saturating_mul(2) {
                return Err("当前账号等待任务已满，请等待现有任务完成".to_string());
            }

            let ticket_id = state.next_ticket;
            state.next_ticket = state.next_ticket.saturating_add(1);
            state.waiting.push_back(QueueTicket {
                id: ticket_id,
                user_id: user_id.clone(),
                request,
                enqueued_at: Instant::now(),
            });
            ticket_id
        };
        let mut ticket_guard = WaitingTicketGuard::new(Arc::clone(self), ticket_id);
        let deadline = tokio::time::Instant::now() + self.wait_timeout;

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
            tokio::time::timeout_at(deadline, notified.as_mut()).await
                .map_err(|_| "排队等待超时，本次尚未提交上游，请稍后重试".to_string())?;
        }
    }
}
