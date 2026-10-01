use super::*;

pub(super) fn value_to_prompt_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        Value::Bool(value) => value.to_string(),
        Value::Array(items) => items
            .iter()
            .map(value_to_prompt_string)
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join("、"),
        Value::Object(_) => value.to_string(),
    }
}

pub(super) fn str_var(variables: &Value, key: &str) -> Option<String> {
    variables
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(super) fn first_non_empty(variables: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| str_var(variables, key))
}

pub(super) fn bool_var(variables: &Value, key: &str) -> Option<bool> {
    variables.get(key).and_then(Value::as_bool)
}

pub(super) fn usize_var(variables: &Value, key: &str) -> Option<usize> {
    variables
        .get(key)
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_i64().and_then(|v| (v >= 0).then_some(v as u64)))
        })
        .map(|value| value as usize)
}

pub(super) fn string_array_var(variables: &Value, key: &str) -> Vec<String> {
    variables
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

pub(super) fn first_string_array_var(variables: &Value, keys: &[&str]) -> Vec<String> {
    for key in keys {
        let values = string_array_var(variables, key);
        if !values.is_empty() {
            return values;
        }
    }
    Vec::new()
}
