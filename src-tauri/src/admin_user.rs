//! 管理员通过 service_role / secret key 创建账号
//!
//! 流程：
//! 1. 校验调用方 access_token 在 Supabase Auth 有效
//! 2. 用 service_role 查 profiles 表，确认调用方 role='admin' 且 is_active
//! 3. 通过 Supabase Admin API 创建用户（自动 confirm，不发邮箱验证）
//!
//! 注意：service_role / secret key 仅在 Rust 端读取，不会进前端 JS bundle。

use crate::env_config::read_required_env;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const SUPABASE_URL_ENV_KEYS: [&str; 2] = ["SUPABASE_URL", "VITE_SUPABASE_URL"];
const SERVICE_ROLE_ENV_KEYS: [&str; 3] = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_KEY",
];

#[derive(Debug, Deserialize)]
pub struct AdminCreateUserRequest {
    pub access_token: String,
    pub display_name: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AdminCreateUserResponse {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub password: String,
}

#[tauri::command]
pub async fn admin_create_user(
    req: AdminCreateUserRequest,
) -> Result<AdminCreateUserResponse, String> {
    if req.display_name.trim().is_empty() {
        return Err("姓名不能为空".into());
    }
    if !req.email.contains('@') {
        return Err("邮箱格式不合法".into());
    }
    if req.password.len() < 6 {
        return Err("密码长度不足".into());
    }
    if req.access_token.trim().is_empty() {
        return Err("缺少调用方 access_token".into());
    }

    let supabase_url = read_required_env(&SUPABASE_URL_ENV_KEYS)?
        .trim_end_matches('/')
        .to_string();
    let service_role = read_required_env(&SERVICE_ROLE_ENV_KEYS)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("初始化 HTTP 客户端失败：{e}"))?;

    verify_caller_is_admin(&client, &supabase_url, &service_role, &req.access_token).await?;

    let payload = serde_json::json!({
        "email": req.email.trim(),
        "password": req.password,
        "email_confirm": true,
        "user_metadata": {
            "display_name": req.display_name.trim(),
        }
    });

    let response = client
        .post(format!("{supabase_url}/auth/v1/admin/users"))
        .header("apikey", &service_role)
        .header(AUTHORIZATION, format!("Bearer {service_role}"))
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("调用 Supabase Admin API 失败：{e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败：{e}"))?;

    if !status.is_success() {
        return Err(translate_admin_error(status.as_u16(), &body));
    }

    let parsed: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
        format!(
            "解析响应 JSON 失败：{e}; 原始响应：{}",
            truncate(&body, 240)
        )
    })?;
    let id = parsed
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Supabase 返回未包含 id：{}", truncate(&body, 240)))?;

    eprintln!("[admin_create_user] success id={} email={}", id, req.email);

    Ok(AdminCreateUserResponse {
        id,
        email: req.email.trim().to_string(),
        display_name: req.display_name.trim().to_string(),
        password: req.password,
    })
}

async fn verify_caller_is_admin(
    client: &reqwest::Client,
    supabase_url: &str,
    service_role: &str,
    access_token: &str,
) -> Result<(), String> {
    let user_response = client
        .get(format!("{supabase_url}/auth/v1/user"))
        .header("apikey", service_role)
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| format!("校验登录态失败：{e}"))?;

    if !user_response.status().is_success() {
        return Err("身份校验失败：access_token 无效或已过期，请重新登录".into());
    }

    let user_json: serde_json::Value = user_response
        .json()
        .await
        .map_err(|e| format!("解析用户信息失败：{e}"))?;
    let user_id = user_json
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "无法获取调用方 user_id".to_string())?;

    let role_response = client
        .get(format!(
            "{supabase_url}/rest/v1/profiles?select=role,is_active&id=eq.{user_id}"
        ))
        .header("apikey", service_role)
        .header(AUTHORIZATION, format!("Bearer {service_role}"))
        .send()
        .await
        .map_err(|e| format!("校验角色失败：{e}"))?;

    if !role_response.status().is_success() {
        return Err("无法读取调用方角色信息".into());
    }

    let rows: Vec<serde_json::Value> = role_response
        .json()
        .await
        .map_err(|e| format!("解析角色信息失败：{e}"))?;
    let row = rows
        .first()
        .ok_or_else(|| "调用方未在 profiles 表中".to_string())?;
    let role = row.get("role").and_then(|v| v.as_str()).unwrap_or("");
    let is_active = row
        .get("is_active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if role != "admin" || !is_active {
        return Err("权限不足：仅管理员可创建账号".into());
    }
    Ok(())
}

fn translate_admin_error(status: u16, body: &str) -> String {
    let lowered = body.to_lowercase();
    if lowered.contains("already been registered")
        || lowered.contains("already exists")
        || lowered.contains("user_already_exists")
    {
        return "该邮箱已被注册，请换一个邮箱".into();
    }
    format!("创建用户失败 ({status})：{}", truncate(body, 400))
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let cut: String = s.chars().take(max).collect();
        format!("{cut}…")
    }
}
