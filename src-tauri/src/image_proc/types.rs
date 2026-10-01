use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ResizeRequest {
    pub base64_data: String,
    pub target_width: u32,
    pub target_height: u32,
    pub output_path: String,
    #[serde(default)]
    pub max_bytes: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct SaveBase64ImageRequest {
    pub base64_data: String,
    pub output_path: String,
}

#[derive(Debug, Deserialize)]
pub struct CompressGeneratedImageRequest {
    pub base64_data: String,
    #[serde(default = "default_max_dimension")]
    pub max_dimension: u32,
    #[serde(default = "default_jpeg_quality")]
    pub quality: u8,
}

#[derive(Debug, Serialize)]
pub struct CompressGeneratedImageResponse {
    pub base64_data: String,
    pub mime_type: String,
    pub byte_size: usize,
    pub width: u32,
    pub height: u32,
}

fn default_max_dimension() -> u32 {
    768
}

fn default_jpeg_quality() -> u8 {
    82
}

#[cfg(feature = "tauri-commands")]
#[derive(Debug, Serialize, Clone)]
pub struct ImageResizeInfo {
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub width: u32,
    pub height: u32,
}

#[cfg(feature = "tauri-commands")]
#[derive(Debug, Serialize, Clone)]
pub struct ImageResizeResult {
    pub file_name: String,
    pub input_path: String,
    pub output_path: String,
    pub input_size: u64,
    pub output_size: u64,
    pub input_dimensions: String,
    pub output_dimensions: String,
    pub status: String,
    pub error: Option<String>,
}
