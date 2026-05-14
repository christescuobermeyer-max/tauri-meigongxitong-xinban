use std::sync::Once;

static LOAD_ENV_ONCE: Once = Once::new();

pub fn read_required_env(keys: &[&str]) -> Result<String, String> {
    // 优先使用编译时通过 build.rs 嵌入的值（option_env! 在编译时求值）
    for key in keys {
        if let Some(value) = compile_time_env(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }
    // 回退：运行时从 .env.local 读取（开发模式）
    load_env_files();
    read_required_env_from(keys, |key| std::env::var(key).ok())
}

/// 编译时嵌入的环境变量查找表（build.rs 通过 cargo:rustc-env 注入）
fn compile_time_env(key: &str) -> Option<&'static str> {
    match key {
        "ALI_OSS_REGION" => option_env!("ALI_OSS_REGION"),
        "OSS_REGION" => option_env!("OSS_REGION"),
        "ALI_OSS_ACCESS_KEY_ID" => option_env!("ALI_OSS_ACCESS_KEY_ID"),
        "OSS_KEY_ID" => option_env!("OSS_KEY_ID"),
        "ALI_OSS_ACCESS_KEY_SECRET" => option_env!("ALI_OSS_ACCESS_KEY_SECRET"),
        "OSS_KEY_SECRET" => option_env!("OSS_KEY_SECRET"),
        "ALI_OSS_BUCKET" => option_env!("ALI_OSS_BUCKET"),
        "OSS_BUCKET" => option_env!("OSS_BUCKET"),
        "IMAGE_2_API_KEY" => option_env!("IMAGE_2_API_KEY"),
        "IMAGE_2_LINE2_API_KEY" => option_env!("IMAGE_2_LINE2_API_KEY"),
        "NEW_PICTURE_WALL_IMAGE2_API_KEY" => option_env!("NEW_PICTURE_WALL_IMAGE2_API_KEY"),
        "POCKGO_IMAGE_2_API_KEY" => option_env!("POCKGO_IMAGE_2_API_KEY"),
        "VECTORENGINE_IMAGE_2_API_KEY" => option_env!("VECTORENGINE_IMAGE_2_API_KEY"),
        "APIMART_IMAGE_2_API_KEY" => option_env!("APIMART_IMAGE_2_API_KEY"),
        "SUPABASE_SERVICE_ROLE_KEY" => option_env!("SUPABASE_SERVICE_ROLE_KEY"),
        _ => None,
    }
}

fn load_env_files() {
    LOAD_ENV_ONCE.call_once(|| {
        let _ = dotenvy::from_filename(".env.local");
        let _ = dotenvy::from_filename(".env");
        let _ = dotenvy::from_filename("../.env.local");
        let _ = dotenvy::from_filename("../.env");
    });
}

fn read_required_env_from(
    keys: &[&str],
    read: impl Fn(&str) -> Option<String>,
) -> Result<String, String> {
    for key in keys {
        if let Some(value) = read(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    Err(format!("缺少环境变量：{}", keys.join(" / ")))
}

#[cfg(test)]
mod tests {
    use super::read_required_env_from;

    #[test]
    fn read_required_env_from_uses_first_non_empty_value() {
        let value = read_required_env_from(&["PRIMARY", "FALLBACK"], |key| match key {
            "PRIMARY" => Some("   ".to_string()),
            "FALLBACK" => Some("  secret-value  ".to_string()),
            _ => None,
        })
        .unwrap();

        assert_eq!(value, "secret-value");
    }

    #[test]
    fn read_required_env_from_reports_all_candidate_keys() {
        let err = read_required_env_from(&["PRIMARY", "FALLBACK"], |_| None).unwrap_err();

        assert_eq!(err, "缺少环境变量：PRIMARY / FALLBACK");
    }
}
