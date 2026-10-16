use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::State;

static NEXT: AtomicU64 = AtomicU64::new(1);

struct Job {
    id: u64,
    folder: PathBuf,
    target: PathBuf,
    ffmpeg: PathBuf,
    format: String,
    fps: u32,
    frames: u32,
    received: u32,
    bytes: usize,
    child: Option<Child>,
    #[cfg(windows)]
    process_job: Option<crate::ProcessJob>,
}

impl Drop for Job {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = fs::remove_dir_all(&self.folder);
    }
}

#[derive(Default, Clone)]
pub struct ExportState(Arc<Mutex<Option<Job>>>);

#[derive(Serialize)]
pub struct ExportStarted {
    id: u64,
}

fn encoder(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let settings = crate::load_settings(app.clone())?;
    if let Some(path) = settings["tools"]["ffmpeg"]
        .as_str()
        .filter(|path| !path.is_empty())
    {
        if PathBuf::from(path).is_file() {
            return Ok(PathBuf::from(path));
        }
    }
    let filename = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let root = PathBuf::from(crate::app_directory()?);
    let mut paths = vec![root.join("tools").join("ffmpeg").join(filename), root.join(filename)];
    if let Some(environment) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&environment).map(|path| path.join(filename)));
    }
    paths
        .into_iter()
        .find(|path| path.is_file())
        .ok_or("export.ffmpeg".into())
}

#[tauri::command]
pub fn viewer_export_begin(
    app: tauri::AppHandle,
    state: State<'_, ExportState>,
    target: String,
    format: String,
    fps: u32,
    frames: u32,
) -> Result<ExportStarted, String> {
    if !["gif", "mp4"].contains(&format.as_str())
        || ![15, 24, 30, 60].contains(&fps)
        || frames == 0
        || frames > 1800
    {
        return Err("export.options".into());
    }
    let target = PathBuf::from(target);
    if !target.is_absolute()
        || target
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
            != Some(&format)
    {
        return Err("export.options".into());
    }
    let ffmpeg = encoder(&app)?;
    let mut guard = state.0.lock().map_err(|_| "export.failed")?;
    if guard.is_some() {
        return Err("export.busy".into());
    }
    let id = NEXT.fetch_add(1, Ordering::SeqCst);
    let parent = target.parent().ok_or("export.options")?;
    let folder = parent.join(format!(".spineslim-export-{}-{}", std::process::id(), id));
    fs::create_dir(&folder).map_err(|error| format!("export.write|{error}"))?;
    *guard = Some(Job {
        id,
        folder,
        target,
        ffmpeg,
        format,
        fps,
        frames,
        received: 0,
        bytes: 0,
        child: None,
        #[cfg(windows)]
        process_job: None,
    });
    Ok(ExportStarted { id })
}

#[tauri::command]
pub async fn viewer_export_frame(
    state: State<'_, ExportState>,
    id: u64,
    index: u32,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = state.0.lock().map_err(|_| "export.failed")?;
        let job = guard
            .as_mut()
            .filter(|job| job.id == id)
            .ok_or("export.cancelled")?;
        if index != job.received
            || index >= job.frames
            || job.child.is_some()
            || bytes.len() > 16 * 1024 * 1024
            || job.bytes + bytes.len() > 1024 * 1024 * 1024
            || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        {
            return Err("export.options".into());
        }
        fs::write(job.folder.join(format!("{index:06}.png")), &bytes)
            .map_err(|error| format!("export.write|{error}"))?;
        job.received += 1;
        job.bytes += bytes.len();
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn viewer_export_cancel(state: State<'_, ExportState>, id: u64) {
    if let Ok(mut guard) = state.0.lock() {
        if guard.as_ref().is_some_and(|job| job.id == id) {
            guard.take();
        }
    }
}

#[tauri::command]
pub async fn viewer_export_finish(
    state: State<'_, ExportState>,
    id: u64,
) -> Result<String, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (output, log) = {
            let mut guard = state.0.lock().map_err(|_| "export.failed")?;
            let job = guard.as_mut().filter(|job| job.id == id).ok_or("export.cancelled")?;
            if job.received != job.frames || job.child.is_some() { return Err("export.options".into()); }
            let output = job.folder.join(format!("result.{}", job.format));
            let log = job.folder.join("encoder.log");
            let mut command = Command::new(&job.ffmpeg);
            command.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-framerate", &job.fps.to_string(), "-i"])
                .arg(job.folder.join("%06d.png"));
            if job.format == "gif" {
                command.args(["-filter_complex", "[0:v]split[palette_source][frames];[palette_source]palettegen=reserve_transparent=1[palette];[frames][palette]paletteuse=dither=sierra2_4a:alpha_threshold=128", "-loop", "0"]);
            } else {
                command.args(["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
            }
            command.arg(&output).stdin(Stdio::null()).stdout(Stdio::null()).stderr(fs::File::create(&log).map_err(|error| format!("export.write|{error}"))?);
            #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
            let mut child = command.spawn().map_err(|error| format!("export.ffmpeg|{error}"))?;
            #[cfg(windows)] {
                job.process_job = Some(crate::ProcessJob::attach(&child).map_err(|error| { let _ = child.kill(); let _ = child.wait(); error })?);
            }
            job.child = Some(child);
            (output, log)
        };
        let deadline = std::time::Instant::now() + Duration::from_secs(600);
        loop {
            {
                let mut guard = state.0.lock().map_err(|_| "export.failed")?;
                let job = guard.as_mut().filter(|job| job.id == id).ok_or("export.cancelled")?;
                let status = job.child.as_mut().ok_or("export.failed")?.try_wait().map_err(|error| format!("export.failed|{error}"))?;
                if let Some(status) = status {
                    if !status.success() {
                        let mut detail = String::new();
                        if let Ok(file) = fs::File::open(&log) { let _ = file.take(8192).read_to_string(&mut detail); }
                        guard.take(); return Err(format!("export.failed|{detail}"));
                    }
                    if fs::metadata(&output).map(|metadata| metadata.len()).unwrap_or(0) == 0 { guard.take(); return Err("export.failed".into()); }
                    let destination = job.target.to_string_lossy().into_owned();
                    let result = fs::rename(&output, &job.target).map_err(|error| format!("export.write|{error}"));
                    guard.take(); result?; return Ok(destination);
                }
                if std::time::Instant::now() >= deadline { guard.take(); return Err("export.timeout".into()); }
            }
            std::thread::sleep(Duration::from_millis(80));
        }
    }).await.map_err(|error| error.to_string())?
}
