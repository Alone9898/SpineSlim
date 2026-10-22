use std::time::Duration;

use serde_json::{json, Value};

use crate::secrets;

// The key is read from the credential store here, so it never crosses into the frontend.
const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_MODELS: usize = 500;

fn list_url(base_url: &str, protocol: &str) -> Result<String, String> {
    let base = base_url.trim().trim_end_matches('/');
    if !base.starts_with("https://") || base.len() <= "https://".len() {
        return Err("invalid_base_url".into());
    }
    match protocol {
        "openai_compatible" | "anthropic" | "gemini" => Ok(format!("{base}/models")),
        _ => Err("invalid_protocol".into()),
    }
}

fn parse_models(protocol: &str, body: &Value) -> Vec<String> {
    let items = body.get(if protocol == "gemini" { "models" } else { "data" });
    let mut names: Vec<String> = items
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|item| {
                    let raw = if protocol == "gemini" { item.get("name")? } else { item.get("id")? };
                    let name = raw.as_str()?;
                    Some(name.strip_prefix("models/").unwrap_or(name).to_string())
                })
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names.dedup();
    names.truncate(MAX_MODELS);
    names
}

#[tauri::command]
pub fn fetch_model_list(profile_id: String, base_url: String, protocol: String) -> Result<Value, String> {
    let url = list_url(&base_url, &protocol)?;
    let status = secrets::read_model_key(&profile_id)?.ok_or("no_api_key")?;
    // Use the OS TLS stack (schannel on Windows) so the same certificates and renegotiation behave as in curl.
    let tls = native_tls::TlsConnector::new().map_err(|_| "model_list_network".to_string())?;
    let agent = ureq::AgentBuilder::new().timeout(TIMEOUT).tls_connector(std::sync::Arc::new(tls)).build();
    let request = agent.get(&url);
    let request = match protocol.as_str() {
        "anthropic" => request.set("x-api-key", &status).set("anthropic-version", "2023-06-01"),
        "gemini" => request.set("x-goog-api-key", &status),
        _ => request.set("Authorization", &format!("Bearer {status}")),
    };
    let response = request.call().map_err(|error| match error {
        ureq::Error::Status(401 | 403, _) => "model_list_unauthorized".to_string(),
        ureq::Error::Status(_, _) => "model_list_http_error".to_string(),
        ureq::Error::Transport(_) => "model_list_network".to_string(),
    })?;
    let body: Value = response
        .into_json()
        .map_err(|_| "model_list_bad_response".to_string())?;
    let models = parse_models(&protocol, &body);
    if models.is_empty() {
        return Err("model_list_empty".into());
    }
    Ok(json!({ "models": models }))
}
