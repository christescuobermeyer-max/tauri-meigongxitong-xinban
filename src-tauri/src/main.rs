// 防止在 Windows release 构建时弹出额外控制台
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    csgh_image_studio_lib::run()
}
