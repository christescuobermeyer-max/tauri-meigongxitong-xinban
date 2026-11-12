use super::*;

pub(super) fn start(state: AppState) {
    // Two loops; atomic DB leases also protect multi-process deployments.
    if state.supabase_service_role_key.is_none() {
        return;
    }
    for _ in 0..2 {
        let state = state.clone();
        tokio::spawn(async move {
            let worker = uuid::Uuid::new_v4().to_string();
            loop {
                let claimed = store::request(
                    &state,
                    reqwest::Method::POST,
                    "rpc/claim_product_animation",
                    Some(json!({"p_worker":worker,"p_allow_new":enabled()})),
                )
                .await;
                if let Ok(value) = claimed {
                    if let Some(row) = value.as_array().and_then(|rows| rows.first()) {
                        if let Ok(job) = serde_json::from_value::<Job>(row.clone()) {
                            if let Err(error) = process(&state, &worker, &job).await {
                                let status = if job.upstream_id.is_some() {
                                    "running"
                                } else {
                                    "reconciling"
                                };
                                let _=store::update(&state,&job,&worker,json!({"status":status,"error":error,"lease_until":(chrono::Utc::now()+chrono::Duration::seconds(15)).to_rfc3339()})).await;
                            }
                        }
                    }
                }
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        });
    }
}
async fn process(state: &AppState, worker: &str, job: &Job) -> Result<(), String> {
    let key = provider::key()?;
    let hash = provider::key_hash(&key);
    if job.credential_hash.as_ref().is_some_and(|old| old != &hash) {
        return Err("线路凭据已轮换，需恢复原凭据后查询；请勿再次生成".into());
    }
    let mut job = job.clone();
    if job.upstream_id.is_none() {
        if job.status != "submitting" {
            return Err("缺少上游任务ID，请管理员核对".into());
        }
        let exclude =
            HashSet::from(["line2", "line3", "line4", "line5", "line6"].map(str::to_string));
        if state.pause_state.paused_set().contains("line7") {
            return Err("线路7已暂停，任务未自动重提".into());
        }
        let permit = state
            .generation_queue
            .acquire_auto_for_user_excluding(&job.user_id, "1024x1024", exclude)
            .await?;
        if permit.line() != "line7" {
            return Err("未获得图生动图线路".into());
        }
        let source_url = oss::animation_download_url(&job.source_key)?;
        let (source, _) =
            reference_image::download::download(&source_url, Duration::from_secs(60)).await?;
        validate_source(&source, &job.spec)?;
        store::update(state, &job, worker, json!({"credential_hash":hash})).await?;
        match provider::submit(state, &key, source, &job.spec).await {
            Ok(id) => {
                // Persist before polling. A failure here stays ambiguous, never resubmits.
                store::update(
                    state,
                    &job,
                    worker,
                    json!({"upstream_id":id,"status":"running","error":null}),
                )
                .await?;
                job.upstream_id = Some(id);
            }
            Err(_) => {
                store::update(
                    state,
                    &job,
                    worker,
                    json!({"status":"reconciling","error":"上游提交状态待核对，请勿重复生成"}),
                )
                .await?;
                return Ok(());
            }
        }
        // Hold the shared line permit throughout this job's normal polling lifecycle.
        let result = poll_until_finished(state, worker, &job, &key).await;
        drop(permit);
        return result;
    }
    let exclude = HashSet::from(["line2", "line3", "line4", "line5", "line6"].map(str::to_string));
    let _permit = state
        .generation_queue
        .acquire_auto_for_user_excluding(&job.user_id, "1024x1024", exclude)
        .await?;
    poll_until_finished(state, worker, &job, &key).await
}
async fn poll_until_finished(
    state: &AppState,
    worker: &str,
    job: &Job,
    key: &str,
) -> Result<(), String> {
    let id = job.upstream_id.as_deref().ok_or("任务ID缺失")?;
    let started = Instant::now();
    loop {
        // Release lease after a bounded window; the worker resumes the same upstream task.
        if started.elapsed() > Duration::from_secs(240) {
            return Err("模型仍在处理，稍后继续查询同一任务".into());
        }
        store::update(state, job, worker, json!({"status":"running","error":null})).await?;
        let value = provider::poll(state, key, id).await?;
        match value["status"].as_str().unwrap_or("") {
            "queued" | "in_progress" => tokio::time::sleep(Duration::from_secs(3)).await,
            "failed" => {
                store::update(
                    state,
                    job,
                    worker,
                    json!({"status":"failed","error":provider::failure_message(&value)}),
                )
                .await?;
                return Ok(());
            }
            "completed" => {
                let url = provider::completed_url(&value)?;
                store::update(state, job, worker, json!({"status":"processing"})).await?;
                let (bytes, _) =
                    reference_image::download::download(&url, Duration::from_secs(90)).await?;
                let original = bytes.clone();
                let spec = job.spec.clone();
                let directory = std::env::temp_dir().join(format!(
                    "csgh-animation-{}-{}",
                    job.id,
                    uuid::Uuid::new_v4()
                ));
                let binary = PathBuf::from(
                    env::var("PRODUCT_ANIMATION_FFMPEG").unwrap_or_else(|_| "ffmpeg".into()),
                );
                let output = tokio::task::spawn_blocking(move || {
                    let result = crate::product_animation::model::export_model_gif(
                        &bytes, &spec, &directory, &binary,
                    );
                    let _ = std::fs::remove_dir_all(directory);
                    result
                })
                .await
                .map_err(|_| "动图处理进程失败")?;
                let output = match output {
                    Ok(value) => value,
                    Err(error) => {
                        store::update(state, job, worker, json!({"status":"failed","error":error}))
                            .await?;
                        return Ok(());
                    }
                };
                let original_key = oss::put_animation_object(
                    &job.user_id,
                    &job.id,
                    "original.gif",
                    &original,
                    "image/gif",
                )
                .await?;
                let mime = if job.spec.format == "gif" {
                    "image/gif"
                } else {
                    "image/webp"
                };
                let result_key = oss::put_animation_object(
                    &job.user_id,
                    &job.id,
                    &format!("result.{}", job.spec.format),
                    &output.bytes,
                    mime,
                )
                .await?;
                let poster_key = oss::put_animation_object(
                    &job.user_id,
                    &job.id,
                    "poster.jpg",
                    &output.poster,
                    "image/jpeg",
                )
                .await?;
                let result = StoredResult {
                    original_key,
                    result_key,
                    poster_key,
                    media: output.media,
                    source_media: output.source_media,
                    sha256: digest(&output.bytes),
                };
                store::update(
                    state,
                    job,
                    worker,
                    json!({"status":"succeeded","result":result,"error":null}),
                )
                .await?;
                return Ok(());
            }
            _ => return Err("上游返回未知状态，保留任务等待核对".into()),
        }
    }
}
