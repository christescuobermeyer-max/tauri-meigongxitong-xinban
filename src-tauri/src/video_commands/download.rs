use super::*;

#[tauri::command]
pub async fn download_video(
    url: String,
    platform: String,
    headers: Option<HashMap<String, String>>,
    app: AppHandle,
) -> Result<String, String> {
    use std::io::Write;
    use tauri_plugin_dialog::DialogExt;

    println!("📥 [download_video] 开始下载: {}", url);

    // 获取缓存目录：优先使用用户配置的路径
    let cache_dir = if let Some(saved_path) = read_cache_config(&app) {
        println!("📁 [download_video] 使用已保存的缓存路径: {}", saved_path);
        PathBuf::from(saved_path)
    } else {
        // 第一次使用，弹窗让用户选择路径
        println!("📁 [download_video] 首次使用，弹窗选择缓存路径...");

        let selected = app
            .dialog()
            .file()
            .set_title("选择视频缓存保存位置")
            .blocking_pick_folder();

        match selected {
            Some(path) => {
                let path_str = path.to_string();
                // 保存用户选择的路径
                save_cache_config(&app, &path_str)?;
                PathBuf::from(path_str)
            }
            None => {
                // 用户取消选择，使用默认路径
                println!("📁 [download_video] 用户取消选择，使用默认路径");
                let default_dir = app
                    .path()
                    .app_cache_dir()
                    .map_err(|e| format!("无法获取缓存目录: {}", e))?;
                // 保存默认路径
                save_cache_config(&app, &default_dir.to_string_lossy())?;
                default_dir
            }
        }
    };

    // 确保目录存在
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;

    let filename = format!("preview_{}.mp4", uuid::Uuid::new_v4());
    let file_path = cache_dir.join(&filename);

    // 设置Referer
    let referer = if platform == "douyin" {
        "https://www.douyin.com/"
    } else {
        "https://www.xiaohongshu.com/"
    };

    // 下载视频
    let client = reqwest::Client::new();
    let mut request = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .header("Referer", referer);

    if let Some(headers) = headers {
        for (name, value) in headers {
            if !is_safe_video_download_header(&name) {
                continue;
            }
            let Ok(header_name) = name.parse::<reqwest::header::HeaderName>() else {
                continue;
            };
            let Ok(header_value) = value.parse::<reqwest::header::HeaderValue>() else {
                continue;
            };
            request = request.header(header_name, header_value);
        }
    }

    let resp = request
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {}", e))?;
    let status = resp.status();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取视频数据失败: {}", e))?;
    if !status.is_success() {
        return Err(format!("下载视频失败：HTTP {}", status));
    }
    if looks_like_html_response(&bytes, content_type.as_deref()) {
        return Err("下载到的不是视频文件，可能是平台拦截页或链接已失效".to_string());
    }

    // 写入文件
    let mut file = std::fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    println!("✅ [download_video] 下载完成: {:?}", file_path);

    app.asset_protocol_scope().allow_file(&file_path)
        .map_err(|error| format!("授权视频预览失败：{error}"))?;
    Ok(file_path.to_string_lossy().to_string())
}
