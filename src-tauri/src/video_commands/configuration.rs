use super::*;

#[derive(Debug, Serialize, Deserialize, Default)]
struct VideoPathConfig {
    cache_path: Option<String>,
    export_path: Option<String>,
}

// 获取配置文件路径
pub(super) fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取配置目录: {}", e))?;
    std::fs::create_dir_all(&config_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    Ok(config_dir.join("video_cache_config.json"))
}

// 读取缓存路径配置
pub(super) fn read_path_config(app: &AppHandle) -> VideoPathConfig {
    let Ok(config_path) = get_config_path(app) else {
        return VideoPathConfig::default();
    };
    let Ok(content) = std::fs::read_to_string(&config_path) else {
        return VideoPathConfig::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

pub(super) fn write_path_config(app: &AppHandle, config: &VideoPathConfig) -> Result<(), String> {
    let config_path = get_config_path(app)?;
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, content).map_err(|e| format!("保存配置失败: {}", e))?;
    Ok(())
}

// 读取缓存路径配置
pub(super) fn read_cache_config(app: &AppHandle) -> Option<String> {
    read_path_config(app).cache_path
}

// 保存缓存路径配置
pub(super) fn save_cache_config(app: &AppHandle, path: &str) -> Result<(), String> {
    let mut config = read_path_config(app);
    config.cache_path = Some(path.to_string());
    write_path_config(app, &config)?;
    println!("✅ [save_cache_config] 已保存缓存路径: {}", path);
    Ok(())
}

pub(super) fn read_export_config(app: &AppHandle) -> Option<String> {
    read_path_config(app).export_path
}

pub(super) fn save_export_config(app: &AppHandle, path: &str) -> Result<(), String> {
    let mut config = read_path_config(app);
    config.export_path = Some(path.to_string());
    write_path_config(app, &config)?;
    println!("✅ [save_export_config] 已保存导出路径: {}", path);
    Ok(())
}

pub(super) fn resolve_export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(saved_path) = read_export_config(app) {
        let export_dir = PathBuf::from(saved_path);
        std::fs::create_dir_all(&export_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;
        return Ok(export_dir);
    }

    use tauri_plugin_dialog::DialogExt;

    let selected = app
        .dialog()
        .file()
        .set_title("选择视频导出保存位置")
        .blocking_pick_folder();

    let selected_path = selected
        .ok_or_else(|| "请选择视频导出保存位置后再导出视频".to_string())?
        .to_string();
    let export_dir = PathBuf::from(&selected_path);
    std::fs::create_dir_all(&export_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;
    save_export_config(app, &selected_path)?;
    Ok(export_dir)
}

#[tauri::command]
pub async fn get_video_export_path(app: AppHandle) -> Result<Option<String>, String> {
    Ok(read_export_config(&app))
}

// 视频文件信息结构体
