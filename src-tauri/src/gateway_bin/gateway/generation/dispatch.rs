use super::*;

pub(crate) const GENERATE_IMAGE_MAX_ATTEMPTS: usize = 6;
pub(crate) const ZIKL_SHARED_LINES: [&str; 3] = ["line2", "line3", "line4"];

pub(crate) fn exclude_shared_zikl_lines(tried_lines: &mut HashSet<String>, line: ImageApiLine) -> bool {
    if !matches!(
        line,
        ImageApiLine::Line2 | ImageApiLine::Line3 | ImageApiLine::Line4
    ) {
        return false;
    }

    for shared_line in ZIKL_SHARED_LINES {
        tried_lines.insert(shared_line.to_string());
    }
    true
}

pub(crate) async fn generate_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<GatewayGenerateImageRequest>,
) -> Result<Json<GenerateImageResponse>, GatewayError> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let token = bearer_token(&headers)?.to_string();
    let user_id = verify_access_token(&state, &headers).await?;
    validate_result_delivery_request(&req)?;
    let resolved_prompt = resolve_gateway_prompt(&state, &req)?;

    eprintln!(
        "[gateway] generate_image start request_id={} size={} image_count={}",
        request_id,
        req.size,
        req.product_images.len()
    );

    let original_size = req.size.clone();

    let mut tried_lines: HashSet<String> = HashSet::new();
    let mut last_error: Option<String> = None;
    let mut last_line: Option<String> = None;

    for attempt in 0..GENERATE_IMAGE_MAX_ATTEMPTS {
        let permit =
            match acquire_generation_permit(&state, &original_size, &user_id, &tried_lines).await {
                Ok(p) => p,
                Err(err) => {
                    // 拿不到 permit 通常意味着所有可用线路都尝试过/全 Red。
                    if attempt == 0 {
                        return Err(err);
                    }
                    break;
                }
            };

        let line = permit.line;
        let line_str = line.as_str().to_string();
        tried_lines.insert(line_str.clone());
        last_line = Some(line_str.clone());

        let mapped_size = match generation_size_for_line(line.as_str(), &original_size) {
            Some(s) => s.into_owned(),
            None => {
                return Err(GatewayError::bad_request(format!(
                    "{} 不支持尺寸：{}",
                    line.as_str(),
                    original_size
                )));
            }
        };
        let attempt_req = api::GenerateRequest {
            prompt: resolved_prompt.clone(),
            size: mapped_size,
            product_images: req.product_images.clone(),
            api_line: line,
        };

        eprintln!(
            "[gateway] generate_image dispatch request_id={} attempt={}/{} line={} size={}",
            request_id,
            attempt + 1,
            GENERATE_IMAGE_MAX_ATTEMPTS,
            line.as_str(),
            attempt_req.size
        );
        let started = Instant::now();
        let result =
            generate_image_for_gateway(&state, &attempt_req, req.archive.as_ref(), &user_id).await;
        let latency_ms = started.elapsed().as_millis() as u64;
        state
            .line_health
            .record(line.as_str(), latency_ms, result.is_ok());

        match result {
            Ok(generated) => {
                if attempt > 0 {
                    eprintln!(
                        "[gateway] generate_image succeeded request_id={} on {} after {} retry(ies)",
                        request_id,
                        line.as_str(),
                        attempt
                    );
                }
                drop(permit);
                let archive_result = if let Some(archive_req) = req.archive.as_ref() {
                    Some(
                        archive_generated_image(&state, archive_req.clone(), &generated.image)
                            .await,
                    )
                } else {
                    None
                };
                let mut history_recorded = None;
                let mut history_error = None;
                let (archive_url, archive_key, archive_error) = match archive_result {
                    Some(Ok(archive)) => {
                        if let Some(archive_req) = req.archive.as_ref() {
                            match record_generation_log(
                                &state,
                                &token,
                                &user_id,
                                archive_req,
                                line.as_str(),
                                &archive,
                                latency_ms,
                            )
                            .await
                            {
                                Ok(()) => {
                                    history_recorded = Some(true);
                                    if let Some(task_id) = generated.apimart_task_id.as_deref() {
                                        if let Err(error) =
                                            state.apimart_tasks.remove(task_id).await
                                        {
                                            eprintln!(
                                                "[apimart-recovery] remove completed task failed task_id={task_id}: {error}"
                                            );
                                        }
                                    }
                                }
                                Err(error) => {
                                    eprintln!(
                                        "[gateway] insert generation_log failed on {}: {}",
                                        line.as_str(),
                                        error
                                    );
                                    history_recorded = Some(false);
                                    history_error = Some(error);
                                }
                            }
                        }
                        (Some(archive.url), Some(archive.key), None)
                    }
                    Some(Err(error)) => {
                        eprintln!(
                            "[gateway] archive generated image failed request_id={} on {}: {}",
                            request_id,
                            line.as_str(),
                            error
                        );
                        (None, None, Some(error))
                    }
                    None => (None, None, None),
                };
                let delivered = select_result_delivery(
                    req.result_delivery,
                    generated.image,
                    archive_url.clone(),
                );
                return Ok(Json(GenerateImageResponse {
                    image: delivered.image,
                    image_url: delivered.image_url,
                    result_delivery: delivered.result_delivery,
                    generation_line: line_str,
                    archive_url,
                    archive_key,
                    archive_error,
                    history_recorded,
                    history_error,
                }));
            }
            Err(err) => {
                let ambiguous = http_client::is_ambiguous_upstream_error(&err);
                eprintln!(
                    "[gateway] generate_image attempt {}/{} failed request_id={} on {} ambiguous={}: {}",
                    attempt + 1,
                    GENERATE_IMAGE_MAX_ATTEMPTS,
                    request_id,
                    line.as_str(),
                    ambiguous,
                    err
                );
                if is_quota_exhausted_error(&err) {
                    let paused = state.pause_state.pause(
                        line.as_str().to_string(),
                        "upstream_quota_exhausted".to_string(),
                        "gateway_auto_pause".to_string(),
                    );
                    eprintln!(
                        "[gateway] auto-paused {} after upstream quota exhaustion: {}",
                        paused.line, err
                    );
                }
                if exclude_shared_zikl_lines(&mut tried_lines, line) {
                    eprintln!(
                        "[gateway] excluded shared Zikl lines line2,line3,line4 after {} failure",
                        line.as_str()
                    );
                }
                last_error = Some(err);
                // permit 在这里 drop，释放 slot；下一次循环会重新 acquire 排除已试过的线路。
                // 线路2/3/4共用一个 Zikl 上游，任一条失败后本次请求整体排除三条。
                if ambiguous {
                    eprintln!(
                        "[gateway] stop retries request_id={} because upstream result is ambiguous",
                        request_id
                    );
                    break;
                }
                continue;
            }
        }
    }

    let line_tag = last_line.unwrap_or_else(|| "(unknown)".to_string());
    let detail = last_error.unwrap_or_else(|| "no upstream error captured".to_string());
    Err(GatewayError::bad_gateway(format!(
        "生图失败：已尝试 {} 条线路均未成功，最后线路 {}：{}",
        tried_lines.len(),
        line_tag,
        detail
    )))
}
