mod env_config;

mod admin_user;
mod api;
mod api_validation;
mod apimart;
mod apimart_reference;
mod apimart_task;
// balance 模块依赖 tauri::AppHandle / tauri::async_runtime（Playwright headed 登录），
// 仅桌面端需要。云端 backend-gateway 用 --no-default-features 编译时排除。
#[cfg(feature = "tauri-commands")]
mod balance;
mod brand_story;
mod brand_story_clients;
mod gateway_limiter;
mod gateway_pause_state;
mod gateway_queue;
mod gemini_response;
mod http_client;
mod image_api_response;
mod image_generation_payload;
mod image_proc;
mod image_provider;
mod line_health;
mod manxiaobai_edit;
mod oss;
mod pockgo_chat;
mod pockgo_transport;
mod reference_image;
mod vectorengine_edit;
mod yunwu_edit;

#[cfg(feature = "tauri-commands")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            admin_user::admin_create_user,
            admin_user::admin_soft_delete_user,
            image_proc::compress_generated_image,
            api::generate_image,
            image_proc::resize_and_save_image,
            oss::upload_image_to_oss,
            brand_story::brand_story_generate_text,
            brand_story::brand_story_thread_availability,
            balance::balance_login,
            balance::balance_fetch,
            balance::balance_open_console,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
