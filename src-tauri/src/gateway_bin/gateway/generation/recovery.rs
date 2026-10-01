use super::*;

pub(crate) const APIMART_RECOVERY_INTERVAL_SECS: u64 = 60;
pub(crate) const APIMART_RECOVERY_MIN_AGE_MS: i64 = 5 * 60 * 1000;

pub(crate) fn start_apimart_recovery_worker(state: AppState) {
    tokio::spawn(async move {
        loop {
            if let Err(error) = recover_pending_apimart_tasks(&state).await {
                eprintln!("[apimart-recovery] worker error: {error}");
            }
            tokio::time::sleep(Duration::from_secs(APIMART_RECOVERY_INTERVAL_SECS)).await;
        }
    });
}

pub(crate) async fn recover_pending_apimart_tasks(state: &AppState) -> Result<(), String> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let tasks = state
        .apimart_tasks
        .list()
        .await
        .into_iter()
        .filter(|task| now_ms.saturating_sub(task.started_at_ms) >= APIMART_RECOVERY_MIN_AGE_MS)
        .collect::<Vec<_>>();
    if tasks.is_empty() {
        return Ok(());
    }

    let client = http_client::build_api_client("image-2")?;
    eprintln!(
        "[apimart-recovery] scanning {} pending task(s)",
        tasks.len()
    );

    for task in tasks {
        let task_id = task.task_id.clone();
        let provider = resolve_image_provider(ImageApiLine::Line5);
        let api_key = env_config::read_required_env(provider.api_key_env_keys)?;
        match recover_apimart_task(state, &client, &api_key, task).await {
            Ok(()) => {
                if let Err(error) = state.apimart_tasks.remove(&task_id).await {
                    eprintln!(
                        "[apimart-recovery] remove recovered task failed task_id={task_id}: {error}"
                    );
                }
            }
            Err(error) => {
                eprintln!("[apimart-recovery] task_id={task_id} failed: {error}");
                if is_terminal_apimart_recovery_error(&error) {
                    if let Err(remove_error) = state.apimart_tasks.remove(&task_id).await {
                        eprintln!(
                            "[apimart-recovery] remove terminal task failed task_id={task_id}: {remove_error}"
                        );
                    }
                }
            }
        }
    }
    Ok(())
}

pub(crate) async fn recover_apimart_task(
    state: &AppState,
    client: &reqwest::Client,
    api_key: &str,
    task: PendingApimartTask,
) -> Result<(), String> {
    let image = apimart_task::poll_apimart_task(client, api_key, &task.task_id).await?;
    let download_msg = "恢复下载线路5 APIMart远端图片失败";
    let image = reference_image::download_image_if_url(client, image, download_msg).await?;
    let archive_req = ArchiveGeneratedImageRequest {
        asset_kind: task.asset_kind.clone(),
        file_name_stem: task.file_name_stem.clone(),
        shop_name: Some(task.shop_name.clone()),
        product_name: task.product_name.clone(),
        platform: Some(task.platform.clone()),
    };
    let archive = archive_generated_image(state, archive_req, &image).await?;
    let elapsed_ms = chrono::Utc::now()
        .timestamp_millis()
        .saturating_sub(task.started_at_ms)
        .max(0) as u64;
    record_generation_log_with_auth(
        state,
        None,
        &task.user_id,
        &task.shop_name,
        &task.asset_kind,
        task.product_name.as_deref(),
        &task.platform,
        &task.generation_line,
        &archive,
        elapsed_ms,
    )
    .await?;
    eprintln!(
        "[apimart-recovery] recovered task_id={} oss_key={}",
        task.task_id, archive.key
    );
    Ok(())
}

pub(crate) fn is_terminal_apimart_recovery_error(error: &str) -> bool {
    error.contains("线路5 APIMart任务失败")
        || error.contains("线路5 APIMart任务已完成但未找到图片")
        || error.contains("404")
}
