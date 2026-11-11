use super::*;

pub(crate) async fn generate_image_for_gateway(
    state: &AppState,
    req: &api::GenerateRequest,
    archive_req: Option<&ArchiveGeneratedImageRequest>,
    user_id: &str,
) -> Result<GeneratedImageOutcome, String> {
    if req.api_line != ImageApiLine::Line5 || archive_req.and_then(history_metadata).is_none() {
        let image = api::generate_image(req.clone()).await?;
        return Ok(GeneratedImageOutcome {
            image,
            apimart_task_id: None,
            _task_claim: None,
        });
    }

    api_validation::validate_generate_request(req)?;
    let provider = resolve_image_provider(req.api_line);
    log_gateway_generate_request(req, provider.log_label);
    let api_key = env_config::read_required_env(provider.api_key_env_keys)?;
    let client = http_client::build_api_client("image-2")?;
    reference_image::log_reference_image_diagnostics(&client, &req.product_images).await;

    let archive_req = archive_req.expect("checked above");
    let (shop_name, platform) = history_metadata(archive_req).expect("checked above");
    let store = Arc::clone(&state.apimart_tasks);
    let user_id = user_id.to_string();
    let asset_kind = archive_req.asset_kind.clone();
    let product_name = normalize_optional_product_name(archive_req.product_name.as_deref());
    let file_name_stem = archive_req.file_name_stem.clone();
    let started_at_ms = chrono::Utc::now().timestamp_millis();

    let generation_line = req.api_line.as_str().to_string();
    let task_claim = Arc::new(std::sync::Mutex::new(None));
    let remembered_claim = Arc::clone(&task_claim);
    let remember = move |task_id| {
        let store = Arc::clone(&store);
        let task = PendingApimartTask {
            task_id,
            user_id,
            shop_name,
            product_name,
            asset_kind,
            platform,
            file_name_stem,
            generation_line,
            started_at_ms,
            archive: None,
        };
        async move {
            let claim = store.try_claim(&task.task_id).ok_or("上游任务已提交，但该任务正在处理中")?;
            remember_apimart_task(store, task).await
                .map_err(|error| format!("上游任务已提交，保存恢复记录失败：{error}"))?;
            *remembered_claim.lock().expect("task claim lock poisoned") = Some(claim);
            Ok(())
        }
    };
    let (image, task_id) = apimart::generate_apimart_image_with_task_hook(
        &client,
        provider.api_url,
        &api_key,
        provider.model,
        &req.prompt,
        &req.size,
        &req.product_images,
        remember,
    )
    .await.map_err(|error| {
        if task_claim.lock().expect("task claim lock poisoned").is_some() {
            format!("上游任务已提交，等待恢复处理：{error}")
        } else { error }
    })?;
    let download_msg = "下载线路5 APIMart远端图片失败";
    let image = reference_image::download_image_if_url(&client, image, download_msg).await?;

    let claim = task_claim.lock().expect("task claim lock poisoned").take();
    Ok(GeneratedImageOutcome {
        image,
        apimart_task_id: Some(task_id),
        _task_claim: claim,
    })
}

pub(crate) async fn remember_apimart_task(
    store: Arc<ApimartTaskStore>,
    task: PendingApimartTask,
) -> Result<(), String> {
    let task_id = task.task_id.clone();
    store.insert(task).await?;
    eprintln!("[apimart-recovery] remembered task_id={task_id}");
    Ok(())
}
