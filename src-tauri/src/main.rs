#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
mod model3d;
mod packer;
mod model_list;
mod rive;
mod secrets;
mod update;
mod viewer;
mod viewer_export;
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[cfg(windows)]
struct ProcessJob(usize);

#[cfg(windows)]
impl ProcessJob {
    fn attach(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let job = Self(handle as usize);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of_val(&info) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle() as _) == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(job)
        }
    }
    fn stop(&self) {
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0 as _, 1);
        }
    }
}

#[cfg(windows)]
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}

struct ActiveTask {
    id: String,
    input: ChildStdin,
    cancelling: bool,
    committing: bool,
    #[cfg(windows)]
    job: Arc<ProcessJob>,
}

#[derive(Default)]
struct Runtime {
    active: Arc<Mutex<Option<ActiveTask>>>,
}

fn worker_path() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let name = format!(
            "spineslim-worker-{}{}",
            env!("SPINESLIM_TARGET"),
            std::env::consts::EXE_SUFFIX
        );
        Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(name))
    } else {
        Ok(std::env::current_exe()
            .map_err(|error| error.to_string())?
            .parent()
            .ok_or("Missing app folder")?
            .join(format!("spineslim-worker{}", std::env::consts::EXE_SUFFIX)))
    }
}

fn spawn_worker() -> Result<(Child, ChildStdin), String> {
    let mut command = Command::new(worker_path()?);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let input = child.stdin.take().ok_or("No worker input")?;
    Ok((child, input))
}

#[tauri::command]
fn start_task(
    app: tauri::AppHandle,
    runtime: State<Runtime>,
    task_id: String,
    options: Value,
    action: Option<String>,
) -> Result<(), String> {
    let action = action.unwrap_or_else(|| "start".into());
    if !matches!(action.as_str(), "start" | "audit") {
        return Err("invalid_request".into());
    }
    let mut guard = runtime.active.lock().map_err(|error| error.to_string())?;
    if guard.is_some() {
        return Err("A task is already running".into());
    }
    let request =
        json!({"protocol_version": 1, "task_id": task_id, "action": action, "options": options});
    let (mut child, mut input) = spawn_worker()?;
    #[cfg(windows)]
    let job = match ProcessJob::attach(&child) {
        Ok(job) => Arc::new(job),
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let stdout = child.stdout.take().ok_or("No worker output")?;
    writeln!(input, "{}", request).map_err(|error| error.to_string())?;
    *guard = Some(ActiveTask {
        id: task_id.clone(),
        input,
        cancelling: false,
        committing: false,
        #[cfg(windows)]
        job,
    });
    let active = Arc::clone(&runtime.active);
    thread::spawn(move || {
        let mut terminal = None;
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                if event["protocol_version"] != 1 || event["task_id"] != task_id {
                    continue;
                }
                if event["message_key"] == "committing" {
                    if let Ok(mut guard) = active.lock() {
                        if let Some(task) = guard.as_mut() {
                            task.committing = true;
                        }
                    }
                }
                if event["type"] == "finished" {
                    terminal = Some(event);
                } else {
                    let _ = app.emit("worker-event", event);
                }
            }
        }
        let _ = child.wait();
        let mut cancelled = false;
        if let Ok(mut guard) = active.lock() {
            cancelled = guard.as_ref().is_some_and(|task| task.cancelling);
            *guard = None;
        }
        let event = terminal.unwrap_or_else(|| json!({"protocol_version": 1, "task_id": task_id, "type": "finished", "message_key": if cancelled { "cancelled" } else { "worker_exit" }, "params": {"status": if cancelled { "cancelled" } else { "failed" }}}));
        let _ = app.emit("worker-event", event);
    });
    Ok(())
}

