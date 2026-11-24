//! Linux portal/PipeWire capture is isolated in a bundled, no-network worker.
//! Frames never cross into a webview and are never persisted. Opt-in is volatile
//! and tied to one verified model, one work session, and one portal selection.
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{path::BaseDirectory, Manager};

const MAX_FRAME: u64 = 800_100;
#[derive(Default)]
pub struct ScreenService {
    live: Mutex<Option<Arc<Worker>>>,
    epoch: AtomicU64,
    sharing: AtomicBool,
}
struct Worker {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    replies: Mutex<mpsc::Receiver<Result<Reply, String>>>,
    port: u16,
    model: String,
    session_id: Option<String>,
    epoch: u64,
    last_frame: Mutex<Option<Instant>>,
}
impl Drop for Worker {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    ready: Option<bool>,
    jpeg: Option<String>,
    error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenStatus {
    pub supported: bool,
    pub active: bool,
    pub starting: bool,
}
impl ScreenService {
    pub fn active(&self) -> bool {
        if !self.sharing.load(Ordering::SeqCst) {
            return false;
        }
        let running = self
            .live
            .lock()
            .ok()
            .and_then(|live| {
                live.as_ref().map(|w| {
                    w.child
                        .lock()
                        .map(|mut c| matches!(c.try_wait(), Ok(None)))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        if !running {
            self.stop();
        }
        running
    }
    pub fn status(&self) -> ScreenStatus {
        let active = self.active();
        let starting = !active && self.live.lock().map(|live| live.is_some()).unwrap_or(false);
        ScreenStatus {
            supported: cfg!(target_os = "linux"),
            active,
            starting,
        }
    }
    pub fn stop(&self) {
        self.epoch.fetch_add(1, Ordering::SeqCst);
        self.sharing.store(false, Ordering::SeqCst);
        if let Ok(mut live) = self.live.lock() {
            if let Some(worker) = live.take() {
                if let Ok(mut child) = worker.child.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }
    fn begin(
        &self,
        app: &tauri::AppHandle,
        port: u16,
        model: String,
        ticket: u64,
        expected_session: Option<String>,
    ) -> Result<(), String> {
        if !cfg!(target_os = "linux") {
            return Err("Automatic screen context currently requires Linux portal/PipeWire support. The timer and rest space work without it.".into());
        }
        let resource = app
            .path()
            .resolve("screen_portal.py", BaseDirectory::Resource)
            .map_err(|_| "The screen-sharing worker is missing from this installation.")?;
        let mut live = self
            .live
            .lock()
            .map_err(|_| "Screen sharing is unavailable.")?;
        if self.epoch.load(Ordering::SeqCst) != ticket {
            return Err("Screen sharing was stopped.".into());
        }
        if companion_phase(app)? != focus_core::session::Phase::Focus {
            return Err("The work session is no longer running.".into());
        }
        let session_id = app
            .state::<crate::SessionState>()
            .engine
            .lock()
            .map_err(|_| "The timer is unavailable.")?
            .snapshot()
            .id;
        if session_id != expected_session {
            return Err("The approved work session has changed. Choose a source again.".into());
        }
        if live.is_some() {
            return Err("Stop the existing screen share before starting another.".into());
        }
        let mut child = Command::new("/usr/bin/python3").args(["-I", "-u"]).arg(resource)
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
            .spawn().map_err(|_| "Screen context needs /usr/bin/python3 and the optional portal/PipeWire dependencies. See Desktop integration setup.")?;
        let stdin = child
            .stdin
            .take()
            .ok_or("The capture worker could not start.")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("The capture worker could not start.")?;
        let (tx, rx) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = String::new();
                let result = (&mut reader).take(MAX_FRAME + 1).read_line(&mut line);
                if !matches!(result, Ok(n) if n > 0 && n as u64 <= MAX_FRAME)
                    || !line.ends_with('\n')
                {
                    let _ = tx.send(Err(
                        "Screen sharing ended. Choose a source again to resume.".into(),
                    ));
                    break;
                }
                let reply = serde_json::from_str::<Reply>(&line)
                    .map_err(|_| "The screen-sharing worker returned an invalid response.".into());
                if tx.send(reply).is_err() {
                    break;
                }
            }
        });
        let epoch = ticket;
        let worker = Arc::new(Worker {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            replies: Mutex::new(rx),
            port,
            model,
            session_id,
            epoch,
            last_frame: Mutex::new(None),
        });
        *live = Some(worker.clone());
        drop(live);
        let result = worker.reply(Duration::from_secs(125)).and_then(|reply| {
            if reply.ready == Some(true) {
                Ok(())
            } else {
                Err(worker_error(reply.error.as_deref()))
            }
        });
        if self.epoch.load(Ordering::SeqCst) != epoch {
            return Err("Screen sharing was stopped.".into());
        }
        match result {
            Ok(()) => {
                self.sharing.store(true, Ordering::SeqCst);
                Ok(())
            }
            Err(error) => {
                self.stop();
                Err(error)
            }
        }
    }
}
impl Worker {
    fn reply(&self, timeout: Duration) -> Result<Reply, String> {
        self.replies
            .lock()
            .map_err(|_| "Screen sharing is unavailable.")?
            .recv_timeout(timeout)
            .map_err(|_| {
                "The screen chooser or stream timed out. Nothing was shared with a model."
                    .to_string()
            })?
    }
    fn frame(&self) -> Result<String, String> {
        self.stdin
            .lock()
            .map_err(|_| "The screen stream ended.")?
            .write_all(b"frame\n")
            .map_err(|_| "The screen stream ended.")?;
        let reply = self.reply(Duration::from_secs(5))?;
        reply
            .jpeg
            .filter(|s| valid_frame(s))
            .ok_or_else(|| worker_error(reply.error.as_deref()))
    }
}
fn worker_error(code: Option<&str>) -> String {
    match code {
        Some("dependencies") => "Screen context needs Python GI, GStreamer, the PipeWire source and JPEG encoder. See Desktop integration setup; no capture has started.",
        _ => "Screen sharing was declined, closed, or is unavailable. Check the desktop portal/PipeWire setup and choose a source again. No fallback capture was used.",
    }.into()
}
fn valid_frame(frame: &str) -> bool {
    frame.len() >= 16
        && frame.len() <= 800_000
        && frame.starts_with("/9j/")
        && frame
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b))
}
pub async fn start(
    app: tauri::AppHandle,
    port: u16,
    model: String,
    consented: bool,
) -> Result<(), String> {
    if !consented {
        return Err(
            "Screen context requires separate, explicit consent and the system chooser.".into(),
        );
    }
    let ticket = app.state::<ScreenService>().epoch.load(Ordering::SeqCst);
    let expected_session = app
        .state::<crate::SessionState>()
        .engine
        .lock()
        .map_err(|_| "The timer is unavailable.")?
        .snapshot()
        .id;
    // Never request a portal dialog without an enabled, visible sharing control.
    let allowed = app
        .state::<crate::companion::Companion>()
        .inner
        .lock()
        .map(|s| s.policy.config.enabled && !s.policy.config.presentation)
        .unwrap_or(false);
    if !allowed || companion_phase(&app)? != focus_core::session::Phase::Focus {
        return Err(
            "Enable the desktop timer and start a work session before sharing a screen.".into(),
        );
    }
    let capabilities =
        crate::ai::capabilities(&app.state::<crate::ai::AiService>(), port, &model).await?;
    if !capabilities.vision {
        return Err("This model does not advertise vision support. Choose an installed vision-capable model; nothing was captured.".into());
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        handle
            .state::<ScreenService>()
            .begin(&handle, port, model, ticket, expected_session)
    })
    .await
    .map_err(|_| "Screen sharing could not start.")?
}
fn companion_phase(app: &tauri::AppHandle) -> Result<focus_core::session::Phase, String> {
    app.state::<crate::SessionState>()
        .engine
        .lock()
        .map(|s| s.snapshot().phase)
        .map_err(|_| "The timer is unavailable.".into())
}
pub async fn analyze(app: tauri::AppHandle) -> Result<crate::ai::ScreenAdvice, String> {
    let service = app.state::<ScreenService>();
    if !service.active() || companion_phase(&app)? != focus_core::session::Phase::Focus {
        return Err(
            "Screen context is paused. It is only sampled during an opted-in work session.".into(),
        );
    }
    let worker = service
        .live
        .lock()
        .map_err(|_| "Screen sharing is unavailable.")?
        .clone()
        .ok_or("Screen sharing is off.")?;
    if app.state::<crate::ai::AiService>().is_busy() {
        return Err("A conversation is running; automatic screen context waits.".into());
    }
    {
        let mut last = worker
            .last_frame
            .lock()
            .map_err(|_| "Screen context is unavailable.")?;
        if last.is_some_and(|t| t.elapsed() < Duration::from_secs(90)) {
            return Err("Screen context is sampled at most once every 90 seconds.".into());
        }
        *last = Some(Instant::now());
    }
    let snapshot = app
        .state::<crate::SessionState>()
        .engine
        .lock()
        .map_err(|_| "The timer is unavailable.")?
        .snapshot();
    if snapshot.id != worker.session_id {
        service.stop();
        return Err("The shared work session has ended. Choose a source again to resume.".into());
    }
    let cancellation = app.state::<crate::ai::AiService>().cancellation();
    let source = worker.clone();
    let image = tauri::async_runtime::spawn_blocking(move || source.frame())
        .await
        .map_err(|_| "The screen stream ended.")??;
    if service.epoch.load(Ordering::SeqCst) != worker.epoch {
        return Err("Screen sharing was stopped.".into());
    }
    let result = crate::ai::screen_advice(
        &app.state::<crate::ai::AiService>(),
        worker.port,
        &worker.model,
        image,
        cancellation,
    )
    .await?;
    if service.epoch.load(Ordering::SeqCst) != worker.epoch
        || !service.active()
        || companion_phase(&app)? != focus_core::session::Phase::Focus
    {
        return Err("Screen sharing was stopped; the late response was discarded.".into());
    }
    let snapshot = app
        .state::<crate::SessionState>()
        .engine
        .lock()
        .map_err(|_| "The timer is unavailable.")?
        .snapshot();
    let companion = app.state::<crate::companion::Companion>();
    let mut inner = companion
        .inner
        .lock()
        .map_err(|_| "The companion is unavailable.")?;
    if service.epoch.load(Ordering::SeqCst) != worker.epoch {
        return Err("Screen sharing was stopped.".into());
    }
    inner.policy.advice(
        result.suggest_break,
        &snapshot,
        app.state::<crate::SessionState>().mono(),
    );
    inner.message = Some(result.message.clone());
    drop(inner);
    crate::companion::sync_window(&app);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_raw_excess_and_malformed_frames() {
        assert!(!valid_frame("private raw pixels"));
        assert!(!valid_frame(&format!("/9j/{}", "a".repeat(800000))));
        assert!(!valid_frame("/9j/aaaaaaaa<script>"));
        assert!(valid_frame("/9j/aaaaaaaaaaaa"));
        assert!(!ScreenService::default().active());
    }
}
