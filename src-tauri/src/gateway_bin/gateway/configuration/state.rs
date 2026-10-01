use super::*;

pub(crate) fn build_state() -> Result<AppState, String> {
    let supabase_url = env_config::read_required_env(&["SUPABASE_URL", "VITE_SUPABASE_URL"])?
        .trim_end_matches('/')
        .to_string();
    let supabase_anon_key =
        env_config::read_required_env(&["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"])?;
    let supabase_service_role_key =
        env_config::read_required_env(&["SUPABASE_SERVICE_ROLE_KEY"]).ok();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(350))
        .build()
        .map_err(|error| format!("初始化后端网关 HTTP 客户端失败：{error}"))?;

    let line_health = Arc::new(LineHealthRegistry::new());

    // 线路暂停状态文件路径：默认 /opt/csgh-gateway/state/paused-lines.json
    // 可通过 GATEWAY_STATE_DIR 覆盖；未设置且默认目录不可写时退化为"仅内存"（进程重启状态丢）
    let pause_persist_path = pause_state_persist_path()?;
    let pause_state = Arc::new(PauseStateRegistry::new(pause_persist_path));
    let apimart_tasks = Arc::new(ApimartTaskStore::new(apimart_task_store_path()?));

    Ok(AppState {
        client,
        supabase_url,
        supabase_anon_key,
        supabase_service_role_key,
        line_health: Arc::clone(&line_health),
        generation_queue: Arc::new(GatewayGenerationQueue::new(
            build_generation_limiter(),
            line_health,
            read_limit_env("GATEWAY_GENERATION_USER_LIMIT", 5),
        )),
        // 压缩 + OSS PUT 比生图轻得多（每张 < 2s），
        // 生图全局并发 30，归档要跟得上才不会成为瓶颈，默认开到 6。
        oss_archive_limiter: Arc::new(Semaphore::new(read_positive_limit_env(
            "GATEWAY_OSS_ARCHIVE_LIMIT",
            6,
        ))),
        pause_state,
        apimart_tasks,
        prompt_templates: Arc::new(prompt_templates::PromptTemplateStore::from_env()),
    })
}

pub(crate) fn pause_state_persist_path() -> Result<Option<PathBuf>, String> {
    gateway_state_file_path("paused-lines.json")
}

pub(crate) fn apimart_task_store_path() -> Result<Option<PathBuf>, String> {
    gateway_state_file_path("apimart-pending-tasks.json")
}

pub(crate) fn gateway_state_file_path(file_name: &str) -> Result<Option<PathBuf>, String> {
    let configured = env::var("GATEWAY_STATE_DIR").ok();
    if configured.as_ref().is_some_and(|dir| dir.trim().is_empty()) {
        return Err("GATEWAY_STATE_DIR 不能为空".to_string());
    }
    let dir = PathBuf::from(configured.as_deref().unwrap_or("/opt/csgh-gateway/state"));
    prepare_state_file_path(&dir, file_name, configured.is_some())
}

pub(crate) fn prepare_state_file_path(
    dir: &Path,
    file_name: &str,
    explicitly_configured: bool,
) -> Result<Option<PathBuf>, String> {
    let path = dir.join(file_name);
    let probe = dir.join(format!(".write-probe-{}", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        use std::io::Write;
        std::fs::create_dir_all(dir)?;
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&probe)?;
        file.write_all(b"gateway-state-write-probe")?;
        file.sync_all()?;
        drop(file);
        std::fs::remove_file(&probe)?;
        if path.exists() {
            // 检查现存状态文件，避免目录可写但状态文件只读时误报持久化可用。
            std::fs::OpenOptions::new().write(true).open(&path)?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&probe);
        let message = format!("网关状态目录或文件不可写 {}：{error}", path.display());
        if explicitly_configured {
            return Err(message);
        }
        eprintln!("[gateway-state] {message}；已降级为仅内存，暂停状态或待恢复任务会在重启后丢失");
        return Ok(None);
    }
    Ok(Some(path))
}

pub(crate) fn gateway_addr() -> Result<SocketAddr, String> {
    let host = env::var("BACKEND_GATEWAY_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("BACKEND_GATEWAY_PORT").unwrap_or_else(|_| "8787".to_string());
    format!("{host}:{port}")
        .parse()
        .map_err(|error| format!("后端网关监听地址不合法：{error}"))
}
