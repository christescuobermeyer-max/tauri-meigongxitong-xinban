use crate::xiaohongshu_cookie_support::{
    cleanup_temp_cookie_file, prepare_cookie_args, prepare_named_cookie_args,
};
use crate::xiaohongshu_guard::explain_parse_failure;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const DOUYIN_COOKIE_FILE_NAME: &str = "抖音cookie.txt";
const DOUYIN_BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

#[derive(Debug, Serialize, Clone)]
pub struct VideoFileInfo {
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct VideoInfo {
    #[serde(rename = "videoUrl")]
    pub video_url: String,
    pub title: String,
    pub author: String,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
}

// 裁剪参数
#[derive(Debug, Deserialize)]
pub struct CropParams {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(rename = "startTime")]
    pub start_time: f64,
    #[serde(rename = "endTime")]
    pub end_time: f64,
}

#[derive(Clone, Copy)]
struct VideoExportSpec {
    label: &'static str,
    width: i32,
    height: i32,
    min_duration_seconds: Option<f64>,
    max_duration_seconds: Option<f64>,
    max_file_size_bytes: Option<u64>,
    max_video_bitrate: Option<&'static str>,
    buffer_size: Option<&'static str>,
}


mod runtime;
use runtime::*;

mod configuration;
use configuration::*;

mod history;
use history::*;

mod export_specs;
use export_specs::*;

mod encoding;
use encoding::*;

mod parse_douyin;
use parse_douyin::*;

mod parse_xhs;
use parse_xhs::*;

mod xhs_extract;
use xhs_extract::*;

mod download;
use download::*;

mod preview;
use preview::*;

mod export;
use export::*;

pub use configuration::{get_video_export_path};
pub use configuration::{__cmd__get_video_export_path};

pub use history::{list_exported_videos, open_export_folder, delete_exported_video};
pub use history::{__cmd__list_exported_videos, __cmd__open_export_folder, __cmd__delete_exported_video};

pub use parse_douyin::{parse_douyin};
pub use parse_douyin::{__cmd__parse_douyin};

pub use parse_xhs::{parse_xiaohongshu};
pub use parse_xhs::{__cmd__parse_xiaohongshu};

pub use download::{download_video};
pub use download::{__cmd__download_video};

pub use preview::{prepare_local_video_preview};
pub use preview::{__cmd__prepare_local_video_preview};

pub use export::{process_video, process_local_video, copy_video_file};
pub use export::{__cmd__process_video, __cmd__process_local_video, __cmd__copy_video_file};

#[cfg(test)]
mod tests;
