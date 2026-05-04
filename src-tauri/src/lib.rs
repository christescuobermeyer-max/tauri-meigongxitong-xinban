mod env_config;

mod admin_user;
mod api;
mod gemini_response;
mod http_client;
mod image_proc;
mod image_provider;
mod oss;
mod pockgo_chat;
mod reference_image;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            admin_user::admin_create_user,
            api::generate_image,
            image_proc::resize_and_save_image,
            oss::upload_image_to_oss,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
