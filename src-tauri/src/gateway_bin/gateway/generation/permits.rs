use super::*;

pub(crate) struct GenerationPermit {
    pub(crate) _permit: Option<QueuedGenerationPermit>,
    pub(crate) line: ImageApiLine,
}

impl Drop for GenerationPermit {
    fn drop(&mut self) {
        self._permit.take();
    }
}

pub(crate) async fn acquire_generation_permit(
    state: &AppState,
    size: &str,
    user_id: &str,
    exclude: &HashSet<String>,
) -> Result<GenerationPermit, GatewayError> {
    acquire_auto_generation_permit(state, size, user_id, exclude).await
}

pub(crate) async fn acquire_auto_generation_permit(
    state: &AppState,
    size: &str,
    user_id: &str,
    exclude: &HashSet<String>,
) -> Result<GenerationPermit, GatewayError> {
    // 桌面端余额监控发现余额为 0 时会调 /api/admin/line-pause 把线路加入 paused，
    // 这里把 paused 合并到本次 retry 的 exclude，自动路由就不会再考虑它们。
    let mut effective_exclude = exclude.clone();
    for paused in state.pause_state.paused_set() {
        effective_exclude.insert(paused);
    }
    let queued = state
        .generation_queue
        .acquire_auto_for_user_excluding(user_id, size, effective_exclude)
        .await
        .map_err(GatewayError::too_many_requests)?;
    let line = queued.line().to_string();
    Ok(GenerationPermit {
        _permit: Some(queued),
        line: ImageApiLine::from_str(&line).ok_or_else(|| {
            GatewayError::bad_gateway(format!("网关自动分配到了未知线路：{line}"))
        })?,
    })
}

pub(crate) fn build_generation_limiter() -> GatewayLimiter {
    GatewayLimiter::new(
        read_limit_env("GATEWAY_GENERATION_GLOBAL_LIMIT", 30),
        HashMap::from([
            ("line2", read_limit_env("GATEWAY_GENERATION_LINE2_LIMIT", 6)),
            ("line3", read_limit_env("GATEWAY_GENERATION_LINE3_LIMIT", 6)),
            ("line4", read_limit_env("GATEWAY_GENERATION_LINE4_LIMIT", 6)),
            // line5 = apimart，性价比高、最稳，并发 = 8
            ("line5", read_limit_env("GATEWAY_GENERATION_LINE5_LIMIT", 8)),
            // line6 = manxiaobai，当前主力线路之一，并发 = 8
            ("line6", read_limit_env("GATEWAY_GENERATION_LINE6_LIMIT", 8)),
            // line7 = novaeworld，OpenAI 兼容线路，并发 = 6
            ("line7", read_limit_env("GATEWAY_GENERATION_LINE7_LIMIT", 6)),
        ]),
    )
}

pub(crate) fn read_limit_env(name: &str, default: usize) -> usize {
    env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(default)
}

pub(crate) fn read_positive_limit_env(name: &str, default: usize) -> usize {
    read_limit_env(name, default).max(1)
}

pub(crate) fn is_quota_exhausted_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("insufficient_user_quota")
        || lower.contains("insufficient balance")
        || lower.contains("insufficient_quota")
        || error.contains("预扣费额度失败")
        || error.contains("用户剩余额度")
}
