mod ai;
mod companion;
mod screen;
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
        storage::export(&path, data)?;
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

#[tauri::command]
fn companion_configure(
    window: WebviewWindow,
    app: tauri::AppHandle,
    config: focus_core::companion::Config,
) -> Result<companion::Status, String> {
    authorize(&window)?;
    companion::configure(&app, config)
}
#[tauri::command]
fn companion_install_gnome(window: WebviewWindow, app: tauri::AppHandle) -> Result<String, String> {
    authorize(&window)?;
    companion::install_gnome(&app)
}
#[tauri::command]
fn companion_status(
    window: WebviewWindow,
    app: tauri::AppHandle,
) -> Result<companion::Status, String> {
    companion::authorize_companion(&window)?;
    companion::status(&app)
}
#[tauri::command]
fn companion_action(
    window: WebviewWindow,
    app: tauri::AppHandle,
    action: companion::Action,
) -> Result<(), String> {
    companion::authorize_companion(&window)?;
    companion::action(&app, action)
}
#[tauri::command]
fn companion_expand(
    window: WebviewWindow,
    app: tauri::AppHandle,
    expanded: bool,
) -> Result<(), String> {
    companion::authorize_companion(&window)?;
    companion::expand(&app, expanded)
}
#[tauri::command]
async fn model_capabilities(
    window: WebviewWindow,
    state: State<'_, ai::AiService>,
    port: u16,
    model: String,
) -> Result<ai::Capabilities, String> {
    authorize(&window)?;
    ai::capabilities(&state, port, &model).await
}
#[tauri::command]
async fn screen_start(
    window: WebviewWindow,
    app: tauri::AppHandle,
    port: u16,
    model: String,
    consented: bool,
) -> Result<(), String> {
    authorize(&window)?;
    screen::start(app, port, model, consented).await
}
#[tauri::command]
fn screen_stop(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    authorize(&window)?;
    app.state::<screen::ScreenService>().stop();
    app.state::<ai::AiService>().cancel();
    if let Ok(mut inner) = app.state::<companion::Companion>().inner.lock() {
        inner.message = None;
    }
    Ok(())
}
#[tauri::command]
fn screen_status(
    window: WebviewWindow,
    state: State<screen::ScreenService>,
) -> Result<screen::ScreenStatus, String> {
    authorize(&window)?;
    Ok(state.status())
}
#[tauri::command]
async fn screen_analyze(
    window: WebviewWindow,
    app: tauri::AppHandle,
) -> Result<ai::ScreenAdvice, String> {
    authorize(&window)?;
    screen::analyze(app).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionState::default())
        .manage(storage::StoreGate::default())
        .manage(ai::AiService::new())
        .manage(companion::Companion::default())
        .manage(screen::ScreenService::default())
        .on_window_event(|window, event| {
            let app = window.app_handle();
            if window.label() == "companion" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = companion::action(app, companion::Action::Disable);
                }
            } else if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    app.state::<screen::ScreenService>().stop();
                    app.state::<ai::AiService>().cancel();
                }
                if let tauri::WindowEvent::Destroyed = event {
                    companion::shutdown(app);
                    app.exit(0);
                }
            }
        })
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let ownership = storage::InstanceGuard::acquire(&directory).map_err(|message| {
                app.dialog()
                    .message(&message)
                    .title("Focus could not open this workspace")
                    .blocking_show();
                std::io::Error::other(message)
            })?;
            app.manage(ownership);
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    let state = handle.state::<SessionState>();
                    if let Ok(mut engine) = state.engine.lock() {
                        engine.tick(state.mono(), wall_ms());
                    };
                    if handle.state::<screen::ScreenService>().active() {
                        let running = state
                            .engine
                            .lock()
                            .map(|s| s.snapshot().phase == focus_core::session::Phase::Focus)
                            .unwrap_or(false);
                        if !running {
                            handle.state::<screen::ScreenService>().stop();
                            handle.state::<ai::AiService>().cancel();
                        }
                    }
                    companion::sync_window(&handle);
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
            cancel_chat,
            companion_configure,
            companion_install_gnome,
            companion_status,
            companion_action,
            companion_expand,
            model_capabilities,
            screen_start,
            screen_stop,
            screen_status,
            screen_analyze
        ])
        .build(tauri::generate_context!())
        .expect("could not start Focus")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !app
                    .state::<companion::Companion>()
                    .stopped
                    .load(std::sync::atomic::Ordering::SeqCst)
                {
                    if let Some(main) = app.get_webview_window("main") {
                        api.prevent_exit();
                        app.state::<screen::ScreenService>().stop();
                        app.state::<ai::AiService>().cancel();
                        let _ = main.close(); // Same pause/drain/save/failed-close UI as the window control.
                    }
                }
            }
            tauri::RunEvent::Exit => companion::shutdown(app),
            _ => {}
        });
}
