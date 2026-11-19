mod ai;
mod storage;

use focus_core::{
    rhythm,
    session::{SessionEngine, Snapshot, StartOptions},
};
use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

struct SessionState {
    engine: Mutex<SessionEngine>,
    origin: Instant,
}
impl Default for SessionState {
    fn default() -> Self {
        Self {
            engine: Mutex::new(SessionEngine::default()),
            origin: Instant::now(),
        }
    }
}
impl SessionState {
    fn mono(&self) -> u64 {
        self.origin.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
    }
}
pub(crate) fn wall_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}
fn authorize(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("This window is not authorized for this operation.".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    kind: &'static str,
    engine: &'static str,
    platform: &'static str,
    session_type: String,
}
#[tauri::command]
fn runtime_info(window: WebviewWindow) -> Result<RuntimeInfo, String> {
    authorize(&window)?;
    let session_type = std::env::var("XDG_SESSION_TYPE")
        .unwrap_or_else(|_| "unverified".into())
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(32)
        .collect();
    Ok(RuntimeInfo {
        kind: "desktop",
        engine: "rust",
        platform: std::env::consts::OS,
        session_type,
    })
}
#[tauri::command]
fn session_snapshot(window: WebviewWindow, state: State<SessionState>) -> Result<Snapshot, String> {
    authorize(&window)?;
    let mut engine = state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?;
    engine.tick(state.mono(), wall_ms());
    Ok(engine.snapshot())
}
#[tauri::command]
fn start_session(
    window: WebviewWindow,
    state: State<SessionState>,
    options: StartOptions,
) -> Result<Snapshot, String> {
    authorize(&window)?;
    state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?
        .start(options, state.mono(), wall_ms())
}
#[tauri::command]
fn reset_session(window: WebviewWindow, state: State<SessionState>) -> Result<Snapshot, String> {
    authorize(&window)?;
    Ok(state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?
        .reset())
}
#[tauri::command]
fn pause_session(window: WebviewWindow, state: State<SessionState>) -> Result<Snapshot, String> {
    authorize(&window)?;
    Ok(state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?
        .pause(state.mono(), wall_ms()))
}
#[tauri::command]
fn resume_session(window: WebviewWindow, state: State<SessionState>) -> Result<Snapshot, String> {
    authorize(&window)?;
    Ok(state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?
        .resume(state.mono(), wall_ms()))
}
#[tauri::command]
fn finish_session(window: WebviewWindow, state: State<SessionState>) -> Result<Snapshot, String> {
    authorize(&window)?;
    Ok(state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?
        .finish(state.mono(), wall_ms()))
}
#[tauri::command]
fn start_break(
    window: WebviewWindow,
    state: State<SessionState>,
    id: String,
    duration_ms: u64,
) -> Result<Snapshot, String> {
    authorize(&window)?;
    state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?
        .start_break(id, duration_ms, state.mono(), wall_ms())
}
#[tauri::command]
fn restore_session(
    window: WebviewWindow,
    state: State<SessionState>,
    snapshot: Snapshot,
) -> Result<Snapshot, String> {
    authorize(&window)?;
    state
        .engine
        .lock()
        .map_err(|_| "The session engine is unavailable.")?
        .restore(snapshot, state.mono(), wall_ms())
}
#[tauri::command]
fn compare_rhythm(
    window: WebviewWindow,
    summary: rhythm::Summary,
    baseline: Option<[f64; 5]>,
) -> Result<rhythm::Comparison, String> {
    authorize(&window)?;
    Ok(rhythm::compare(&summary, baseline))
}
#[tauri::command]
fn load_workspace(
    window: WebviewWindow,
    app: tauri::AppHandle,
    gate: State<storage::StoreGate>,
) -> Result<storage::Workspace, String> {
    authorize(&window)?;
    let _guard = gate.0.lock().map_err(|_| "Local storage is busy.")?;
    storage::load(&app)
}
#[tauri::command]
fn save_workspace(
    window: WebviewWindow,
    app: tauri::AppHandle,
    gate: State<storage::StoreGate>,
    data: storage::Workspace,
) -> Result<(), String> {
    authorize(&window)?;
    let _guard = gate.0.lock().map_err(|_| "Local storage is busy.")?;
    storage::save(&app, data)
}
#[tauri::command]
async fn export_workspace(
    window: WebviewWindow,
    app: tauri::AppHandle,
    mut data: storage::Workspace,
) -> Result<Option<String>, String> {
    authorize(&window)?;
    data.validate(wall_ms())?;
    data.checkpoint = None;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(destination) = app.dialog().file().set_title("Export Focus workspace").set_file_name("focus-workspace.json").add_filter("JSON workspace", &["json"]).blocking_save_file() else { return Ok(None); };
        let path = destination.into_path().map_err(|_| "Choose a local export file.")?;
        let bytes = serde_json::to_vec_pretty(&data).map_err(|_| "The export could not be prepared.")?;
        std::fs::write(&path, bytes).map_err(|_| "The export could not be written.")?;
        Ok(Some("Workspace exported. Exports contain task text and session summaries; keep this file private.".into()))
    }).await.map_err(|_| "The export dialog could not be opened.")?
}
#[tauri::command]
async fn ollama_models(
    window: WebviewWindow,
    state: State<'_, ai::AiService>,
    port: u16,
) -> Result<Vec<ai::Model>, String> {
    authorize(&window)?;
    ai::models(&state, port).await
}
#[tauri::command]
async fn ollama_chat(
    window: WebviewWindow,
    state: State<'_, ai::AiService>,
    port: u16,
    model: String,
    messages: Vec<ai::Message>,
    task: Option<String>,
) -> Result<String, String> {
    authorize(&window)?;
    ai::chat(&state, port, model, messages, task).await
}
#[tauri::command]
fn cancel_chat(window: WebviewWindow, state: State<ai::AiService>) -> Result<(), String> {
    authorize(&window)?;
    state.cancel();
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionState::default())
        .manage(storage::StoreGate::default())
        .manage(ai::AiService::new().expect("could not initialize the local model client"))
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    let state = handle.state::<SessionState>();
                    if let Ok(mut engine) = state.engine.lock() {
                        engine.tick(state.mono(), wall_ms());
                    };
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            reset_session,
            session_snapshot,
            start_session,
            pause_session,
            resume_session,
            finish_session,
            start_break,
            restore_session,
            compare_rhythm,
            load_workspace,
            save_workspace,
            export_workspace,
            ollama_models,
            ollama_chat,
            cancel_chat
        ])
        .run(tauri::generate_context!())
        .expect("could not start Focus");
}
