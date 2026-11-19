# Platform support and realistic feature parity

**Status:** researched feasibility matrix, not tested support. A shared host and concurrent three-OS CI checks now exist in source, but no native build/device run is claimed here; see [IMPLEMENTATION.md](IMPLEMENTATION.md) and [NATIVE_QA.md](NATIVE_QA.md).

**Priority:** Linux first, with Windows/macOS adapters and build coverage developed alongside the shared core.

**Reviewed:** 2026-11-19

## 1. Support policy

“Cross-platform” means shared product behavior with honest native capabilities, **not** identical privileged access on every OS.

- Core task sessions, schedules, preferences, optional chat, and rules should be designed for all three platforms from the beginning.
- Linux is not one backend: distinguish GNOME/Wayland, KDE or other protocol-supported Wayland, and genuine X11.
- CI compilation is not real-device support. Each released feature needs a device test record.
- Never require root/admin simply to monitor ordinary work, recommend adding users to Linux's `input` group, disable OS privacy controls, or switch their desktop session to make a feature look supported.
- No sensor permission is required to use a manual focus timer.

## 2. Capability matrix

**Candidate** means technically plausible but not verified here. **Conditional** means a specific permission, packaging, compositor, or integration is necessary. **No portable route** means fall back rather than advertise support.

| Feature | Linux GNOME / Wayland | Linux KDE / supporting Wayland | Linux X11 | Windows | macOS |
| --- | --- | --- | --- | --- | --- |
| Task sessions, schedules, local settings | Candidate shared core | Candidate shared core | Candidate shared core | Candidate shared core | Candidate shared core |
| Idle summary | Candidate Mutter adapter | Candidate idle protocol/desktop adapter | Candidate X11 adapter | Documented native API | Candidate native idle API |
| Global key/mouse aggregates | No portable passive route | No portable passive route | Conditional native observation | Candidate native observation | Conditional Input Monitoring |
| Optional global input-rhythm summaries | Unavailable without separately approved desktop integration | Same | Conditional event adapter + feature validation | Conditional event adapter + feature validation | Conditional Input Monitoring + feature validation |
| Camera + local landmarks | Conditional WebKitGTK/capture path | Same | Same | Conditional WebView2/camera permission | Conditional WKWebView/OS consent |
| Camera while hidden/tray | Must be tested | Must be tested | Must be tested | Must be tested | Must be tested |
| Main app's own notifications | Conditional server availability | Conditional server availability | Conditional server availability | Conditional OS/app setup | Conditional OS permission |
| Read arbitrary native notifications | No standard listener guarantee | No standard listener guarantee | No standard listener guarantee | Conditional listener/identity/consent | No public general app-scoped route |
| Veto every app's notification before display | No portable route | No portable route | No portable route | Not provided by documented listener | No public general route |
| Gate an explicitly integrated source before our display | Candidate per-source integration | Same | Same | Same | Same |
| Global screen-edge glow | Optional GNOME companion/research | Conditional layer-shell + native adapter | Candidate native overlay | Candidate native overlay | Candidate public native overlay |
| Global emergency shortcut | Conditional portal/desktop shortcut | Same | Candidate | Candidate | Candidate / permission-dependent |
| Five-minute app break UI | Candidate, cannot guarantee topmost/enforcement | Same | Candidate | Candidate | Candidate |
| Native lock request | Conditional session/desktop support | Same | Same | Documented API; verify result via lifecycle | Public integration unresolved; manual OS shortcut fallback |
| Prevent early login / automatic timed unlock | Not promised | Not promised | Not promised | Not promised | Not promised |
| Local Ollama + remote provider protocols | Candidate Rust network path | Same | Same | Same | Same |

Supporting “mouse/touchpad” means ordinary pointer events or idle information where available, not all hardware gestures or raw touchpad contacts.

Input rhythm needs feature-level event coverage beyond idle state. Idle-only adapters cannot fabricate cadence, editing-key, or movement-style summaries. An own-window calibration/demo is not proof of global monitoring. Preserve this distinction in capability reports and evaluate each permitted native path alongside Linux work; see [INPUT_RHYTHM.md](INPUT_RHYTHM.md).

## 3. Linux first: implementation route

### GNOME/Wayland

**Recommended first lab target:** Ubuntu 24.04 LTS GNOME on Wayland, provisional until the user's actual environment is known. Record exact distro, kernel, GNOME/Mutter, portal, WebKitGTK, graphics, and camera versions in the spike.

1. Probe the desktop-specific Mutter idle service; validate its path, units, and behavior against the installed version.
2. Treat global key/mouse counts and active-window metadata as unsupported unless a separately approved, maintainable desktop integration is built.
3. Spike camera permission, WebKitGTK media settings, dependencies, local origin security, worker execution, and hidden-window operation.
4. Use normal app notifications for our own reminders and a clear manual Do Not Disturb setup flow. This is not interception of other apps.
5. Offer in-app/status cues first. A global edge glow likely needs an optional GNOME Shell companion rather than an ordinary positioned Tauri window.
6. A companion is a separately installed, versioned feature with clear uninstall/revocation. It must not bypass consent or silently patch the user's notification server.

