use super::*;

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub async fn brand_story_generate_text(
    req: BrandStoryTextRequestInput,
) -> Result<BrandCopy, String> {
    validate_text_request(&req)?;

    let definition = lookup_definition(req.thread_id);
    let env = thread_runtime_env(definition.id);
    let api_key = read_required_env(env.text_key_envs)?;
    let base_url = resolve_base_url(&env);

    let system_prompt = compose_system_prompt();
    let request = build_text_request(
        definition.protocol,
        &base_url,
        definition.text_model,
        &api_key,
        req.store_name.trim(),
        req.category.trim(),
        &system_prompt,
    );

    let client = build_api_client("brand-story-text")?;
    let mut builder = client.post(&request.url);
    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }
    let response = builder.json(&request.body).send().await.map_err(|error| {
        format!(
            "{} 文案接口请求失败：{}",
            definition.name,
            format_reqwest_error(&error)
        )
    })?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取 {} 响应失败：{error}", definition.name))?;

    if !status.is_success() {
        return Err(format!(
            "{} 接口返回 {}：{}",
            definition.name,
            status,
            truncate(&body, 400)
        ));
    }

    let raw_text = extract_text_from_response(definition.protocol, &body).map_err(|error| {
        format!(
            "{} 解析响应失败：{error}；原始响应：{}",
            definition.name,
            truncate(&body, 240)
        )
    })?;

    parse_brand_copy(&raw_text).map_err(|error| {
        format!(
            "{} 文案 JSON 解析失败：{error}；原始内容：{}",
            definition.name,
            truncate(&raw_text, 240)
        )
    })
}

#[cfg_attr(feature = "tauri-commands", tauri::command)]
pub fn brand_story_thread_availability() -> BrandStoryThreadAvailability {
    BrandStoryThreadAvailability {
        thread1: availability_for(BrandStoryThreadId::Thread1),
        thread2: availability_for(BrandStoryThreadId::Thread2),
        thread3: availability_for(BrandStoryThreadId::Thread3),
        thread4: availability_for(BrandStoryThreadId::Thread4),
    }
}

pub(super) fn availability_for(id: BrandStoryThreadId) -> BrandStoryThreadAvailabilityItem {
    let definition = lookup_definition(id);
    let env = thread_runtime_env(id);
    let available = read_required_env(env.text_key_envs).is_ok();
    BrandStoryThreadAvailabilityItem {
        available,
        name: definition.name,
        description: definition.description,
    }
}

pub(super) fn lookup_definition(id: BrandStoryThreadId) -> BrandStoryThreadDefinition {
    BRAND_STORY_THREAD_DEFINITIONS
        .iter()
        .copied()
        .find(|item| item.id == id)
        .unwrap_or(BRAND_STORY_THREAD_DEFINITIONS[0])
}
