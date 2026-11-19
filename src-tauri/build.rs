fn main() {
    let commands = &[
        "runtime_info",
        "load_workspace",
        "save_workspace",
        "export_workspace",
        "session_snapshot",
        "reset_session",
        "start_session",
        "pause_session",
        "resume_session",
        "finish_session",
        "start_break",
        "restore_session",
        "compare_rhythm",
        "ollama_models",
        "ollama_chat",
        "cancel_chat",
    ];
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(commands));
    tauri_build::try_build(attributes).expect("could not configure desktop capabilities");
}
