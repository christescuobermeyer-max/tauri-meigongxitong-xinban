use crate::env_config::read_required_env;
use crate::gemini_response::truncate_for_msg;
use serde_json::Value;

const ZIKL_API_KEY_ENV_KEYS: [&str; 2] = ["IMAGE_2_LINE2_API_KEY", "YUNWU_IMAGE_2_LINE2_API_KEY"];
const ZIKL_BILLING_SUBSCRIPTION_URL: &str =
    "https://img.zikl.dev/v1/dashboard/billing/subscription";
const ZIKL_BILLING_USAGE_URL: &str = "https://img.zikl.dev/v1/dashboard/billing/usage";

const MANXIAOBAI_API_KEY_ENV_KEYS: [&str; 2] =
    ["MANXIAOBAI_IMAGE_2_API_KEY", "IMAGE_2_LINE6_API_KEY"];
const MANXIAOBAI_BILLING_SUBSCRIPTION_URL: &str =
    "https://api.manxiaobai.online/v1/dashboard/billing/subscription";
const MANXIAOBAI_BILLING_USAGE_URL: &str =
    "https://api.manxiaobai.online/v1/dashboard/billing/usage";

const NOVAEWORLD_API_KEY_ENV_KEYS: [&str; 2] = ["NOVA_IMAGE_2_API_KEY", "IMAGE_2_LINE7_API_KEY"];
const NOVAEWORLD_BILLING_SUBSCRIPTION_URL: &str =
    "https://api.novaeworld.top/v1/dashboard/billing/subscription";
const NOVAEWORLD_BILLING_USAGE_URL: &str = "https://api.novaeworld.top/v1/dashboard/billing/usage";

#[derive(Clone, Copy)]
struct ApiKeyBillingConfig {
    provider_label: &'static str,
    api_key_env_keys: &'static [&'static str],
    subscription_url: &'static str,
    usage_url: &'static str,
    unit_symbol: &'static str,
    display_name: &'static str,
}

pub fn supports_api_key_billing_line(line: &str) -> bool {
    matches!(line, "line2" | "line6" | "line7")
}

fn api_key_billing_config(line: &str) -> Result<ApiKeyBillingConfig, String> {
    match line {
        "line2" => Ok(ApiKeyBillingConfig {
            provider_label: "Zikl",
            api_key_env_keys: &ZIKL_API_KEY_ENV_KEYS,
            subscription_url: ZIKL_BILLING_SUBSCRIPTION_URL,
            usage_url: ZIKL_BILLING_USAGE_URL,
            unit_symbol: "¤",
            display_name: "Zikl API Key",
        }),
        "line6" => Ok(ApiKeyBillingConfig {
            provider_label: "manxiaobai",
            api_key_env_keys: &MANXIAOBAI_API_KEY_ENV_KEYS,
            subscription_url: MANXIAOBAI_BILLING_SUBSCRIPTION_URL,
            usage_url: MANXIAOBAI_BILLING_USAGE_URL,
            unit_symbol: "¤",
            display_name: "manxiaobai API Key",
        }),
        "line7" => Ok(ApiKeyBillingConfig {
            provider_label: "novaeworld",
            api_key_env_keys: &NOVAEWORLD_API_KEY_ENV_KEYS,
            subscription_url: NOVAEWORLD_BILLING_SUBSCRIPTION_URL,
            usage_url: NOVAEWORLD_BILLING_USAGE_URL,
            unit_symbol: "¤",
            display_name: "novaeworld API Key",
        }),
        _ => Err(format!("线路 {line} 不支持 API Key billing 余额查询")),
    }
}

pub fn calculate_api_key_billing_balance(hard_limit_usd: f64, total_usage: f64) -> (f64, f64) {
    let history_used = (total_usage / 100.0).max(0.0);
    let balance = (hard_limit_usd - history_used).max(0.0);
    (balance, history_used)
}

async fn fetch_api_key_billing_value(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
    label: &str,
    provider_label: &str,
) -> Result<Value, String> {
    let response = client
        .get(url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| format!("请求 {provider_label} {label} 失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取 {provider_label} {label} 响应失败：{error}"))?;
    if !status.is_success() {
        return Err(format!(
            "{provider_label} {label} 返回 {status}：{}",
            truncate_for_msg(&body, 300)
        ));
    }
    let parsed: Value = serde_json::from_str(&body)
        .map_err(|error| format!("解析 {provider_label} {label} 响应失败：{error}"))?;
    if let Some(message) = parsed.pointer("/error/message").and_then(Value::as_str) {
        return Err(format!("{provider_label} {label} 返回错误：{message}"));
    }
    Ok(parsed)
}

pub async fn fetch_api_key_billing_balance_for_line(
    client: &reqwest::Client,
    line: &str,
) -> Result<Value, String> {
    let cfg = api_key_billing_config(line)?;
    let api_key = read_required_env(cfg.api_key_env_keys)?;
    let subscription = fetch_api_key_billing_value(
        client,
        &api_key,
        cfg.subscription_url,
        "subscription",
        cfg.provider_label,
    )
    .await?;
    let usage =
        fetch_api_key_billing_value(client, &api_key, cfg.usage_url, "usage", cfg.provider_label)
            .await?;
    let hard_limit_usd = subscription
        .get("hard_limit_usd")
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("{} subscription 缺少 hard_limit_usd", cfg.provider_label))?;
    let total_usage = usage
        .get("total_usage")
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("{} usage 缺少 total_usage", cfg.provider_label))?;
    let (balance, history_used) = calculate_api_key_billing_balance(hard_limit_usd, total_usage);

    Ok(serde_json::json!({
        "ok": true,
        "balance": balance,
        "history_used": history_used,
        "unit": cfg.unit_symbol,
        "userId": 0,
        "displayName": cfg.display_name,
        "rawQuota": hard_limit_usd,
        "rawUsedQuota": total_usage,
    }))
}

#[cfg(test)]
mod tests {
    use super::{calculate_api_key_billing_balance, supports_api_key_billing_line};

    #[test]
    fn api_key_billing_usage_is_reported_in_cents() {
        let (balance, history_used) = calculate_api_key_billing_balance(100_000_000.0, 1.0);

        assert_eq!(balance, 99_999_999.99);
        assert_eq!(history_used, 0.01);
    }

    #[test]
    fn only_api_key_lines_use_gateway_billing() {
        assert!(supports_api_key_billing_line("line2"));
        assert!(supports_api_key_billing_line("line6"));
        assert!(supports_api_key_billing_line("line7"));
        assert!(!supports_api_key_billing_line("line3"));
    }
}
