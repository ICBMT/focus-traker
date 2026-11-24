//! Narrow desktop companion boundary. The small window and optional GNOME
//! extension can read a redacted timer and request enumerated UI actions only.
//! They cannot load/save a workspace, invoke AI, or obtain a captured frame.
use focus_core::{
    companion::{Config, Policy, Reason},
    session::Phase,
};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Instant;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
pub struct Companion {
    pub inner: Mutex<Inner>,
    pub stopped: Arc<AtomicBool>,
    #[cfg(target_os = "linux")]
    discovery: Mutex<Option<std::path::PathBuf>>,
}
#[derive(Default)]
pub struct Inner {
    pub policy: Policy,
    pub message: Option<String>,
    pub seen: Option<Instant>,
    pub expanded: bool,
}
impl Inner {
    fn connected(&self) -> bool {
        self.seen.is_some_and(|t| t.elapsed().as_secs() < 6)
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Open,
    Rest,
    Talk,
    Pause,
    Resume,
    Snooze,
    Dismiss,
    StopSharing,
    Disable,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    config: Config,
    phase: Phase,
    remaining_ms: u64,
    reason: Option<Reason>,
    screen_sharing: bool,
    gnome_connected: bool,
    placement: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}
pub fn compositor_placed() -> bool {
    cfg!(target_os = "linux") && std::env::var("XDG_SESSION_TYPE").is_ok_and(|v| v == "wayland")
}
pub fn authorize_companion(window: &WebviewWindow) -> Result<(), String> {
    if ["main", "companion"].contains(&window.label()) {
        Ok(())
    } else {
        Err("This window cannot access the companion.".into())
    }
}
pub fn status(app: &tauri::AppHandle) -> Result<Status, String> {
    let session = app.state::<crate::SessionState>();
    let snapshot = session
        .engine
        .lock()
        .map_err(|_| "The timer is unavailable.")?
        .snapshot();
    let sharing = app.state::<crate::screen::ScreenService>().active();
    let state = app.state::<Companion>();
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "The companion is unavailable.")?;
    inner.policy.observe(&snapshot, session.mono());
    if !sharing {
        inner.message = None;
        if inner.policy.reason == Some(Reason::ScreenContext) {
            inner.policy.dismiss();
        }
    }
    Ok(Status {
        config: inner.policy.config.clone(),
        phase: snapshot.phase,
        remaining_ms: snapshot.remaining_ms,
        reason: inner.policy.reason,
        screen_sharing: sharing,
        gnome_connected: inner.connected(),
        placement: if compositor_placed() {
            "compositor"
        } else {
            "requested"
        },
        message: if inner.policy.reason.is_some() {
            inner.message.clone()
        } else {
            None
        },
    })
}
pub fn configure(app: &tauri::AppHandle, config: Config) -> Result<Status, String> {
    let stop_sharing = !config.enabled || config.presentation;
    app.state::<Companion>()
        .inner
        .lock()
        .map_err(|_| "The companion is unavailable.")?
        .policy
        .configure(config)?;
    if stop_sharing {
        app.state::<crate::screen::ScreenService>().stop();
        app.state::<crate::ai::AiService>().cancel();
    }
    #[cfg(target_os = "linux")]
    if !stop_sharing {
        let _ = bridge::start(app);
    }
    sync_window(app);
    status(app)
}
pub fn action(app: &tauri::AppHandle, action: Action) -> Result<(), String> {
    let state = app.state::<Companion>();
    {
        let mut inner = state
            .inner
            .lock()
            .map_err(|_| "The companion is unavailable.")?;
        if !inner.policy.config.enabled && !matches!(action, Action::StopSharing) {
            return Err("The desktop companion is off.".into());
        }
        match action {
            Action::Snooze => inner
                .policy
                .snooze(app.state::<crate::SessionState>().mono()),
            Action::Dismiss | Action::Rest | Action::Talk => {
                inner.policy.dismiss();
                inner.message = None;
            }
            Action::Disable => {
                inner.policy.config.enabled = false;
                inner.policy.dismiss();
            }
            _ => {}
        }
    }
    if matches!(
        action,
        Action::StopSharing | Action::Rest | Action::Talk | Action::Disable
    ) {
        app.state::<crate::screen::ScreenService>().stop();
        app.state::<crate::ai::AiService>().cancel();
        state
            .inner
            .lock()
            .map_err(|_| "The companion is unavailable.")?
            .message = None;
    }
    if matches!(action, Action::Open | Action::Rest | Action::Talk) {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
            let _ = main.unminimize();
            let _ = main.set_focus();
        }
    }
    // The main renderer remains the only persistence/session-command owner.
    app.emit_to("main", "focus:companion-action", action)
        .map_err(|_| "The workspace could not receive that action.")?;
    sync_window(app);
    Ok(())
}
pub fn expand(app: &tauri::AppHandle, expanded: bool) -> Result<(), String> {
    app.state::<Companion>()
        .inner
        .lock()
        .map_err(|_| "The companion is unavailable.")?
        .expanded = expanded;
    sync_window(app);
    Ok(())
}
fn place(window: &WebviewWindow, width: f64, height: f64) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let x = (f64::from(area.position.x) + f64::from(area.size.width)) / scale - width;
        let y = f64::from(area.position.y) / scale + 8.0;
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
    }
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
}
pub fn sync_window(app: &tauri::AppHandle) {
    let Ok(status) = status(app) else {
        return;
    };
    let expanded = app
        .state::<Companion>()
        .inner
        .lock()
        .map(|s| s.expanded)
        .unwrap_or(false);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let visible =
            status.config.enabled && !status.config.presentation && !status.gnome_connected;
        if !visible {
            if let Some(window) = handle.get_webview_window("companion") {
                let _ = window.hide();
            }
            return;
        }
        let compositor = status.placement == "compositor";
        let window = match handle.get_webview_window("companion") {
            Some(window) => window,
            None => {
                let built = WebviewWindowBuilder::new(
                    &handle,
                    "companion",
                    WebviewUrl::App("index.html".into()),
                )
                .title("Focus · compact timer")
                .inner_size(304.0, 300.0)
                .resizable(false)
                .decorations(compositor)
                .always_on_top(true)
                .skip_taskbar(!compositor)
                .focused(false)
                .visible(false)
                .build();
                let Ok(window) = built else {
                    return;
                };
                window
            }
        };
        if !compositor {
            let open = expanded || status.reason.is_some();
            place(
                &window,
                if open { 304.0 } else { 48.0 },
                if open { 300.0 } else { 64.0 },
            );
        }
        let _ = window.show(); // Never focus/activate for an invitation.
    });
}
pub fn install_gnome(app: &tauri::AppHandle) -> Result<String, String> {
    if !cfg!(target_os = "linux") {
        return Err("The GNOME companion is for Linux desktops only.".into());
    }
    let folder = app
        .path()
        .data_dir()
        .map_err(|_| "Your user data directory is unavailable.")?
        .join("gnome-shell/extensions/focus-companion@icbmt");
    if std::fs::symlink_metadata(&folder).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("The extension destination is a symlink; nothing was installed.".into());
    }
    std::fs::create_dir_all(&folder)
        .map_err(|_| "The user extension directory could not be created.")?;
    for (name, content) in [
        ("LICENSE", include_str!("../../LICENSE")),
        (
            "metadata.json",
            include_str!("../../integrations/gnome/focus-companion@icbmt/metadata.json"),
        ),
        (
            "extension.js",
            include_str!("../../integrations/gnome/focus-companion@icbmt/extension.js"),
        ),
        (
            "stylesheet.css",
            include_str!("../../integrations/gnome/focus-companion@icbmt/stylesheet.css"),
        ),
    ] {
        use std::io::Write;
        let mut file = tempfile::NamedTempFile::new_in(&folder)
            .map_err(|_| "Could not stage the extension files.")?;
        file.write_all(content.as_bytes())
            .map_err(|_| "Could not write the extension files.")?;
        file.persist(folder.join(name))
            .map_err(|_| "Could not install the extension files.")?;
    }
    Ok("Installed the bundled files in your user GNOME extensions directory. On Wayland, log out and back in once if GNOME has not discovered the extension. Enable ‘Focus desktop companion’ in GNOME Extensions. Nothing was automatically enabled.".into())
}

