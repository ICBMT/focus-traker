# Desktop companion and opt-in screen context

**Implementation status:** implemented on the feature branch. **The final feature matrix passed at `3725900748add69a9fb7b5503766f8fab4326c18`**, [run 45396465955](https://github.com/ICBMT/focus-traker/actions/runs/45396465955): all four jobs, three-OS Rust/clippy/package checks, and six actual Linux Tauri/Rust/WebKit checks, including the separate companion window, denied main-only IPC, and voluntary rest exit. This includes the renderer-grant reset, GNOME focus/proxy hardening, nested-dialog safety, clearer screen-sharing disclosure, and optional GI callback-data tolerance. Physical GNOME/Wayland, real portal capture, live vision-model quality, CPU/RAM/latency, mixed-DPI placement, and signed installers remain separate validation gates. A passing Xvfb test is not a Wayland/capture test. The earlier foundation installer report does **not** include this feature. Build evidence and downloads below refer to this exact feature commit; a documentation-only follow-up does not change those binaries. Later implementation revisions need their own exact-commit matrix.

## Try it

New installations now have a [five-step first-run setup walkthrough](SETUP.md), also available from **Preferences → Run setup again**. It configures ordinary defaults and explains optional access; it never pre-grants screen sharing. The exact build evidence below is for the earlier companion implementation, **before this later setup-wizard extension**. Use an exact-commit check/build that includes the wizard when testing that addition.

1. Open **Preferences → Desktop companion** (also the monitor icon in the top bar).
2. Enable **Desktop corner timer**. It defaults off; this preference is saved, but screen-sharing permission never is.
3. On GNOME/Wayland, choose **Install GNOME companion…**, review the user-level file installation, and confirm. Enable **Focus desktop companion** in GNOME Extensions yourself. If it is not discovered, log out and back in once; do not restart GNOME Shell in-place on Wayland. The connection badge changes only after authenticated requests actually reach the running app.
4. Hover or keyboard-focus the small tab below the primary monitor's top-right panel. It reveals the countdown and rest/chat/pause controls with a short, reduced-motion-aware slide. No global mouse listener, keyboard grab, OS lock, or window-content inspection is used for hover.
5. Enable **Gentle break invitations** if wanted. Choose 10–90 minutes of active focus time. Timer completion can also offer a pause. Invitations do not focus the main window, pause your work, open a modal, or start a break by themselves.
6. Choose **A little rest** to pause the work timer and open the voluntary rest space. Begin a break timer, play the finite garden game, talk, resume paused work, or leave without doing anything. Leaving never resumes paused work on your behalf. A game/chat is not eye rest.

The extension's declared target is **GNOME Shell 45–50** (ESM/Soup 3). This declaration is not evidence of physical testing on every version. Older Shell releases and other Wayland compositors use the compact-window fallback. On Wayland, an ordinary Tauri window cannot guarantee a screen coordinate or always-on-top behavior. The fallback keeps a title bar so the compositor/user can move it. Windows/macOS/X11 request native corner placement and always-on-top; full-screen windows, OS policies, and monitor/DPI behavior still require testing. No macOS private-API transparency entitlement was added.

The browser preview demonstrates the timer **inside that page only**. It does not overlay other applications, contact the viewer's localhost, or request screen sharing.

### Disable or remove it

Turn off **Desktop corner timer** to hide both integrations and end screen sharing; disable the extension separately in GNOME Extensions if you no longer want it loaded. Remove the user-installed `gnome-shell/extensions/focus-companion@icbmt` folder through GNOME Extensions or your file manager to uninstall that integration. Uninstalling the Focus package does not silently delete a separately enabled user extension or your saved workspace. The extension has no useful state without the running app and hides itself if the authenticated bridge is unavailable.

## Screen context: separate consent, not a detector

Requirements for the current Linux implementation:

- The native Linux app, a running **work** timer, and the enabled desktop companion.
- A running xdg-desktop-portal with a ScreenCast backend (Ubuntu/GNOME normally uses the GNOME backend), PipeWire, and system Python GI/GStreamer bindings.
- An installed Ollama model that explicitly advertises `vision` through `/api/show`. No weights are downloaded. Text-only, missing-capability, known cloud-tag, and declared `remote_host`/`remote_model` routes are rejected. Server-side aliases or forwarding cannot be independently ruled out by a client; configure Ollama's no-cloud setting and trust the server before sharing.

Optional Ubuntu runtime packages (review for your Ubuntu release; the app never runs apt or a shell):

```sh
sudo apt install python3-gi gir1.2-gstreamer-1.0 \
  gir1.2-gst-plugins-base-1.0 gstreamer1.0-pipewire \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  xdg-desktop-portal xdg-desktop-portal-gnome pipewire
```

Connect the model in **AI & companion**, then choose **Set up screen context…** in **Desktop companion**. Read the sensitive-content/routing warning and explicitly agree. Only then can the native host verify capabilities and open the OS chooser. Choose **one non-sensitive window** where possible. The chooser may name the Python capture worker rather than Focus. No source is silently chosen, no restore token is saved, and there is no screenshot-command or X11 capture fallback.

The OS keeps a **live screen-share stream** open. The worker reduces its processing output to roughly **one 960×540 JPEG per second** in a bounded latest-frame buffer. At most **one** of those images is requested and sent to the bound vision model **every 90 seconds**, only during the approved work session. This is automatic sharing after consent, not a manually reviewed snapshot. Do not share a source containing passwords, medical/financial information, private messages, or confidential work: **there is no automatic redaction**. No microphone, audio stream, OCR archive, app list, URL history, or key/mouse data is requested.

A sharing indicator and **Stop sharing** appear in the main footer and expanded companion; the collapsed tab also indicates sharing. Stop/Pause all, pausing/finishing/changing the work session, rest/chat, model/endpoint changes, presentation mode, OS-share closure, or app close ends the grant. Linux screen-lock/suspend signals also terminate the worker where the desktop exposes them; these signals still need real-device QA. Sharing never restores on resume/relaunch. A late permission/model response cannot re-enable it. Errors stop the share and explain the failure instead of inventing a screen assessment. Cancellation ends the client request; an Ollama server may continue generating and may retain data independently.

**Windows/macOS screen context is explicitly unavailable in this implementation.** The native timer, voluntary rest space, and text chat remain available. We do not claim that WebView2/WKWebView implements a portable screen-sharing API.

## What AI can and cannot do

- The model produces a short message, a tentative broad activity description, and a boolean _suggestion_, not a fatigue/distraction/health score.
- Screen text is untrusted visual **data**, never system instructions. The model gets no tools, URL fetching, credentials, settings API, or OS actions. Output is strictly schema/length-checked and rendered as escaped text; structured output is not proof that a statement is correct or nonsensitive.
- Screen-based invitations require at least ten minutes of focus and **two distinct positive suggestions at least a minute apart, within five minutes**. A negative/unknown result resets the streak. **Focus protection** suppresses these discretionary AI nudges. It does not silence the timer reminders the user deliberately enabled.
- One deterministic policy owns the invitation budget: **ten-minute cooldown, at most three invitations in a rolling hour per app run**, and ten-minute snooze. New sessions do not reset the hourly budget. Dismiss, pause, disabled reminders, and presentation mode clear pending invitations. A suggestion cannot start a timer or open the rest space.
- The text-chat companion is separate: it receives only the typed conversation and optionally approved task text, **not screenshots or automatic descriptions**. Its prompt now favors warm, specific, concise responses over generic repetitive encouragement. Actual model quality remains model-dependent and unbenchmarked.

## Data boundaries and implementation

- `focus-core::companion` is the native monotonic-time policy; `src/core/companion.ts` is its browser counterpart. Session duration and saved-data ownership stay with the existing Rust engine/main workspace.
- The separate `companion` webview mounts **no App/useWorkspace**. Its capability file permits only redacted status, an enumerated action request, and expansion. Every storage/session/AI/capture command still checks the **main** label. The main renderer remains the single checkpoint/history writer, including overlay-originated actions.
- On Linux, enabling the timer creates an ephemeral numeric-loopback listener and a random 256-bit bearer token in owner-only `$XDG_RUNTIME_DIR/io.github.icbmt.focustracker-companion.json`. The extension reads this private discovery file. Only `/v1/status` and enumerated `/v1/action` exist. The bridge rejects web Origins, wrong Hosts/tokens, unknown routes, duplicate sensitive headers, transfer encoding, and oversized bodies. It returns **no task names, workspace, chats, pixels, or credentials**. It may return the bounded optional AI invitation; do not treat AI text as guaranteed nonsensitive. It is an intentional production integration, not a general automation/test server.
- `src-tauri/resources/screen_portal.py` is bundled source, run directly by `/usr/bin/python3 -I -u`, never through a shell. It uses ScreenCast `CreateSession → SelectSources → Start → OpenPipeWireRemote`, a nonpersistent portal selection, PipeWire, and GStreamer. Parent stdin closure, stream/portal errors, lock/suspend signals, or process termination close the share. The native host owns the process, generation/model/session binding, size/rate limits, and cancellation.
- Images stay in bounded worker/native/request memory and are **not returned to a webview**, stored in the workspace, exported, or intentionally logged. Latest descriptions/messages are volatile and cleared on stop; a user-opened rest space may retain the accepted message only until that space closes. Images are not zeroized; OS swap/crash dumps and model-server logs/memory/forwarding are outside this guarantee. No forensic-erasure claim.
- The workspace stays schema v1 with an additive migration for `overlayEnabled`, `gentleReminders`, `reminderMinutes`. Missing fields get safe defaults; invalid/present or unknown sensitive fields still preserve the original read-only. There is **no saved screen-consent/image/observation field**. Exports can contain the ordinary nonsensitive companion preferences, not screen grants or captures.
- Closing main shuts down the worker, private bridge/discovery file, and companion window **after the existing save/explicit-unsaved-exit flow**. A failed close retains the existing priority failure controls and stops optional capture. No second workspace writer or hide-to-tray behavior was added.

## Required physical QA before calling this validated

Record Ubuntu, GNOME, portal, PipeWire, Python/GStreamer, Ollama/model, GPU/driver, RAM and CPU versions. Exercise:

- GNOME user-level installation/discovery/enable/disable, disconnect/reconnect, shell restart/logout, lock screen, full-screen/presentation/overview, primary-monitor changes, negative monitor coordinates and mixed DPI.
- Corner hover/focus/leave, Ctrl+Alt+Tab shell navigation, screen readers/high contrast/reduced motion, no invisible click-catching area, no automatic focus theft. The extension hides in overview/lock/fullscreen; it never replaces the secure lock screen.
- Chooser accept/deny/cancel/revoke, missing plugins/server/capabilities, selected-window closure, actual portal stream/JPEG dimensions, private windows, helper exit, hotplug, sleep/lock, parent crash and restart; no orphan process/source.
- Live vision model on the 16 GB CPU-only reference machine: memory/latency, 45-second timeouts, no-cloud routing, malformed/prompt-injection/sensitive-image outputs, false suggestions, full-hour cooldown budget, and whether screen context provides enough benefit to justify exposure/CPU cost.
- Saved JSON, exports, logs and installed artifact resources; native permission denials from the companion; real close failure and unsaved-exit cleanup while sharing. Timer/chat/rest must still work when every optional integration is unavailable.

Reference implementations/contracts consulted: [ScreenCast portal XML, 1.18.4](https://github.com/flatpak/xdg-desktop-portal/blob/1.18.4/data/org.freedesktop.portal.ScreenCast.xml), [GNOME 46 layout/chrome](https://github.com/GNOME/gnome-shell/blob/gnome-46/js/ui/layout.js), [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md), and Tauri 2.12.7's window/webview source. These establish API intent, not successful physical behavior.

## Final feature build (unsigned test artifacts)

The archive links below are for **`3725900748add69a9fb7b5503766f8fab4326c18`**, [successful run 45396465955](https://github.com/ICBMT/focus-traker/actions/runs/45396465955), not later implementation revisions. These installer artifacts expire after 14 days and may require GitHub sign-in. Artifact metadata, exact source SHA, and all four job results were inspected; archive contents/system-library legal review and physical installation were not independently inspected here. These are **unsigned test builds**, not signed public releases. Signing, macOS notarization, physical QA, and publication remain gated.

| Platform            | Download                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Ubuntu/Linux x86_64 | [deb + AppImage](https://github.com/ICBMT/focus-traker/actions/runs/45396465955/artifacts/14921791530) |
| Windows x86_64      | [NSIS installer](https://github.com/ICBMT/focus-traker/actions/runs/45396465955/artifacts/14922290540) |
| macOS universal     | [DMG](https://github.com/ICBMT/focus-traker/actions/runs/45396465955/artifacts/14921512098)            |

The same run includes [browser evidence](https://github.com/ICBMT/focus-traker/actions/runs/45396465955/artifacts/14921656097) and [native WebKit evidence](https://github.com/ICBMT/focus-traker/actions/runs/45396465955/artifacts/14921791536), retained for seven days. Linux annotations report **24 core + 22 native-host Rust tests** and **six real Tauri/Rust/WebKit smoke checks**, all passing. Windows/macOS compiled, passed their native test/clippy jobs, and packaged; their physical desktop interactions were not exercised by the Linux smoke suite.

Web evidence: **151 frontend regressions, 18 browser scenarios, 38 axe states/0 reported selected-rule violations**, no uncaught errors or third-party HTTP in those browser scenarios. Three Python worker guard tests are not live-capture tests. Full native tests and mocked image requests are not evidence of portal/vision performance or privacy certification.