The current researched Wayland protocol tables do not list Mutter support for ext-idle-notify or wlr-layer-shell. That is why GNOME needs its own tested route, not an assumption that every Wayland protocol works everywhere. [1](https://wayland.app/protocols/ext-idle-notify-v1) [1](https://wayland.app/protocols/wlr-layer-shell-unstable-v1)

### KDE / other supporting Wayland compositors

1. Probe advertised idle protocol versions and behavior at runtime. Distinguish inhibitor-aware idle from input-only idle where supported.
2. Keep fine-grained global input counts unavailable unless there is an independently approved passive interface. The InputCapture portal is for controlled capture, not transparent work analytics. [1](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.InputCapture.html)
3. Where layer-shell is supported, evaluate a small native overlay renderer/adapter. Supporting the protocol does not mean Tauri automatically exposes it.
4. Prototype any KDE notification/quiet-mode integration separately. It is not a generic Linux or GNOME feature.
5. If protocols are missing, retain shared sessions, manual breaks, chat, and capability-appropriate status cues.

Use at least one currently supported KDE/Wayland distribution in the physical test matrix; freeze its exact version during the spike, not from a guessed compatibility table.

### X11

- Native idle queries and optional passive aggregate input observation are candidates.
- Test outside our own window and across a complete work session; do not collect typed characters.
- Validate noninteractive overlays with multiple monitors and compositors.
- Do not mistake XWayland observations for complete native-Wayland coverage. `rdev` itself documents its Linux listening limitation. [1](https://github.com/Narsil/rdev)

### Linux distribution and sandboxing

Start with a native package for the selected baseline and an AppImage experiment; add `.rpm` when tested. Do not promise an AppImage has no host dependencies. Defer a Flatpak release until camera, secret store, background behavior, shortcuts, and D-Bus permissions are deliberately scoped and tested. Never request broad device or host filesystem access just to reproduce a native package's behavior.

GNOME may not display a traditional tray icon in every installation. If a persistent indicator/extension is unavailable, keep a reachable visible control window; do not leave invisible sensing with no obvious stop/quit path.

## 4. Windows route

Initial test target: a currently supported Windows 11 x64 build on physical hardware. Older Windows versions are not implied by an API's historical availability.

- Idle: `GetLastInputInfo`; handle non-monotonic/wrapping native tick data correctly rather than using it as a policy clock. [1](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getlastinputinfo)
- Optional activity counters: evaluate an appropriate native passive input API; aggregate immediately. Do not claim secure-desktop visibility or use a keylogger abstraction by default.
- Camera: packaged WebView2/capture tests with grant, denial, revocation, device change, and another app using the camera.
- Notifications: send our own using supported desktop registration. For observing other notifications, separately prove manifest capability, package identity, request-access UI threading, and revocation behavior. Standard Tauri NSIS/MSI packaging is not proof that the listener is authorized. [1](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener)
- Filtering: the observer is after-delivery; true gating needs a controlled source/quiet-mode arrangement.
- Glow: evaluate a native no-activation, click-through surface. Test scaling, taskbar, fullscreen/exclusive apps, accessibility tools, and monitor hotplug.
- Native lock: `LockWorkStation` requests a normal OS lock; track session notifications to distinguish request from outcome. No timed authentication bypass. [1](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-lockworkstation)
- Distribution: test installer/uninstaller and updates; signed releases are recommended, with signing handled as its own release task.

## 5. macOS route

Select supported macOS releases and both needed architectures based on available testers; do not set a minimum version without checking the pinned runtime and permissions.

- Idle: evaluate a native idle summary without broad event access; prove actual behavior.
- Optional global counts: listen-only event tap with the appropriate Input Monitoring consent. Apple's developer guidance differentiates that from requesting full Accessibility access for everything. [2](https://developer.apple.com/forums/thread/724608) [1](https://developer.apple.com/forums/thread/735204)
- Camera: usage descriptions, appropriate signing/entitlement configuration, OS/WebView prompts, and permission revocation all need packaged-app testing. Development-launch permission behavior is not enough to certify distribution.
- Notifications: normal public notification APIs manage this app's notifications, not a cross-app firewall. Guide user-configured Focus and explicit sources; do not scrape Notification Center internals. [1](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/getdeliverednotifications(completionhandler:))
- Glow: research a public AppKit surface; do not enable Tauri's private-API transparency option casually or promise Mac App Store compatibility. Menu-bar/in-app fallback remains available.
- Lock: start with the user's OS lock action/shortcut unless a suitable documented integration is verified. Do not build around private authentication APIs or accessibility-scripted system settings.
- Distribution: signed/notarized `.app`/`.dmg` testing, hardened-runtime permissions, upgrade/reinstall consent behavior, and uninstall/data-removal guidance.

## 6. Parallel development without fake parity

From the first implementation milestone:

1. Shared domain tests compile/run on Linux, Windows, and macOS CI.
2. Native adapter skeletons return precise unsupported/degraded states rather than fake data.
3. Run real UI builds for each OS early; allocate Windows/macOS permission work alongside Linux, not as a late port.
4. Use the same synthetic traces to compare core decisions across platforms.
5. Keep per-feature device evidence. An untested camera or overlay stays experimental even if the shared app builds.
6. Do not silently lower other OSes' quality standards to call them “simultaneous releases.”

If physical Windows/macOS testers are unavailable, state that limitation in release notes and keep those integrations experimental. The current sandbox cannot stand in for those desktop environments.

## 7. Feature status shown to users

Prefer:

> Idle detection available. Global input counts unavailable on this desktop. Camera paused. Desktop glow needs an optional integration. Only your connected source is being triaged; other applications are not filtered.

Avoid:

> Monitoring everything. You are 93% focused. All distractions blocked.

Include an adapter diagnostic export containing versions and capability/error codes only—never input text, images, API keys, or notification bodies. This turns platform limitations into actionable support information rather than misleading metrics.
