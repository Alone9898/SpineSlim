use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, State};

const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_SKELETON: u64 = 16 * 1024 * 1024;

#[derive(Default, Clone)]
pub struct ViewerState {
    generation: Arc<AtomicU64>,
    sessions: Arc<Mutex<HashMap<u64, Vec<PathBuf>>>>,
}

#[derive(Serialize)]
pub struct Asset {
    id: usize,
    path: String,
    kind: String,
    version: String,
    issue: String,
    bytes: u64,
}

#[derive(Serialize)]
pub struct Catalog {
    session: u64,
    root: String,
    assets: Vec<Asset>,
    skipped: usize,
}

fn linked(path: &Path) -> bool {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return true;
    };
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

pub(crate) fn checked(path: &Path) -> Result<PathBuf, String> {
    if path.ancestors().any(linked) {
        return Err("viewer.link".into());
    }
    fs::canonicalize(path).map_err(|_| "viewer.read".into())
}

fn binary_string(data: &[u8], position: &mut usize) -> Option<String> {
    let mut length = 0usize;
    for shift in (0..35).step_by(7) {
        let byte = *data.get(*position)?;
        *position += 1;
        length |= ((byte & 127) as usize) << shift;
        if byte & 128 == 0 {
            if length == 0 {
                return Some(String::new());
            }
            let end = position.checked_add(length - 1)?;
            let text = std::str::from_utf8(data.get(*position..end)?)
                .ok()?
                .to_owned();
            *position = end;
            return Some(text);
        }
    }
    None
}

fn valid_version(version: &str) -> bool {
    let parts: Vec<_> = version.split('.').collect();
    parts.len() >= 2
        && parts.len() <= 4
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

fn binary_version(data: &[u8]) -> Option<String> {
    let mut position = 0;
    if binary_string(data, &mut position).is_some() {
        if let Some(version) = binary_string(data, &mut position).filter(|text| valid_version(text))
        {
            return Some(version);
        }
    }
    binary_string(data, &mut 8).filter(|text| valid_version(text))
}

#[tauri::command]
pub async fn viewer_scan(
    app: tauri::AppHandle,
    state: State<'_, ViewerState>,
    paths: Vec<String>,
) -> Result<Catalog, String> {
    let state = state.inner().clone();
    let session = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.sessions.lock().map_err(|_| "viewer.read")?.clear();
    tauri::async_runtime::spawn_blocking(move || {
        if paths.is_empty() {
            return Err("viewer.empty".into());
        }
        let selected: Vec<PathBuf> = paths
            .iter()
            .map(|path| checked(Path::new(path)))
            .collect::<Result<_, _>>()?;
        let root = if selected.len() == 1 && selected[0].is_dir() {
            selected[0].clone()
        } else {
            selected[0].parent().ok_or("viewer.read")?.to_path_buf()
        };
        let mut stack = selected;
        let mut assets = Vec::new();
        let mut files = Vec::new();
        let mut skipped = 0;
        let mut scanned = 0;
        while let Some(path) = stack.pop() {
            if state.generation.load(Ordering::SeqCst) != session {
                return Err("viewer.cancelled".into());
            }
            scanned += 1;
            if scanned > 50_000 {
                return Err("viewer.limit".into());
            }
            if linked(&path) {
                skipped += 1;
                continue;
            }
            if path.is_dir() {
                match fs::read_dir(&path) {
                    Ok(children) => {
                        for child in children {
                            match child {
                                Ok(child) => stack.push(child.path()),
                                Err(_) => skipped += 1,
                            }
                        }
                    }
                    Err(_) => skipped += 1,
                }
            } else {
                let extension = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if ![
                    "json", "skel", "atlas", "png", "jpg", "jpeg", "webp", "basis", "ktx", "ktx2",
                ]
                .contains(&extension.as_str())
                {
                    continue;
                }
                let metadata = fs::metadata(&path).map_err(|_| "viewer.read")?;
                let mut version = String::new();
                let mut issue = String::new();
                let kind = if ["json", "skel"].contains(&extension.as_str()) {
                    if metadata.len() > MAX_SKELETON {
                        issue = "viewer.large".into();
                    } else {
                        let data = fs::read(&path).map_err(|_| "viewer.read")?;
                        if extension == "json" {
                            match serde_json::from_slice::<serde_json::Value>(&data) {
                                Ok(value) => {
                                    if !value["bones"].is_array() {
                                        continue;
                                    }
                                    version =
                                        value["skeleton"]["spine"].as_str().unwrap_or("").into();
                                }
                                Err(_) => {
                                    skipped += 1;
                                    continue;
                                }
                            }
                        } else {
                            version = binary_version(&data).unwrap_or_default();
                        }
                        if version.is_empty() {
                            issue = "viewer.version".into();
                        }
                    }
                    "skeleton"
                } else if extension == "atlas" {
                    "atlas"
                } else {
                    "texture"
                };
                let id = files.len();
                assets.push(Asset {
                    id,
                    path: path
                        .strip_prefix(&root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/"),
                    kind: kind.into(),
                    version,
                    issue,
                    bytes: metadata.len(),
                });
                files.push(path);
            }
            if scanned % 100 == 0 {
                let _ = app.emit(
                    "viewer-scan",
                    serde_json::json!({"session": session, "scanned": scanned}),
                );
            }
        }
        let mut sessions = state.sessions.lock().map_err(|_| "viewer.read")?;
        if state.generation.load(Ordering::SeqCst) != session {
            return Err("viewer.cancelled".into());
        }
        sessions.insert(session, files);
        assets.sort_by(|left, right| left.path.cmp(&right.path));
        Ok(Catalog {
            session,
            root: root.to_string_lossy().into_owned(),
            assets,
            skipped,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn viewer_release(state: State<'_, ViewerState>) {
    state.generation.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut sessions) = state.sessions.lock() {
        sessions.clear();
    }
}

#[tauri::command]
pub async fn viewer_read(
    state: State<'_, ViewerState>,
    session: u64,
    id: usize,
) -> Result<tauri::ipc::Response, String> {
    let path = state
        .sessions
        .lock()
        .map_err(|_| "viewer.read")?
        .get(&session)
        .and_then(|files| files.get(id))
        .cloned()
        .ok_or("viewer.expired")?;
    tauri::async_runtime::spawn_blocking(move || {
        let verified = checked(&path)?;
        if verified != path {
            return Err("viewer.link".into());
        }
        let metadata = fs::metadata(&verified).map_err(|_| "viewer.read")?;
        if metadata.len() > MAX_FILE {
            return Err("viewer.large".into());
        }
        use std::io::Read;
        let mut data = Vec::new();
        fs::File::open(verified)
            .map_err(|_| "viewer.read")?
            .take(MAX_FILE + 1)
            .read_to_end(&mut data)
            .map_err(|_| "viewer.read")?;
        if data.len() as u64 > MAX_FILE {
            return Err("viewer.large".into());
        }
        Ok(tauri::ipc::Response::new(data))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_legacy_and_modern_headers() {
        assert_eq!(binary_version(b"\x02h\x073.8.99"), Some("3.8.99".into()));
        assert_eq!(
            binary_version(b"\0\0\0\0\0\0\0\0\x074.2.11"),
            Some("4.2.11".into())
        );
        assert_eq!(binary_version(b"\xff\xff"), None);
        assert_eq!(binary_version(b"\0\x06hello"), None);
    }
}
