//! 图片处理命令入口；压缩、保存、选图和批量调整分别实现。

#[path = "image_proc/types.rs"]
mod types;
#[path = "image_proc/jpeg.rs"]
mod jpeg;
#[path = "image_proc/compression.rs"]
mod compression;
#[path = "image_proc/saving.rs"]
mod saving;
#[cfg(feature = "tauri-commands")]
#[path = "image_proc/selection.rs"]
mod selection;
#[cfg(feature = "tauri-commands")]
#[path = "image_proc/batch.rs"]
mod batch;
#[cfg(test)]
#[path = "image_proc/tests.rs"]
mod tests;

pub use types::*;
pub use compression::*;
pub use saving::*;
#[cfg(feature = "tauri-commands")]
pub use selection::*;
#[cfg(feature = "tauri-commands")]
pub use batch::*;
