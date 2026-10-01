use crate::image_provider::ImageApiLine;
use serde::Deserialize;

/// 前端调用入参（与 TypeScript 端 GenerateImageRequest 对齐）
#[derive(Debug, Clone, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
    /// 线路2/4/5支持 "16:9" 店招与 "21:9" 海报；线路3支持 "1024x1024" / "1024x1536" / "1536x1024" / "21:9" / "3:4"；线路5门头 "auto" 会转为 "3:2"
    pub size: String,
    /// 参考图列表：支持不含 data: 前缀的 base64，也支持可访问 URL；可为空
    pub product_images: Vec<String>,
    /// 生图线路：线路2/3/4复用 Zikl 上游，线路5为 APIMart 兼容线路
    #[serde(default)]
    pub api_line: ImageApiLine,
}
