mod env_config;

mod admin_user;
mod apimart;
mod apimart_reference;
mod apimart_task;
mod api;
mod api_validation;
mod gemini_response;
mod http_client;
mod image_api_response;
mod image_generation_payload;
mod image_proc;
mod image_provider;
mod oss;
mod pockgo_chat;
mod pockgo_transport;
mod reference_image;
mod yunwu_edit;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(feature = "tauri-commands")]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_shell::init())
            .invoke_handler(tauri::generate_handler![
                admin_user::admin_create_user,
                image_proc::compress_generated_image,
                api::generate_image,
                image_proc::resize_and_save_image,
                oss::upload_image_to_oss,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}
