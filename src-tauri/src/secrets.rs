use keyring::Entry;
use serde_json::{json, Value};

// API keys live only in the OS credential store (Windows Credential Manager / macOS Keychain).
// settings.json stores profile ids only; the frontend never receives a full key back.
const SERVICE: &str = "SpineSlim.model";
const MAX_KEY_LENGTH: usize = 4096;

fn entry(profile_id: &str) -> Result<Entry, String> {
    let valid = !profile_id.is_empty()
        && profile_id.len() <= 64
        && profile_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err("invalid_request".into());
    }
    Entry::new(SERVICE, profile_id).map_err(|_| "credential_store_failed".to_string())
}

fn last_four(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    chars[chars.len().saturating_sub(4)..].iter().collect()
}

pub fn read_model_key(profile_id: &str) -> Result<Option<String>, String> {
    match entry(profile_id)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("credential_store_failed".into()),
    }
}

#[tauri::command]
pub fn model_key_status(profile_id: String) -> Result<Value, String> {
    match entry(&profile_id)?.get_password() {
        Ok(key) => Ok(json!({ "saved": true, "hint": last_four(&key) })),
        Err(keyring::Error::NoEntry) => Ok(json!({ "saved": false, "hint": "" })),
        Err(_) => Err("credential_store_failed".into()),
    }
}

#[tauri::command]
pub fn save_model_key(profile_id: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() || key.len() > MAX_KEY_LENGTH {
        return Err("invalid_api_key".into());
    }
    entry(&profile_id)?
        .set_password(key)
        .map_err(|_| "credential_store_failed".to_string())
}

#[tauri::command]
pub fn delete_model_key(profile_id: String) -> Result<(), String> {
    match entry(&profile_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("credential_store_failed".into()),
    }
}
