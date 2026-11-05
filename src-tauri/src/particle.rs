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

const MAX_CONFIG: u64 = 2 * 1024 * 1024;
const MAX_IMAGE: u64 = 32 * 1024 * 1024;
const MAX_ENTRIES: usize = 50_000;
const MAX_ASSETS: usize = 5_000;

#[derive(Default, Clone)]
pub struct ParticleState {
    generation: Arc<AtomicU64>,
    files: Arc<Mutex<Option<Vec<PathBuf>>>>,
}

#[derive(Serialize)]
pub struct ParticleAsset {
    id: usize,
    path: String,
    bytes: u64,
    kind: &'static str,
}

fn checked(path: &Path) -> Result<PathBuf, String> {
    crate::viewer::checked(path)
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

#[tauri::command]
pub async fn particle_scan(
    state: State<'_, ParticleState>,
    path: String,
) -> Result<Vec<ParticleAsset>, String> {
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    *state.files.lock().map_err(|_| "particle.read")? = None;
    let selected = checked(Path::new(&path))?;
    let (files, assets) = tauri::async_runtime::spawn_blocking(move || {
        let root = if selected.is_dir() {
            selected.clone()
        } else {
            selected.parent().ok_or("particle.read")?.to_path_buf()
        };
        let mut stack = vec![root.clone()];
        let mut found: Vec<(String, PathBuf, u64, &'static str)> = Vec::new();
        let mut visited = 0;
        while let Some(path) = stack.pop() {
            visited += 1;
            if visited > MAX_ENTRIES {
                return Err("particle.limit".to_string());
            }
            if path.is_dir() {
                for child in fs::read_dir(&path).map_err(|_| "particle.read")? {
                    let child = child.map_err(|_| "particle.read")?.path();
                    if checked(&child).is_ok() {
                        stack.push(child);
                    }
                }
                continue;
            }
            let bytes = match fs::metadata(&path) {
                Ok(metadata) => metadata.len(),
                Err(_) => continue,
            };
            let kind = match extension(&path).as_str() {
                "json" if bytes <= MAX_CONFIG => {
                    let is_emitter = fs::read_to_string(&path)
                        .map(|text| text.contains("\"behaviors\"") || text.contains("\"lifetime\""))
                        .unwrap_or(false);
                    if is_emitter {
                        "config"
                    } else {
                        continue;
                    }
                }
                "png" | "webp" | "jpg" | "jpeg" | "gif" if bytes <= MAX_IMAGE => "image",
                _ => continue,
            };
            if found.len() >= MAX_ASSETS {
                return Err("particle.limit".to_string());
            }
            let relative = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace("\\", "/");
            found.push((relative, path, bytes, kind));
        }
        found.sort_by(|left, right| left.0.cmp(&right.0));
        let mut files = Vec::new();
        let mut assets = Vec::new();
        for (id, (relative, path, bytes, kind)) in found.into_iter().enumerate() {
            assets.push(ParticleAsset { id, path: relative, bytes, kind });
            files.push(path);
        }
        Ok::<_, String>((files, assets))
    })
    .await
    .map_err(|error| error.to_string())??;
    if generation != state.generation.load(Ordering::SeqCst) {
        return Err("particle.expired".into());
    }
    *state.files.lock().map_err(|_| "particle.read")? = Some(files);
    Ok(assets)
}

#[tauri::command]
pub async fn particle_read(
    state: State<'_, ParticleState>,
    id: usize,
) -> Result<tauri::ipc::Response, String> {
    let path = state
        .files
        .lock()
        .map_err(|_| "particle.read")?
        .as_ref()
        .and_then(|files| files.get(id))
        .cloned()
        .ok_or("particle.expired")?;
    tauri::async_runtime::spawn_blocking(move || {
        let verified = checked(&path)?;
        if verified != path {
            return Err("particle.read".into());
        }
        let bytes = fs::read(verified).map_err(|_| "particle.read")?;
        if bytes.len() as u64 > MAX_IMAGE {
            return Err("particle.read".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn particle_save(path: String, content: String) -> Result<(), String> {
    if content.len() as u64 > MAX_CONFIG {
        return Err("particle.save".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let destination = Path::new(&path);
        if extension(destination) != "json" {
            return Err("particle.save".into());
        }
        let parent = checked(destination.parent().ok_or("particle.save")?)?;
        let output = parent.join(destination.file_name().ok_or("particle.save")?);
        if output.exists() {
            checked(&output)?;
        }
        fs::write(output, content).map_err(|_| "particle.save".into())
    })
    .await
    .map_err(|error| error.to_string())?
}