#[tauri::command]
fn cancel_task(runtime: State<Runtime>) -> Result<(), String> {
    let mut guard = runtime.active.lock().map_err(|error| error.to_string())?;
    if let Some(task) = guard.as_mut() {
        if task.committing {
            return Err("Output is being committed. Please wait.".into());
        }
        task.cancelling = true;
        writeln!(
            task.input,
            "{}",
            json!({"action": "cancel", "task_id": task.id})
        )
        .map_err(|error| error.to_string())?;
        let active = Arc::clone(&runtime.active);
        let task_id = task.id.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(10));
            if let Ok(guard) = active.lock() {
                if let Some(task) = guard.as_ref() {
                    if task.id == task_id && !task.committing {
                        #[cfg(windows)]
                        task.job.stop();
                    }
                }
            }
        });
    }
    Ok(())
}

#[tauri::command]
async fn inspect_tools(options: Value) -> Result<Value, String> {
    query_worker("inspect", options).await
}

#[tauri::command]
async fn package_stats(options: Value) -> Result<Value, String> {
    query_worker("stats", options).await
}

#[tauri::command]
async fn audio_query(action: String, options: Value) -> Result<Value, String> {
    match action.as_str() {
        "scan" => query_worker("audio_scan", options).await,
        "preview" => query_worker("audio_preview", options).await,
        _ => Err("audio.options".into()),
    }
}

#[tauri::command]
async fn model_query(action: String, options: Value) -> Result<Value, String> {
    match action.as_str() {
        "providers" => query_worker("providers", options).await,
        "validate" => query_worker("validate_model", options).await,
        _ => Err("invalid_request".into()),
    }
}

async fn query_worker(action: &'static str, options: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let request = json!({"protocol_version": 1, "task_id": "query", "action": action, "options": options});
        let (mut child, mut input) = spawn_worker()?;
        #[cfg(windows)]
        let _job = ProcessJob::attach(&child).map_err(|error| { let _ = child.kill(); let _ = child.wait(); error })?;
        writeln!(input, "{}", request).map_err(|error| error.to_string())?;
        drop(input);
        let stdout = child.stdout.take().ok_or("No worker output")?;
        let mut result = Err("Tool inspection failed".to_string());
        for line in BufReader::new(stdout).lines() {
            let line = line.map_err(|error| error.to_string())?;
            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                if event["type"] == "result" { result = Ok(if action == "inspect" { event["params"]["tools"].clone() } else { event["params"].clone() }); }
                if event["type"] == "error" { result = Err(event["message_key"].as_str().unwrap_or("unexpected").to_string()); }
            }
        }
        let _ = child.wait();
        result
    }).await.map_err(|error| error.to_string())?
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("settings.json"))
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Value, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(json!({}));
    }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Value) -> Result<(), String> {
    let path = config_path(&app)?;
    let temporary = path.with_extension("tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&settings).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_settings(path: String) -> Result<Value, String> {
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > 1_000_000 {
        return Err("Configuration is too large".into());
    }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_output(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !path.is_dir() {
        return Err("Not a directory".into());
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn app_directory() -> Result<String, String> {
    Ok(std::env::current_exe()
        .map_err(|error| error.to_string())?
        .parent()
        .ok_or("Missing app folder")?
        .to_string_lossy()
        .to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(Runtime::default())
        .manage(viewer::ViewerState::default())
        .manage(rive::RiveState::default())
        .manage(model3d::ModelState::default())
        .manage(viewer_export::ExportState::default())
        .manage(packer::PackerState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_task,
            cancel_task,
            inspect_tools,
            package_stats,
            audio_query,
            model_query,
            secrets::model_key_status,
            secrets::save_model_key,
            secrets::delete_model_key,
            model_list::fetch_model_list,
            load_settings,
            save_settings,
            import_settings,
            open_output,
            app_directory,
            update::check_update,
            packer::packer_list,
            packer::packer_read,
            packer::packer_save,
            viewer::viewer_scan,
            viewer::viewer_read,
            viewer::viewer_release,
            rive::rive_scan,
            rive::rive_read,
            rive::rive_export_session,
            model3d::model_scan,
            model3d::model_read,
            viewer_export::viewer_export_begin,
            viewer_export::viewer_export_frame,
            viewer_export::viewer_export_finish,
            viewer_export::viewer_export_cancel
        ])
        .run(tauri::generate_context!())
        .expect("Could not start SpineSlim");
}