pub fn shutdown(app: &tauri::AppHandle) {
    app.state::<crate::screen::ScreenService>().stop();
    let state = app.state::<Companion>();
    state.stopped.store(true, Ordering::SeqCst);
    #[cfg(target_os = "linux")]
    if let Ok(mut file) = state.discovery.lock() {
        if let Some(path) = file.take() {
            let _ = std::fs::remove_file(path);
        }
    }
    if let Some(window) = app.get_webview_window("companion") {
        let _ = window.destroy();
    }
}

#[cfg(target_os = "linux")]
mod bridge {
    use super::*;
    use std::{
        fs,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        os::unix::fs::PermissionsExt,
        time::Duration,
    };
    const FILE: &str = "io.github.icbmt.focustracker-companion.json";
    pub fn start(app: &tauri::AppHandle) -> Result<(), String> {
        let state = app.state::<Companion>();
        let mut discovery = state.discovery.lock().map_err(|_| "Bridge unavailable.")?;
        if discovery.is_some() {
            return Ok(());
        }
        let runtime =
            std::env::var_os("XDG_RUNTIME_DIR").ok_or("No private desktop runtime directory.")?;
        let runtime = std::path::PathBuf::from(runtime);
        let meta = fs::symlink_metadata(&runtime).map_err(|_| "No desktop runtime directory.")?;
        if !meta.is_dir() || meta.file_type().is_symlink() || meta.permissions().mode() & 0o077 != 0
        {
            return Err("The desktop runtime directory must be private.".into());
        }
        let listener =
            TcpListener::bind(("127.0.0.1", 0)).map_err(|_| "Companion bridge could not start.")?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "Bridge unavailable.")?;
        let port = listener
            .local_addr()
            .map_err(|_| "Bridge unavailable.")?
            .port();
        let mut random = [0u8; 32];
        fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut random))
            .map_err(|_| "Secure bridge token unavailable.")?;
        let token: String = random.iter().map(|b| format!("{b:02x}")).collect();
        let path = runtime.join(FILE);
        let mut file = tempfile::NamedTempFile::new_in(&runtime)
            .map_err(|_| "Bridge discovery unavailable.")?;
        let content = serde_json::json!({"version": 1, "port": port, "token": token});
        file.write_all(content.to_string().as_bytes())
            .map_err(|_| "Bridge discovery unavailable.")?;
        file.persist(&path)
            .map_err(|_| "Bridge discovery unavailable.")?;
        *discovery = Some(path);
        let app = app.clone();
        let stopped = state.stopped.clone();
        std::thread::spawn(move || {
            while !stopped.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut socket, peer)) if peer.ip().is_loopback() => {
                        let _ = serve(&app, &mut socket, port, &token);
                    }
                    Ok(_) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(100))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(())
    }
    fn authorized<'a>(header: &'a str, port: u16, token: &str) -> Option<(&'a str, usize)> {
        let mut lines = header.split("\r\n");
        let route = lines.next()?;
        if !["GET /v1/status HTTP/1.1", "POST /v1/action HTTP/1.1"].contains(&route) {
            return None;
        }
        let mut host = None;
        let mut auth = None;
        let mut length = None;
        for line in lines.filter(|s| !s.is_empty()) {
            let (name, value) = line.split_once(':')?;
            let value = value.trim();
            match name.to_ascii_lowercase().as_str() {
                "host" if host.is_none() => host = Some(value),
                "authorization" if auth.is_none() => auth = Some(value),
                "content-length" if length.is_none() => length = Some(value.parse::<usize>().ok()?),
                "host" | "authorization" | "content-length" | "origin" | "transfer-encoding" => {
                    return None
                }
                _ => {}
            }
        }
        if host != Some(format!("127.0.0.1:{port}").as_str())
            || auth != Some(format!("Bearer {token}").as_str())
        {
            return None;
        }
        let length = length.unwrap_or(0);
        if length > 128 || (route.starts_with("GET") && length != 0) {
            return None;
        }
        Some((route, length))
    }
    fn serve(
        app: &tauri::AppHandle,
        socket: &mut TcpStream,
        port: u16,
        token: &str,
    ) -> std::io::Result<()> {
        socket.set_read_timeout(Some(Duration::from_millis(500)))?;
        socket.set_write_timeout(Some(Duration::from_millis(500)))?;
        let mut bytes = Vec::new();
        let end = loop {
            let mut byte = [0];
            socket.read_exact(&mut byte)?;
            bytes.push(byte[0]);
            if bytes.ends_with(b"\r\n\r\n") {
                break bytes.len();
            }
            if bytes.len() >= 4096 {
                return Ok(());
            }
        };
        let (route, length) = match std::str::from_utf8(&bytes)
            .ok()
            .and_then(|s| authorized(s, port, token))
        {
            Some((route, length)) => (route.to_owned(), length),
            None => return Ok(()),
        };
        bytes.resize(end + length, 0);
        socket.read_exact(&mut bytes[end..])?;
        let result = if route.starts_with("GET") {
            if let Ok(mut inner) = app.state::<Companion>().inner.lock() {
                inner.seen = Some(Instant::now());
            }
            status(app)
                .and_then(|v| serde_json::to_string(&v).map_err(|_| "Status unavailable.".into()))
        } else {
            #[derive(Deserialize)]
            #[serde(deny_unknown_fields)]
            struct Request {
                action: Action,
            }
            serde_json::from_slice::<Request>(&bytes[end..])
                .map_err(|_| "Unknown action.".into())
                .and_then(|r| action(app, r.action))
                .map(|_| "{}".to_string())
        };
        let (code, body) = match result {
            Ok(body) => ("200 OK", body),
            Err(_) => ("400 Bad Request", "{}".into()),
        };
        write!(socket, "HTTP/1.1 {code}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len())
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn bridge_rejects_web_origins_rebinding_excess_and_unknown_routes() {
            let good = "GET /v1/status HTTP/1.1\r\nHost: 127.0.0.1:1234\r\nAuthorization: Bearer test\r\n\r\n";
            assert!(authorized(good, 1234, "test").is_some());
            for header in [
                good.replace("127.0.0.1", "evil.invalid"),
                good.replace("test", "wrong"),
                good.replace("\r\n\r\n", "\r\nOrigin: http://evil.invalid\r\n\r\n"),
                good.replace("status", "workspace"),
                good.replace("\r\n\r\n", "\r\nContent-Length: 99999\r\n\r\n"),
            ] {
                assert!(authorized(&header, 1234, "test").is_none());
            }
        }
    }
}
