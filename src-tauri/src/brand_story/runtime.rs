use super::*;

pub(super) fn thread_runtime_env(id: BrandStoryThreadId) -> ThreadRuntimeEnv {
    match id {
        BrandStoryThreadId::Thread1 => ThreadRuntimeEnv {
            base_url_keys: &["BRAND_STORY_THREAD1_BASE_URL", "API_BASE_URL"],
            base_url_default: "https://api.zhongzhuan.vip",
            text_key_envs: &[
                "BRAND_STORY_THREAD1_TEXT_API_KEY",
                "TEXT_API_KEY",
                "IMAGE_2_API_KEY",
            ],
        },
        BrandStoryThreadId::Thread2 => ThreadRuntimeEnv {
            base_url_keys: &["BRAND_STORY_THREAD2_BASE_URL"],
            base_url_default: "https://newapi.aicohere.org/v1/chat/completions",
            text_key_envs: &["BRAND_STORY_THREAD2_TEXT_API_KEY"],
        },
        BrandStoryThreadId::Thread3 => ThreadRuntimeEnv {
            base_url_keys: &["BRAND_STORY_THREAD3_BASE_URL"],
            base_url_default: "https://api.vectorengine.ai",
            text_key_envs: &["BRAND_STORY_THREAD3_TEXT_API_KEY"],
        },
        BrandStoryThreadId::Thread4 => ThreadRuntimeEnv {
            base_url_keys: &[
                "BRAND_STORY_THREAD4_BASE_URL",
                "NEW_PICTURE_WALL_128API_BASE_URL",
            ],
            base_url_default: "https://128api.cn/v1",
            text_key_envs: &[
                "BRAND_STORY_THREAD4_TEXT_API_KEY",
                "BRAND_STORY_THREAD4_API_KEY",
                "NEW_PICTURE_WALL_128API_KEY",
            ],
        },
    }
}

pub(super) struct ThreadRuntimeEnv {
    pub(super) base_url_keys: &'static [&'static str],
    pub(super) base_url_default: &'static str,
    pub(super) text_key_envs: &'static [&'static str],
}

pub(super) fn resolve_base_url(env: &ThreadRuntimeEnv) -> String {
    for key in env.base_url_keys {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    env.base_url_default.to_string()
}
