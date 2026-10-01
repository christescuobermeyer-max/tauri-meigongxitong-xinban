use super::*;

pub(super) fn locate_cookie_file(app: &AppHandle, cookie_file_name: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(app_dir) = app.path().app_data_dir() {
        candidates.push(app_dir.join(cookie_file_name));
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        candidates.push(config_dir.join(cookie_file_name));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(cookie_file_name));
        candidates.push(resource_dir.join("_up_").join(cookie_file_name));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        for dir in current_dir.ancestors().take(6) {
            candidates.push(dir.join(cookie_file_name));
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("_up_").join(cookie_file_name));
            for dir in exe_dir.ancestors().take(6) {
                candidates.push(dir.join(cookie_file_name));
            }
        }
    }

    let now_secs = current_unix_secs();
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .filter_map(|path| {
            if !path.exists() {
                return None;
            }
            match score_cookie_file_candidate(&path, cookie_file_name, now_secs) {
                Ok(score) => {
                    println!(
                        "🍪 [locate_cookie_file] 候选cookie: {:?}, important={}, fresh={}, relevant={}",
                        path,
                        score.fresh_important_count,
                        score.fresh_relevant_count,
                        score.relevant_count
                    );
                    Some((path, score))
                }
                Err(error) => {
                    println!(
                        "⚠️ [locate_cookie_file] 跳过不可用cookie: {:?}, {}",
                        path, error
                    );
                    None
                }
            }
        })
        .max_by_key(|(_, score)| *score)
        .map(|(path, score)| {
            println!(
                "✅ [locate_cookie_file] 选中cookie: {:?}, important={}, fresh={}, relevant={}",
                path,
                score.fresh_important_count,
                score.fresh_relevant_count,
                score.relevant_count
            );
            path
        })
}
