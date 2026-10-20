use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::State;

const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 50_000;

#[derive(Default, Clone)]
pub struct RiveState {
    generation: Arc<AtomicU64>,
    files: Arc<Mutex<Option<Vec<PathBuf>>>>,
}

#[derive(Serialize)]
pub struct RiveAsset {
    id: usize,
    path: String,
    bytes: u64,
}

fn checked(path: &Path) -> Result<PathBuf, String> {
    crate::viewer::checked(path)
}

#[tauri::command]
pub async fn rive_scan(
    state: State<'_, RiveState>,
    path: String,
) -> Result<Vec<RiveAsset>, String> {
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    {
        let mut current_files = state.files.lock().map_err(|_| "rive.read")?;
        if generation != state.generation.load(Ordering::SeqCst) {
            return Err("rive.expired".into());
        }
        *current_files = None;
    }
    let selected = checked(Path::new(&path))?;
    let (files, assets) = tauri::async_runtime::spawn_blocking(move || {
        let root = if selected.is_dir() {
            selected.clone()
        } else {
            selected.parent().ok_or("rive.read")?.to_path_buf()
        };
        let mut stack = vec![selected];
        let mut files = Vec::new();
        let mut assets = Vec::new();
        let mut visited = 0;
        while let Some(path) = stack.pop() {
            visited += 1;
            if visited > MAX_ENTRIES {
                return Err("rive.limit".to_string());
            }
            if path.is_dir() {
                for child in fs::read_dir(&path).map_err(|_| "rive.read")? {
                    let child = child.map_err(|_| "rive.read")?.path();
                    if checked(&child).is_ok() {
                        stack.push(child);
                    }
                }
            } else if path
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("riv"))
            {
                let bytes = fs::metadata(&path).map_err(|_| "rive.read")?.len();
                if bytes > MAX_FILE {
                    return Err("rive.large".into());
                }
                assets.push(RiveAsset {
                    id: files.len(),
                    path: path
                        .strip_prefix(&root)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .replace('\\', "/"),
                    bytes,
                });
                files.push(path);
            }
        }
        assets.sort_by(|left, right| left.path.cmp(&right.path));
        files.sort_by_key(|path| {
            path.strip_prefix(&root)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/")
        });
        for (id, asset) in assets.iter_mut().enumerate() {
            asset.id = id;
        }
        Ok::<_, String>((files, assets))
    })
    .await
    .map_err(|error| error.to_string())??;
    let mut current_files = state.files.lock().map_err(|_| "rive.read")?;
    if generation != state.generation.load(Ordering::SeqCst) {
        return Err("rive.expired".into());
    }
    *current_files = Some(files);
    Ok(assets)
}

#[tauri::command]
pub async fn rive_read(
    state: State<'_, RiveState>,
    id: usize,
) -> Result<tauri::ipc::Response, String> {
    let path = state
        .files
        .lock()
        .map_err(|_| "rive.read")?
        .as_ref()
        .and_then(|files| files.get(id))
        .cloned()
        .ok_or("rive.expired")?;
    tauri::async_runtime::spawn_blocking(move || {
        let verified = checked(&path)?;
        if verified != path {
            return Err("rive.read".into());
        }
        let metadata = fs::metadata(&verified).map_err(|_| "rive.read")?;
        if metadata.len() > MAX_FILE {
            return Err("rive.large".into());
        }
        let bytes = fs::read(verified).map_err(|_| "rive.read")?;
        if bytes.len() as u64 > MAX_FILE {
            return Err("rive.large".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn rive_export_session(path: String, content: String) -> Result<(), String> {
    if content.len() > 2 * 1024 * 1024 {
        return Err("rive.export".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let destination = Path::new(&path);
        if !destination
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
        {
            return Err("rive.export".into());
        }
        let parent = destination.parent().ok_or("rive.export")?;
        let parent = checked(parent)?;
        let name = destination.file_name().ok_or("rive.export")?;
        let output = parent.join(name);
        if output.exists() {
            checked(&output)?;
        }
        fs::write(output, content).map_err(|_| "rive.export".into())
    })
    .await
    .map_err(|error| error.to_string())?
}
