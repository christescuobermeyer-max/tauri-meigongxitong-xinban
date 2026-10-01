use std::sync::Once;
use std::path::{Path, PathBuf};

static LOAD_ENV_ONCE: Once = Once::new();

pub fn read_required_env(keys: &[&str]) -> Result<String, String> {
    if let Ok(value) = read_required_env_from(keys, |key| std::env::var(key).ok()) {
        return Ok(value);
    }
    // 开发直连可使用本机配置；正式网关优先使用 systemd 注入的运行时变量。
    load_env_files();
    read_required_env_from(keys, |key| std::env::var(key).ok())
}

fn load_env_files() {
    LOAD_ENV_ONCE.call_once(|| {
        let cwd = std::env::current_dir().unwrap_or_default();
        let exe = std::env::current_exe().ok();
        for path in env_file_candidates(&cwd, exe.as_deref()) {
            let _ = dotenvy::from_path(path);
        }
    });
}

fn env_file_candidates(cwd: &Path, exe: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = vec![cwd.join(".env.local"), cwd.join(".env"),
        cwd.join("../.env.local"), cwd.join("../.env")];
    // 受控直连安装可在程序目录放置配置，不能依赖快捷方式的工作目录。
    if let Some(dir) = exe.and_then(Path::parent) {
        paths.extend([dir.join(".env.local"), dir.join(".env")]);
    }
    paths
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
    use super::{read_required_env_from, env_file_candidates};
    use std::path::Path;

    #[test]
    fn runtime_config_includes_executable_directory() {
        let cwd = Path::new("fake-working-dir");
        let exe = Path::new("fake-install-dir").join("app.exe");
        let paths = env_file_candidates(cwd, Some(&exe));
        assert_eq!(paths[0], cwd.join(".env.local"));
        assert!(paths.contains(&Path::new("fake-install-dir").join(".env.local")));
        assert_eq!(env_file_candidates(cwd, None).len(), 4);
    }

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
