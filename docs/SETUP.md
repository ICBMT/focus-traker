# First-run setup

Focus now opens a five-step walkthrough before the first timer in an eligible, writable workspace. **The timer works without any camera, screen, AI, global-input, or account permission.** Setup is optional, not an “allow everything” gate.

## The five steps

1. **Your rhythm** — choose default focus/break durations, a daily intention, appearance, session-history retention, and reduced motion. Existing preferences are retained when upgrading. Turning history off clears saved summaries, just as in Preferences; a paused-session checkpoint may still be saved. Task text is local plaintext, not encrypted by Focus.
2. **Desktop timer** — opt into the corner timer, gentle invitations, and their interval; review focus protection. Linux users can review and explicitly install the bundled user-level GNOME extension. Installation does not enable it, request administrator access, or configure autostart. Enable it yourself in GNOME Extensions; on Wayland, log out/back in if it is not listed. Unsupported positioning keeps the movable compact-window fallback. The browser preview is in-page only.
3. **Your companion** — keep offline guidance, or deliberately acknowledge server-routing risks and discover installed Ollama models in the native app. Choose the port and model. Nothing is downloaded. This is a launch-local connection, not persistent model consent, and discovery does not benchmark generation or establish vision support. The browser never calls the viewer’s localhost.
4. **Permissions** — review the actual inventory below. Optionally test camera access after its own checkbox and button. On Linux, review screen-sharing prerequisites; if the desktop timer and model connection are configured, choose a one-time shortcut to the screen-sharing controls **after** starting the first timer. The shortcut is navigation only, not capture consent.
5. **Ready to focus** — review ordinary settings and the honest off/unavailable/not-tested states. **Set my first timer** opens the regular intention/duration form using the defaults you chose. Work starts only after **Begin session**. If a session is already active during a manually reopened setup, the action returns to that timer instead of replacing or resuming it.

You can go Back without losing the ordinary preferences you chose. Earlier step buttons are keyboard-accessible. The walkthrough supports both themes, reduced motion, narrow screens, and the existing focus-trapped dialog/priority save-failure system.

## Permission inventory

| Feature                                                    | What setup actually does                                                                                                                                                       | Can it stay off?                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Timer, breaks, garden, offline guidance                    | No sensitive OS access, account, or network request                                                                                                                            | Always available without extra permission                                 |
| Local workspace                                            | Uses existing browser storage or OS app-data storage; no full-disk permission                                                                                                  | Read-only/temporary mode remains usable without overwriting existing data |
| Desktop timer                                              | Saves an ordinary opt-in preference; explains compositor restrictions                                                                                                          | Yes                                                                       |
| GNOME extension files                                      | Separate confirmation before copying bundled user-level files; activation remains manual                                                                                       | Yes; compact-window fallback remains                                      |
| Local model                                                | Explicit routing acknowledgement and discovery action; numeric loopback only in the native host                                                                                | Yes; offline guidance remains                                             |
| Screen context                                             | **No capture request or grant during setup.** Existing warning/model checks and the OS source chooser run only when sharing is explicitly chosen during a running work session | Yes                                                                       |
| Camera preview                                             | Explicit checkbox **and** Test camera access button; video only, no audio, recording, upload, or inference                                                                     | Yes; denial never blocks setup/timers                                     |
| Keyboard/mouse lab                                         | Explains the deliberately started, test-pad-only experiment; does not start it                                                                                                 | Yes; no global input/accessibility permission requested                   |
| OS notifications, microphone, autostart, contacts/calendar | Explicitly says these integrations are not requested/enabled                                                                                                                   | No permission needed                                                      |

**Availability is not a verified OS grant.** The wizard does not silently query devices, open a screen chooser, install software, discover models, start capture, or launch a timer merely because you click Continue. The optional camera test is a real permission request only after the specific test controls are used. The operating system/browser can remember its own camera choice, but Focus never starts that preview on launch; leaving the step, hiding the page, Stop/Cancel, Pause all, closing, or priority-dialog suppression ends the test. Late permission replies are stopped/discarded.

## Screen setup after starting work

Automatic screen context currently requires the **Linux native app**. Windows/macOS and the browser explicitly show it as unavailable; they still support the other timer/rest/text features. See [DESKTOP_COMPANION.md](DESKTOP_COMPANION.md) for the optional Ubuntu Python/GStreamer/portal/PipeWire packages, source chooser, and real-device QA checklist.

The setup shortcut only opens **Preferences → Desktop companion** once the first timer has deliberately begun. Choose **Set up screen context…**, read the sensitive-content/server-routing warning, explicitly agree, then select one non-sensitive source in the system chooser. A model advertising vision support is required; text-only, missing-capability, and declared remote routes fail closed. Runtime dependencies are checked at share start, not certified by finishing setup.

The OS maintains a continuous live share. Local output is reduced to roughly 1 fps, with at most one 960×540 image sent to the chosen vision model every 90 seconds during the approved work session. There is no automatic redaction. Prefer a single non-sensitive window; do not share passwords, private messages, medical/financial details, or confidential work. Stop/Pause/session change/close/restart ends the grant. Model-server retention/forwarding and OS memory behavior remain outside Focus’s control.

## Skip, defer, and reopen

- **Skip setup** or **Go to workspace** records completion and keeps the ordinary preferences you have chosen. It does not grant sensitive access.
- **Close / Escape / click outside** defers an unfinished first-run walkthrough for the current launch, without marking it complete. It can appear on a later launch. Closing an already completed, manually reopened walkthrough does not reset its milestone.
- **Preferences → Run setup again** reopens it without deleting tasks/history or starting/restarting work. It stops optional sensor/screen activity before opening, rather than inheriting a share into setup. Screen access never resumes automatically afterward.
- Recovery, an already running/paused session, another confirmation, and invalid/read-only data take priority over automatic setup. A failed native save uses the existing single priority dialog; returning keeps the setup step. Read-only/storage errors are shown instead of pretending setup repaired the workspace.
- **Delete all data** clears the completion marker along with preferences, so setup can return on the next launch (or through the explicit button). **Clear history** preserves the marker and ordinary settings.

## What is remembered

The only added field is **`settings.setupCompleted: boolean`**, an additive schema-v1 UI milestone. Missing flags migrate to `false`; invalid flags and unknown sensitive fields still preserve the original read-only. Ordinary settings continue through the existing single-writer, debounced-save/close-flush path. Storage failure can prevent persistence; the flag is not evidence that a device or optional service was tested.

Camera/screen grants, routing acknowledgement, model connections, camera-test results, images, and observations are **not** saved or exported as setup state. A completed walkthrough does not authorize future capture or prove that a loopback model server performs local-only inference. On another launch, deliberately reconnect a local model if wanted; screen context always needs a new session/source approval.

## Verification boundary

Frontend regressions cover step/back/skip/completion/reopen, platform availability, separate GNOME confirmation, model discovery failure/stale replies, synthetic camera grant/deny/late cleanup, recovery/read-only deferral, and priority close failures. Production-browser scenarios cover first-run/reload/first-timer handoff, 390/940/1440-pixel wizard layouts, every step in both themes, and the optional camera-consent surface. Linux native CI also exercises the real wizard, Rust persistence of the UI milestone, and the existing timer flows.

Use the **exact implementation commit’s** successful Focus checks run for native evidence/downloads; older foundation/companion installers do not contain this later wizard. Browser/synthetic/Xvfb tests are not physical GNOME/Wayland, camera/portal, live-model, signing, or accessibility certification. Those remain [native QA/release gates](NATIVE_QA.md).
