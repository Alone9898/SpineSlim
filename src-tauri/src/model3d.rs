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

const MAX_ENTRIES: usize = 20_000;
const MAX_FILE: u64 = 256 * 1024 * 1024;
const MAX_TOTAL: u64 = 1024 * 1024 * 1024;

#[derive(Default, Clone)]
pub struct ModelState {
    generation: Arc<AtomicU64>,
    files: Arc<Mutex<Option<Vec<PathBuf>>>>,
}

#[derive(Serialize)]
pub struct ModelFile {
    id: usize,
    path: String,
    bytes: u64,
    model: bool,
}

fn is_model(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "glb" | "gltf" | "fbx" | "obj" | "stl"
            )
        })
}

fn is_resource(path: &Path) -> bool {
    is_model(path)
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "mtl" | "bin" | "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif"
                )
            })
}

fn checked(path: &Path) -> Result<PathBuf, String> {
    crate::viewer::checked(path).map_err(|_| "model.read".into())
}

#[tauri::command]
pub async fn model_scan(
    state: State<'_, ModelState>,
    path: String,
) -> Result<Vec<ModelFile>, String> {
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    *state.files.lock().map_err(|_| "model.read")? = None;
    let selected = checked(Path::new(&path))?;
    if selected.is_file() && !is_model(&selected) {
        return Err("model.unsupported".into());
    }
    let (files, assets) = tauri::async_runtime::spawn_blocking(move || {
        let root = if selected.is_dir() {
            selected.clone()
        } else {
            selected.parent().ok_or("model.read")?.to_path_buf()
        };
        let mut stack = vec![root.clone()];
        let mut found = Vec::new();
        let mut visited = 0;
        let mut total = 0u64;
        while let Some(path) = stack.pop() {
            visited += 1;
            if visited > MAX_ENTRIES {
                return Err("model.limit".to_string());
            }
            if path.is_dir() {
                for child in fs::read_dir(&path).map_err(|_| "model.read")? {
                    let child = child.map_err(|_| "model.read")?.path();
                    if checked(&child).is_ok() {
                        stack.push(child);
                    }
                }
            } else if is_resource(&path) {
                let bytes = fs::metadata(&path).map_err(|_| "model.read")?.len();
                if bytes > MAX_FILE {
                    return Err("model.large".into());
                }
                total = total.checked_add(bytes).ok_or("model.limit")?;
                if total > MAX_TOTAL {
                    return Err("model.limit".into());
                }
                let relative = path
                    .strip_prefix(&root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                found.push((relative, path, bytes));
            }
        }
        found.sort_by(|left, right| left.0.cmp(&right.0));
        let mut files = Vec::with_capacity(found.len());
        let mut assets = Vec::with_capacity(found.len());
        for (id, (relative, path, bytes)) in found.into_iter().enumerate() {
            assets.push(ModelFile {
                id,
                path: relative,
                bytes,
                model: is_model(&path),
            });
            files.push(path);
        }
        Ok::<_, String>((files, assets))
    })
    .await
    .map_err(|error| error.to_string())??;
    let mut current = state.files.lock().map_err(|_| "model.read")?;
    if generation != state.generation.load(Ordering::SeqCst) {
        return Err("model.expired".into());
    }
    *current = Some(files);
    Ok(assets)
}

#[tauri::command]
pub async fn model_read(
    state: State<'_, ModelState>,
    id: usize,
) -> Result<tauri::ipc::Response, String> {
    let path = state
        .files
        .lock()
        .map_err(|_| "model.read")?
        .as_ref()
        .and_then(|files| files.get(id))
        .cloned()
        .ok_or("model.expired")?;
    tauri::async_runtime::spawn_blocking(move || {
        if checked(&path)? != path {
            return Err("model.read".into());
        }
        let metadata = fs::metadata(&path).map_err(|_| "model.read")?;
        if metadata.len() > MAX_FILE {
            return Err("model.large".into());
        }
        let bytes = fs::read(path).map_err(|_| "model.read")?;
        if bytes.len() as u64 > MAX_FILE {
            return Err("model.large".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::is_model;
    use std::path::Path;

    #[test]
    fn recognizes_only_supported_model_formats() {
        assert!(is_model(Path::new("scene.GLB")));
        assert!(is_model(Path::new("scene.gltf")));
        assert!(is_model(Path::new("scene.fbx")));
        assert!(is_model(Path::new("scene.obj")));
        assert!(is_model(Path::new("scene.stl")));
        assert!(!is_model(Path::new("scene.blend")));
        assert!(!is_model(Path::new("scene.png")));
    }
}
