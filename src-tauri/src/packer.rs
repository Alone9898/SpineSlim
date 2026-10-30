use serde::Serialize;
use std::{fs, io::Write, path::PathBuf, sync::Mutex};
use tauri::State;

#[derive(Default)]
pub struct PackerState(Mutex<(u64, Vec<PathBuf>)>);

#[derive(Serialize)]
pub struct ImageEntry {
    id: usize,
    name: String,
    bytes: u64,
}

#[derive(Serialize)]
pub struct ImageCatalog {
    session: u64,
    files: Vec<ImageEntry>,
}

#[tauri::command]
pub async fn packer_list(
    state: State<'_, PackerState>,
    paths: Vec<String>,
) -> Result<ImageCatalog, String> {
    if paths.is_empty() {
        return Err("empty".into());
    }
    let mut entries = Vec::new();
    let mut files = Vec::new();
    let mut stack = Vec::new();
    for value in paths {
        let path = crate::viewer::checked(&PathBuf::from(value)).map_err(|_| "read")?;
        let root = if path.is_dir() {
            path.clone()
        } else {
            path.parent().ok_or("read")?.to_path_buf()
        };
        stack.push((path, root));
    }
    let mut visited = 0;
    let mut bytes = 0;
    while let Some((path, root)) = stack.pop() {
        visited += 1;
        if visited > 10000 {
            return Err("limit".into());
        }
        let path = crate::viewer::checked(&path).map_err(|_| "read")?;
        if path.is_dir() {
            for child in fs::read_dir(&path).map_err(|_| "read")? {
                stack.push((child.map_err(|_| "read")?.path(), root.clone()));
            }
        } else {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !["png", "jpg", "jpeg", "webp"].contains(&extension.as_str()) {
                continue;
            }
            if files.contains(&path) {
                continue;
            }
            let size = fs::metadata(&path).map_err(|_| "read")?.len();
            bytes += size;
            if files.len() >= 500 || size > 32 * 1024 * 1024 || bytes > 256 * 1024 * 1024 {
                return Err("limit".into());
            }
            entries.push(ImageEntry {
                id: files.len(),
                name: path
                    .strip_prefix(&root)
                    .map_err(|_| "read")?
                    .to_string_lossy()
                    .replace('\\', "/"),
                bytes: size,
            });
            files.push(path);
        }
    }
    if files.is_empty() {
        return Err("empty".into());
    }
    let mut registry = state.0.lock().map_err(|_| "read")?;
    registry.0 += 1;
    registry.1 = files;
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(ImageCatalog {
        session: registry.0,
        files: entries,
    })
}

#[tauri::command]
pub fn packer_read(
    state: State<'_, PackerState>,
    session: u64,
    id: usize,
) -> Result<tauri::ipc::Response, String> {
    let registry = state.0.lock().map_err(|_| "read")?;
    if registry.0 != session {
        return Err("read".into());
    }
    let path = registry.1.get(id).ok_or("read")?;
    let checked = crate::viewer::checked(path).map_err(|_| "read")?;
    if &checked != path || fs::metadata(path).map_err(|_| "read")?.len() > 32 * 1024 * 1024 {
        return Err("limit".into());
    }
    fs::read(path)
        .map(tauri::ipc::Response::new)
        .map_err(|_| "read".into())
}

#[tauri::command]
pub fn packer_read_file(path: String) -> Result<tauri::ipc::Response, String> {
    let path = crate::viewer::checked(&PathBuf::from(path)).map_err(|_| "read")?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !["json", "png"].contains(&extension.as_str()) || !path.is_file() {
        return Err("read".into());
    }
    if fs::metadata(&path).map_err(|_| "read")?.len() > 32 * 1024 * 1024 {
        return Err("limit".into());
    }
    fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|_| "read".into())
}

#[tauri::command]
pub async fn packer_save(target: String, bytes: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = PathBuf::from(target);
        if !target.is_absolute()
            || target
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref()
                != Some("zip")
        {
            return Err("zipPath".to_string());
        }
        if bytes.len() > 256 * 1024 * 1024 || !bytes.starts_with(b"PK\x03\x04") {
            return Err("limit".to_string());
        }
        let parent = target.parent().ok_or("write")?;
        let parent = crate::viewer::checked(parent).map_err(|_| "write")?;
        let temporary = parent.join(format!(
            ".spineslim-atlas-{}-{}.tmp",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "write")?
                .as_nanos()
        ));
        let result = (|| {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| "write")?;
            file.write_all(&bytes).map_err(|_| "write")?;
            file.sync_all().map_err(|_| "write")?;
            drop(file);
            fs::rename(&temporary, &target).map_err(|_| "write")
        })();
        if result.is_err() {
            let _ = fs::remove_file(temporary);
        }
        result.map_err(str::to_string)
    })
    .await
    .map_err(|_| "write".to_string())?
}
