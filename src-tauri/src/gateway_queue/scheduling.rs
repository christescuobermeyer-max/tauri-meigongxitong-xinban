use super::*;

impl GatewayGenerationQueue {
    pub(super) async fn try_acquire_front(&self, ticket_id: u64) -> Result<Option<String>, String> {
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
            QueueRequest::Auto { size, exclude } => {
                if !state
                    .limiter
                    .has_auto_candidate_excluding(&size, &health, &exclude)
                {
                    state.waiting.remove(own_position);
                    drop(state);
                    self.notify.notify_waiters();
                    return Err("当前没有可用生图线路，请稍后重新提交".to_string());
                }
                state
                    .limiter
                    .try_acquire_auto_excluding(&size, &health, &exclude)
                    .line
                    .map(str::to_string)
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

    pub(super) fn release(&self, line: &str, user_id: &str) {
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

    pub(super) fn remove_waiting_ticket(&self, ticket_id: u64) {
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
