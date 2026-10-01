use super::*;

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
}
