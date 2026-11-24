# Native validation checklist

**Status, 2026-11-19: all native device rows are unverified.** Rust core tests and production-browser tests are recorded in [IMPLEMENTATION.md](IMPLEMENTATION.md); they do not pass any real-device gate below. At `1ce3c48`, [run 45375456839](https://github.com/ICBMT/focus-traker/actions/runs/45375456839) passed web and all three native tests/clippy/installer jobs. Five real Linux Tauri/Rust/WebKit smoke checks passed under Xvfb, including disk persistence/reload and a real close-time failed save. These are headless CI results, not physical-device approvals. See [the validated build report](RELEASE_CANDIDATE.md) for downloads.

Linux is the first device-validation priority. Windows and macOS compile/runtime work should happen in the same cycle, not be postponed until every Linux feature is complete. Record failures/degraded features as such; never obtain coverage by elevating input privileges or disabling OS privacy controls.

## Record the environment

Copy this record for every actual run. Leave unavailable facts unknown, not guessed.

```text
Date / build commit:
OS + version / CPU + RAM + graphics:
Linux distro / DE + version / Wayland or X11 / portal versions:
Native WebView version (WebKitGTK / WebView2 / WKWebView):
Camera + keyboard/layout + pointer/trackpad:
Monitor count / scaling / assistive technology:
Rust / Node / packaging format:
Test / steps / expected / observed / pass-fail-degraded / logs:
```

The user’s reference budget is approximately 16 GB RAM without a dedicated GPU. The owner selected Ubuntu/GNOME; the exact version and Wayland/X11 session are still unknown. It is not a benchmark result or a tested minimum specification.

## Current platform ledger

| Target | Source/config | CI test/build | Native launch | Permissions/hardware | Packaged/signed release |
| --- | --- | --- | --- | --- | --- |
| Linux / GNOME Wayland | Present, no global adapter | Ubuntu 24.04 tests/clippy/packages + 5 WebKit/Xvfb checks passed at 1ce3c48 | Headless WebKit flows passed, not a physical GNOME/Wayland session | Not tested | Unsigned deb/AppImage artifacts uploaded; no verified signed release |
| Linux / supporting KDE Wayland | Shared host only | Same Ubuntu CI job, not KDE validation | Not tested | Not tested | No KDE-qualified/signed release |
| Linux / genuine X11 | Shared host only | Same Ubuntu CI job; Xvfb is not device QA | Not tested on a physical X11 session | Not tested | No X11-qualified/signed release |
| Windows / WebView2 | Shared host + icon | Tests/clippy/NSIS job passed at 1ce3c48 | Not tested | Not tested | Unsigned NSIS artifact; no verified signed release |
| macOS / WKWebView | Shared host + usage text/entitlement/icon | Tests/clippy/universal-DMG job passed at 1ce3c48 | Not tested | Not tested | Unsigned universal DMG artifact; no verified signed release |

## 1. Baseline without sensors, AI, or accounts

- [ ] Install exact documented native prerequisites and use the committed npm/Cargo lockfiles.
- [ ] `npm ci`, frontend checks/build, `cargo test --workspace --locked`, and `npm run tauri -- build --no-bundle --ci` pass on each OS.
- [ ] Launch the actual built app, not the web preview; the UI identifies Desktop/Rust.
- [ ] No camera/input/model request occurs at launch, restart, or recovery. No app/remote account is needed.
- [ ] Session start/pause/resume/early finish, natural expiry, voluntary break, and no-break exit work with all optional components absent.
- [ ] Optional garden can close immediately via close button, Escape, and Leave; success is not required. App focus/break timers remain controllable.
- [ ] Short/long sessions, midnight, DST/clock changes, suspend/resume, lock/unlock, minimized view, and a busy UI do not double-count or silently restart a paused session.
- [ ] Recovery stays paused. Deferring the recovery dialog preserves the checkpoint; discarding it is explicit. No sensor or provider permission is restored.
- [ ] Window resize/minimum size, mixed DPI, keyboard-only interaction, screen reader, high contrast/large text, both themes, system theme changes, and reduced motion are usable.
- [ ] The release CSP and local asset/font loading work in each native WebView. Vite development allowances do not loosen the release CSP.

## 2. Local file and data safety

- [ ] Repeated staged writes replace an existing workspace on the platform without truncation; failed writes leave the prior workspace readable.
- [ ] Unix app directory/file modes are 0700/0600; Windows file access follows the expected user app-data ACLs. Check actual device behavior rather than assuming parity.
- [ ] Malformed/unsupported/oversized/unreadable data stays untouched and does not trigger autosave of defaults.
- [ ] History opt-out clears summaries; toggling it on does not resurrect completed live records. Active task recovery storage is disclosed.
- [ ] Export dialog cancel is a no-op; deliberate export omits checkpoint/sensor/chat/credentials and includes the documented task text.
- [ ] Clear history and Delete all stop sessions/tests, invalidate stale writes, and show failures honestly. No stale record returns after restart.
- [ ] Native JSON deserialization rejects unknown fields and invalid snapshots. Old summaries expire without deleting valid current data.
- [ ] Failed close shows one priority dialog even over other modals. Keep open/Escape preserves the workspace; Retry actually saves before closing; Quit without saving requires explicit choice.
- [ ] Rapid exit/force-quit/disk-full/read-only directory cases document actual loss bounds. Do not claim an unimplemented guaranteed flush.
- [ ] Validate the new OS file lock on each platform, including crash/relaunch and a second launch; validate browser Web Lock ownership/secondary read-only tabs and reload transfer. No competing writer may silently overwrite saved data.

## 3. Foreground camera lifecycle only

No **camera** vision model or fatigue/emotion classification is implemented. Optional screen-context vision is separate; see section 7.

- [ ] Without pressing Start camera preview, there is no hardware indicator, permission request, capture stream, or network upload.
- [ ] Grant/deny/revoke on each OS/WebView; missing/busy camera; unplug/end track; late permission result after Stop/page exit.
- [ ] Stop/Pause all/page exit/hidden page stop every video track and clear the element. Returning to the page does not restart capture.
- [ ] Permission text matches actual purpose, microphone is never requested, OS indicators agree with the UI, and no frames reach persistence or AI.
- [ ] Document actual behavior when the native window loses focus, is hidden/minimized, or the OS locks/sleeps. This first slice claims no reliable background capture; hidden operation requires the separate planned spike.
- [ ] Measure CPU/RSS/UI responsiveness and capture dimensions/rate/quality. Current 640×480/15 fps requests are hints, not observed output guarantees.

## 4. Input experiment and future interaction-style work

- [ ] Own-pad typing counts only while events target that pad; other apps, password fields, and other UI are not observed. No global hook/device capture permission is requested.
- [ ] Characters/raw event arrays/window titles/coordinates/paths are absent from logs, files, export, and AI payloads. Optional editing/pointer counts are separate deliberate choices.
- [ ] Stopping, page exit, hidden page, Pause all, and changing the test context discard summaries/sample as documented; stale async results cannot revive a test.
- [ ] Native IPC accepts integer observation milliseconds and parity fixtures agree. Invalid/weak/missing samples remain unknown.
- [ ] Label steady/similar as resemblance only; changed has unknown cause. Never substitute sensor labels for voluntary boredom/mood/in-the-zone reports.
- [ ] Global idle/style adapters, richer pointer features, retention, and adaptive suggestions remain unavailable until their platform, consent, privacy, and field-validation gates pass.

## 5. Explicit Ollama path

- [ ] No discovery/generation until explicit action or the separate screen-context automatic-sharing grant; hosted preview never attempts the viewer’s localhost.
- [ ] Confirm real server/model versions, model license, no-cloud configuration, and actual routing. A loopback URL or filtered model name is not sufficient evidence.
- [ ] Test unavailable server, invalid port, no installed models, cloud-tag exclusion, slow/non-JSON/oversized responses, cancellation, and repeated send/stop.
- [ ] Text chat receives only deliberately supplied chat plus optional task context; no sensors, history, tools, API keys, proxy, redirects, or remote fallback.
- [ ] Measure CPU-only RAM/latency alongside the desktop app on reference hardware. Request timeout is not a speed benchmark. Document continued server generation after client cancel where observed.

## 6. Notifications and release gates

- [ ] Sandbox examples are visibly synthetic, volatile, explainable, and never mistaken for intercepted OS traffic.
- [ ] No claim of real suppression, source integration, global glow, idle sensing, or OS-lock control is made in UI/release notes.
- [ ] A future real source first proves authorization and delivery ownership; uncertain relevance and urgent handling retain conservative fallbacks.
- [ ] MIT licensing and signed-public distribution are selected. Complete dependency/system-library/model-license review and test installer/signing/notarization separately. The updater remains disabled. CI executable compilation is not a signed release.

For camera/interaction-style effectiveness and long-session evaluation, continue the full gates in [ROADMAP.md](ROADMAP.md), [INPUT_RHYTHM.md](INPUT_RHYTHM.md), and [PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md). This checklist cannot be marked passed from synthetic input, browser screenshots, or source inspection alone.

## 7. Desktop companion / screen-context feature gate (not physically checked)

Use the full scenarios and exact dependencies in [DESKTOP_COMPANION.md](DESKTOP_COMPANION.md).

- [ ] Record exact Ubuntu/GNOME/Wayland versions; install/enable/disconnect/uninstall the user-level extension. Verify actual corner hover/animation, no hidden input-catching region, primary/secondary monitors, DPI, lock, overview/fullscreen and keyboard/screen-reader navigation. A decorated compact-window fallback must make unsupported placement explicit.
- [ ] Native companion mounts no workspace; denied main-only IPC, no competing JSON writers, no focus stealing on invitation, no forced break, capped/snoozable reminders, presentation shutdown, and immediate game/chat/rest exit. Closing main removes both windows and the private bridge/discovery file without bypassing failed-save controls.
- [ ] Screen mode is off every launch; no Python worker/portal/model request before separate agreement. Validate dependency errors, text-only/remote model rejection, chooser grant/deny/cancel/revoke, selected-window closure, stream error, helper crash, lock/sleep, model/session changes, late grants/replies, parent exit, and manual stop. No silent capture fallback.
- [ ] Inspect actual live share + 960×540 latest-frame processing + at-most-90-second model cadence. No audio or source-title/credentials/history scraping. Confirm captions/images/grants remain absent from saved data, exports and intentional logs; server logs/routing must be checked separately.
- [ ] Live vision quality, prompt injection, sensitive content, false suggestions, unknown states, one-hour cap, CPU/RAM/latency on the 16 GB CPU-only reference; compare usefulness with timer-only mode before promoting automatic screen advice.
- [ ] Windows/macOS compile/package and native timer/rest/chat regression. Screen context must explicitly say unavailable there; no portability claim from a Chromium browser API.
