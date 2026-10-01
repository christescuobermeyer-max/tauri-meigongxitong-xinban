use image::GenericImageView;
use std::{path::Path, process::Command};
use super::types::*;

#[cfg(feature = "tauri-commands")]
const IMAGE_RESIZE_EXTENSIONS: [&str; 6] = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];

#[cfg(feature = "tauri-commands")]
fn is_supported_image_resize_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| IMAGE_RESIZE_EXTENSIONS.contains(&value.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[cfg(feature = "tauri-commands")]
fn read_image_resize_info(path: &Path) -> Result<ImageResizeInfo, String> {
    let image = image::open(path).map_err(|error| format!("无法读取图片：{error}"))?;
    let (width, height) = image.dimensions();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("未知文件")
        .to_string();
    let file_size = std::fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0);

    Ok(ImageResizeInfo {
        file_name,
        file_path: path.to_string_lossy().to_string(),
        file_size,
        width,
        height,
    })
}

#[cfg(feature = "tauri-commands")]
fn scan_image_resize_folder(folder: &Path) -> Result<Vec<ImageResizeInfo>, String> {
    let mut results = Vec::new();
    let entries = std::fs::read_dir(folder).map_err(|error| format!("读取文件夹失败：{error}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(mut nested) = scan_image_resize_folder(&path) {
                results.append(&mut nested);
            }
        } else if is_supported_image_resize_path(&path) {
            if let Ok(info) = read_image_resize_info(&path) {
                results.push(info);
            }
        }
    }

    Ok(results)
}

#[cfg(feature = "tauri-commands")]
#[tauri::command]
pub async fn select_images(
    app: tauri::AppHandle,
) -> Result<Vec<ImageResizeInfo>, String> {
    use tauri_plugin_dialog::DialogExt;

    let selected = app
        .dialog()
        .file()
        .set_title("选择图片文件")
        .add_filter("图片文件", &IMAGE_RESIZE_EXTENSIONS)
        .blocking_pick_files();

    Ok(selected
        .unwrap_or_default()
        .into_iter()
        .filter_map(|path| read_image_resize_info(Path::new(&path.to_string())).ok())
        .collect())
}

#[cfg(feature = "tauri-commands")]
#[tauri::command]
pub async fn select_image_folder(
    app: tauri::AppHandle,
) -> Result<Vec<ImageResizeInfo>, String> {
    use tauri_plugin_dialog::DialogExt;

    let selected = app
        .dialog()
        .file()
        .set_title("选择图片文件夹")
        .blocking_pick_folder();

    match selected {
        Some(path) => scan_image_resize_folder(Path::new(&path.to_string())),
        None => Ok(Vec::new()),
    }
}

#[cfg(feature = "tauri-commands")]
#[tauri::command]
pub async fn open_image_output_folder(folder_path: String) -> Result<(), String> {
    let path = Path::new(&folder_path);
    if !path.is_dir() {
        return Err(format!("输出目录不存在：{folder_path}"));
    }

    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg(path)
        .spawn()
        .map_err(|error| format!("打开输出目录失败：{error}"))?;

    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|error| format!("打开输出目录失败：{error}"))?;

    #[cfg(target_os = "linux")]
    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|error| format!("打开输出目录失败：{error}"))?;

    Ok(())
}
