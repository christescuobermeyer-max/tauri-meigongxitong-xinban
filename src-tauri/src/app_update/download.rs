use std::{path::{Path, PathBuf}, time::Duration};
use futures_util::{Stream, StreamExt};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;
use super::{emit_update_progress, security::{installer_file_name, validate_redirect, validate_sha256}};

pub(super) async fn download_installer(app: &AppHandle, url: &reqwest::Url, version: &str, expected_sha256: &str) -> Result<PathBuf, String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|error| format!("无法解析更新缓存目录：{error}"))?.join("updates").join(version);
    tokio::fs::create_dir_all(&cache_dir).await.map_err(|error| format!("创建更新缓存目录失败：{error}"))?;
    let installer_path = cache_dir.join(format!("{}-{}", uuid::Uuid::new_v4(), installer_file_name(url)?));
    let client = reqwest::Client::builder().https_only(true).timeout(Duration::from_secs(900))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            match validate_redirect(attempt.url(), attempt.previous().len()) {
                Ok(()) => attempt.follow(), Err(reason) => attempt.error(reason),
            }
        })).build().map_err(|_| "初始化更新下载客户端失败".to_string())?;
    let response = client.get(url.clone()).send().await
        .map_err(|_| "下载安装包失败，请检查网络或发布配置".to_string())?
        .error_for_status().map_err(|error| format!("下载安装包失败：HTTP {}", error.status().map(|value| value.as_u16()).unwrap_or(0)))?;
    let total_bytes = response.content_length();
    write_verified_stream(response.bytes_stream(), &installer_path, expected_sha256, total_bytes,
        |bytes, total| emit_update_progress(app, "downloading", bytes, total)).await?;
    Ok(installer_path)
}

pub(super) async fn write_verified_stream<S, B, E, F>(mut stream: S, path: &Path, expected_sha256: &str, total: Option<u64>, mut progress: F) -> Result<(), String>
where S: Stream<Item = Result<B, E>> + Unpin, B: AsRef<[u8]>, F: FnMut(u64, Option<u64>) -> Result<(), String> {
    let expected = validate_sha256(expected_sha256)?;
    let part_path = path.with_extension(format!("{}.part", path.extension().and_then(|value| value.to_str()).unwrap_or("")));
    let result = async {
        let mut file = tokio::fs::File::create(&part_path).await.map_err(|error| format!("保存安装包失败：{error}"))?;
        let mut hash = Sha256::new();
        let mut downloaded = 0_u64;
        progress(downloaded, total)?;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| "读取安装包失败".to_string())?;
            let bytes = chunk.as_ref();
            file.write_all(bytes).await.map_err(|error| format!("保存安装包失败：{error}"))?;
            hash.update(bytes);
            downloaded = downloaded.saturating_add(bytes.len() as u64);
            progress(downloaded, total)?;
        }
        if downloaded == 0 || total.is_some_and(|expected| expected != downloaded) {
            return Err("安装包下载不完整，拒绝自动安装".to_string());
        }
        let actual = format!("{:x}", hash.finalize());
        if actual != expected { return Err("安装包 SHA-256 摘要不匹配，拒绝自动安装".to_string()); }
        file.flush().await.map_err(|error| format!("保存安装包失败：{error}"))?;
        file.sync_all().await.map_err(|error| format!("保存安装包失败：{error}"))?;
        drop(file);
        tokio::fs::rename(&part_path, path).await.map_err(|error| format!("确认安装包失败：{error}"))?;
        Ok(())
    }.await;
    if result.is_err() { let _ = tokio::fs::remove_file(&part_path).await; }
    result
}
