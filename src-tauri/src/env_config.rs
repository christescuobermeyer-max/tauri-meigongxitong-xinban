use std::sync::Once;

static LOAD_ENV_ONCE: Once = Once::new();

pub fn read_required_env(keys: &[&str]) -> Result<String, String> {
    load_env_files();
    read_required_env_from(keys, |key| std::env::var(key).ok())
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
