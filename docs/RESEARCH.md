# Research notes and source register

**Reviewed:** 2026-11-19

**Purpose:** make an implementable plan, not claim that hardware integration or wellness inference has been validated.

## How to read this document

- **Documented:** a platform/library API or published result says this.
- **Design conclusion:** a proposed choice for this product, not a platform guarantee.
- **Unverified:** requires an implementation spike or evaluation on the target hardware.

Primary platform documentation, source repositories, model licenses, and scientific reviews were prioritized. Search excerpts were supplemented by retrieved documentation for the main Tauri, MediaPipe, notification, Wayland, Ollama, model-license, and lock APIs. Some publisher pages expose limited full text; this is not a systematic literature review. Nothing in this research is a device benchmark, clinical validation, legal opinion, or claim that a particular model was run here.

Library tags and documentation can change. Pin exact dependency versions and model hashes at implementation time, and recheck licenses and security advisories before release. The `Rxx` labels below are local reference keys; linked numeric citations identify the researched sources.

## R01 — Tauri is appropriate, but permissions need deliberate design

**Documented:** Tauri 2 capabilities scope frontend access to particular windows/webviews. The documentation also warns that custom commands registered through `invoke_handler` are, by default, available to all windows/webviews unless the application explicitly constrains them. Capability declarations do not validate arbitrary Rust code or protect against overly broad backend commands. [2](https://v2.tauri.app/security/capabilities/)

**Design conclusion:** use Tauri for the requested Rust desktop shell; keep policy, credentials, providers, and system operations in Rust. Apply explicit custom-command permissions, per-window checks, input validation, and a strict content-security policy. Do not assume “Tauri uses Rust” makes an unrestricted command safe.

**Unverified:** exact pinned plugin set, platform native dependencies, camera permissions, and multiwindow behavior.

## R02 — A working Chrome demo is not a working desktop camera product

**Documented:** Tauri uses WebView2 on Windows, WKWebView on macOS, and WebKitGTK on Linux. They do not constitute one identical browser runtime. [1](https://v2.tauri.app/reference/webview-versions/)

Upstream Wry has tracked platform-specific media-permission behavior, including camera/display-capture differences on macOS. This is evidence of integration risk, not proof that the same historical issue is present in the version we will select. [5](https://github.com/tauri-apps/wry/issues/1195)

**Design conclusion:** prototype packaged-app camera access in all three real WebViews, including permission denial/revocation, minimized/tray operation, worker execution, and screen lock/sleep. Camera access requires both application consent and the applicable OS/WebView/device permission path; do not grant every media request.

**Unverified:** whether a bundled MediaPipe worker stays reliable while the main window is hidden, and which Linux WebKitGTK/GStreamer/PipeWire packages are needed on our selected distribution. A hidden window is not a guaranteed background service.

## R03 — MediaPipe can supply local geometric signals

**Documented:** Face Landmarker offers 478 face landmarks, 52 blendshape coefficients, and optional facial transformation matrices. The web API supports video and runs detection synchronously; the API reference says it waits for results. Smoothing depends on `numFaces = 1`. These are geometry/expression outputs, not fatigue or flow labels. [2](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web) [4](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.facelandmarker)

**Design conclusion:** prototype `@mediapipe/tasks-vision` in a worker, with locally packaged WASM/model assets, CPU fallback, and bounded frame transfer. Extract a small set of geometric features, then use temporal Rust logic. Do not place synchronous inference on the interactive UI thread.

Prototype a two-face maximum to abstain when multiple faces are found, accepting the need for our own temporal smoothing; compare its quality/cost with a separately validated face-count check. A detector can miss bystanders, so do not promise identity assurance.

**Unverified:** quality and CPU consumption in the actual WebViews, glasses/low-light behavior, model redistribution terms, usable sampling rate, and the best capture lifecycle. A MediaPipe `.task` bundle is not an assumed drop-in ONNX model; a native alternative needs its own complete pipeline and license review.

## R04 — Eye closure is useful research material, not a fatigue oracle

**Published evidence:** the 2023 narrative review *PERCLOS-based technologies for detecting drowsiness: current evidence and future directions* finds useful evidence in vigilance tasks but emphasizes different definitions/devices, task-dependent reliability, and the value of additional measures. Eyewear, reflection, head movement, and insufficient sampling can undermine results. Results from driver/vigilance research do not establish efficacy for ordinary desktop knowledge work. [1](https://academic.oup.com/sleepadvances/article/4/1/zpad006/7000589)

A separate simulator study also reports substantial individual variation and difficulties deriving universal critical values; high blink frequency and eye-state errors can affect the indicators differently. [5](https://pmc.ncbi.nlm.nih.gov/articles/PMC8512350/)

**Design conclusion:** use per-setup calibration, signal-quality gates, sustained windows, and explicit abstention. Treat fatigue-related rules as experimental wellness suggestions. An `eyeBlink` coefficient of 0.8 does not establish that the eyelid is physically 80% closed. Until validated against a defined reference, call our feature an **estimated closure fraction**, not clinically validated PERCLOS.

**Unverified:** desktop-specific usefulness, thresholds, benefit over a simple timer, and acceptable false-nudge rates. Do not report “95% fatigue accuracy” from unrelated research as this app's performance.

## R05 — Facial movement is not a reliable mood label

**Published evidence:** the review *Emotional Expressions Reconsidered* and the APA's discussion describe limited reliability/specificity and contextual variation in inferring emotions from facial movements. [2](http://eprints.gla.ac.uk/178385/7/178385.pdf) [5](https://www.apa.org/monitor/2020/10/behind-smile)

**Design conclusion:** do not ship webcam emotion, boredom, or motivation scores. Use self-reports (“I'm bored,” “I'm stuck,” “I feel tired”) to select a game, supportive conversation, or break. No psychological diagnosis or employer-facing engagement inference.

**Unverified:** whether users find an opt-in coach useful; evaluate separately from sensing accuracy.

## R06 — Rest guidance supports look-away breaks, not more mandatory screen tasks

**Documented guidance:** the American Optometric Association describes the 20-20-20 rule—look about 20 feet away for 20 seconds every 20 minutes—as digital-eye-strain guidance, along with rest and ergonomic considerations. [1](https://www.aoa.org/healthy-eyes/eye-and-vision-conditions/computer-vision-syndrome)

**Design conclusion:** separate eye rest, physical rest, and boredom resets. An on-screen mini-game is not an eye-rest break. Offer configurable scheduling; do not represent any schedule, a coffee, or a five-minute pause as a diagnosis or treatment.

**Unverified:** whether adaptive suggestions improve user experience beyond a fixed reminder schedule. Persistent or troubling symptoms should not be managed by an AI coach instead of appropriate professional care.

## R07 — A generic global-input crate does not solve Wayland

**Documented:** `rdev` says its Linux `listen` implementation uses X11 and does not work on Wayland. Its alternative `grab` route uses device-level access and requires elevated/broad input-device permissions. [1](https://github.com/Narsil/rdev)

**Design conclusion:** do not choose `rdev` as a universal sensor abstraction and do not solve this by instructing users to run the app as root or join the `input` group. Start with idle/activity availability. Make fine-grained counts optional, platform-specific, and immediately aggregated.

**Unverified:** which selected X11 APIs and native Windows/macOS event listeners meet the lifecycle, privacy, and performance requirements. XWayland visibility must not be presented as visibility into all native Wayland applications.

## R08 — Wayland idle notification is narrower than raw input collection

**Documented:** `ext-idle-notify-v1` supplies idle/resumed notifications, with compositor-dependent support. Its newer input-only request ignores idle inhibitors, but it still does not supply each key press or mouse event. The researched compatibility table does not list Mutter support; runtime probing remains necessary. [1](https://wayland.app/protocols/ext-idle-notify-v1)

A published Mutter interface mirror exposes `GetIdletime`, `AddIdleWatch`, and user-active watches. This is a desktop-specific candidate, not a cross-desktop stable guarantee. [1](https://github.com/endlessm/mutter/blob/master/src/org.gnome.Mutter.IdleMonitor.xml)

**Design conclusion:** Linux has separate GNOME, protocol-supported Wayland, and X11 idle adapters. If none works, report unavailable instead of returning zero idle time. Do not infer event counts from idle notifications.

**Unverified:** exact GNOME service name/path/behavior in the user's version; KDE/protocol support on the selected test releases; idle behavior while reading, in meetings, and with inhibitors.

## R09 — The InputCapture portal is not a passive analytics feed

**Documented:** XDG InputCapture activates under compositor control, currently through pointer barriers. Captured events go to the application instead of normal pointer behavior. An application cannot request immediate arbitrary capture. [1](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.InputCapture.html)

**Design conclusion:** do not use InputCapture/RemoteDesktop as a stealth global key-monitoring workaround. A shortcut portal is for approved shortcuts, not every input event. Reduced sensor functionality is preferable to taking control of the user's keyboard or pointer.

## R10 — Linux notifications have a central server, not a standard interception chain

**Documented:** the freedesktop notification specification defines one session-scoped `org.freedesktop.Notifications` service, notification submission, capabilities, and lifecycle operations. It does not define a general pre-display filtering plugin API for third-party applications. [1](https://specifications.freedesktop.org/notification/latest-single/)

**Design conclusion:** do not replace GNOME/KDE's notification server or promise reliable D-Bus eavesdropping. Use controlled source integrations first, manual quiet-mode setup, and possibly a version-specific GNOME/KDE/notification-daemon companion later, with separate installation consent and maintenance scope.

**Unverified:** approved compositor/daemon extension APIs for each targeted desktop and whether they can filter before display without losing actions or history.

## R11 — Windows notification listening is not a universal pre-toast firewall

**Documented:** `UserNotificationListener` needs the manifest capability and explicit user permission. It can retrieve current toast notifications, remove notifications, and signal when a notification was added/removed. Access can be revoked, and empty results may be ambiguous if the app does not check permission status. [1](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener) [2](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.management.usernotificationlistener?view=winrt-26100)

**Design conclusion:** label this **observe-after-delivery**, not “AI approves everything before you see it.” Do not remove arbitrary notifications by default. Investigate package identity/capability requirements in the actual Tauri Windows distribution; a normal installer does not by itself prove listener authorization.

**Unverified:** packaged identity/manifest path, request-access UI threading, behavior under Do Not Disturb, and timing relative to the original toast on a real Windows system.

## R12 — macOS's public notification API is app-scoped

**Documented:** Apple's `getDeliveredNotifications` fetches **your app's** delivered notifications. That is not an API to enumerate or veto notifications from every other app. [1](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/getdeliverednotifications(completionhandler:))

**Design conclusion:** native cross-app semantic filtering is not promised on macOS. Combine user-configured Focus with controlled sources and our own notifications. Avoid private Notification Center databases, accessibility scraping of notification text, or screen capture as a workaround.

**Unverified:** how best to guide users through allowed-app/source configuration, and which explicit third-party source integrations they need.

## R13 — Desktop-edge overlays are compositor-specific

**Documented:** layer-shell can anchor surfaces to screen edges and place them on desktop layers, with specified input semantics. The researched compositor table includes KWin and several wlroots-family compositors but not Mutter. [1](https://wayland.app/protocols/wlr-layer-shell-unstable-v1)

Tauri's configuration reference notes macOS transparency requirements involving its private-API feature. Do not assume one transparent Tauri window is the best portable, public-API overlay implementation. [1](https://tauri.app/reference/config/)

**Design conclusion:** separate `OverlayBackend` from the main UI. Investigate native/public AppKit and Windows surfaces; layer-shell on supporting compositors; optional GNOME Shell integration for GNOME. Provide a static in-app/status cue when desktop-wide glow is unavailable. Do not force X11 as the user's session or promise overlays over secure/exclusive-fullscreen surfaces.

**Unverified:** click-through behavior, focus stealing, mixed DPI, virtual desktops, monitor hotplug, and presentation/screen-share behavior. No platform ships the glow until those checks pass.

## R14 — Native locking and a timed commitment break are different

**Documented:** Windows `LockWorkStation` requests locking asynchronously; success means the request was initiated, not verified completed. Unlock requires user login. It is not a timed lockout/auto-unlock API. [1](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-lockworkstation)

Linux `org.freedesktop.login1` exposes session lock operations and lock/idle hints, whose use depends on session and desktop integration. Hints should not be confused with independently verified user state. [1](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.login1.html)

**Design conclusion:** the five-minute countdown belongs to our app's commitment break UI. Optional native locking is separately authorized, and the user can authenticate according to OS policy. Never store a login password, disable authentication, repeatedly relock an early-returning user, or promise to prevent login for five minutes.

**Unverified:** supported Linux lock path and confirmation signals; a suitable documented macOS integration. Use user-invoked OS locking/shortcuts as a fallback rather than promising an unverified macOS API.

## R15 — Idle summaries and input counts require different native APIs

**Documented:** Windows `GetLastInputInfo` returns time of the last input; its timestamp is not guaranteed to increase monotonically. It is not a keystroke counter. [1](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getlastinputinfo)

Apple developer guidance identifies `CGEventTap` and Input Monitoring permission for counting input events, and `CGPreflightListenEventAccess`/request helpers. Passive listening does not require claiming every Accessibility privilege. [2](https://developer.apple.com/forums/thread/724608) [1](https://developer.apple.com/forums/thread/735204)

**Design conclusion:** expose native idle information independently from optional event aggregation. Use listen-only hooks where available; do not decode characters, suppress input, or request unnecessary privileges. Verify timing and secure-input behavior rather than extrapolating activity.

## R16 — Ollama covers local inference and structured replies

**Documented:** Ollama provides installed-model listing (`GET /api/tags`), model details, chat, and other model APIs. Structured output accepts a JSON schema in `format`. Its OpenAI compatibility is explicitly a subset, not a promise of identical features across providers. [1](https://docs.ollama.com/api/tags) [1](https://github.com/ollama/ollama/blob/main/docs/api.md) [1](https://docs.ollama.com/capabilities/structured-outputs) [1](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx)

**Design conclusion:** use a native Ollama adapter plus an explicit provider abstraction. Classifier output is bounded data, not executable instructions. Validate semantics as well as syntax; schema-conforming output can still be wrong. No tool calling is needed for the first classifier or coach.

**Unverified:** selected model capability, cold/warm latency, language/tone suitability, and inference resource contention with a webcam and actual work.

## R17 — Loopback does not by itself prove local-only inference

**Documented:** Ollama has cloud-backed features. Its FAQ describes local-only mode using `disable_ollama_cloud` or `OLLAMA_NO_CLOUD=1`, which disables cloud models and web search. [1](https://docs.ollama.com/faq)

**Design conclusion:** strict-local mode requires an audited local-model route, no hosted tools, no automatic remote fallback, and user-managed cloud disabling on the Ollama server. A cloud tag should not be accepted merely because the HTTP request went to a local port. A UI badge is not a cryptographic guarantee about an independently administered inference server; disclose what was actually verified.

**Unverified:** verifying locality for custom model aliases or a remote user's Ollama installation. Unknown locality must not receive a “verified offline” label. Test an offline session after all required assets are installed.

## R18 — The requested 3B model has an important license exception

**Documented:** the currently fetched `qwen2.5-coder:3b` entry resolves to digest prefix `f72c60cabf62`, Q4_K_M, about 1.9 GB, and links the Qwen Research License. The fetched license defines noncommercial use as research/evaluation and requires requesting a license for commercial use. [1](https://ollama.com/library/qwen2.5-coder:3b)

**Design conclusion:** do not describe this tag as Apache 2.0 or automatically bundle it as a commercial-product default. The full linked license was reviewed; obtain legal clarification for uses beyond its grant. “Bring your own model” does not make the model license irrelevant.

The current `qwen3:4b` entry lists about 2.5 GB and Apache 2.0, making it a general-purpose candidate worth evaluating, not a performance guarantee. [1](https://ollama.com/library/qwen3:4b) [2](https://ollama.com/library/qwen3:4b/blobs/d18a5cc71b84)

Record full model digests, license notices, runtime versions, quantization, context length, and prompt versions in evaluations. A model's download size is not its total RAM requirement.

## R19 — Bring-your-own-key requires discovery plus capability tests

**Documented:** OpenAI has a model-list endpoint; Anthropic has its own model-list API; Gemini's model resource reports supported generation methods. Provider metadata and protocols are not interchangeable. [1](https://platform.openai.com/docs/api-reference/models/list) [1](https://docs.anthropic.com/en/api/models-list) [1](https://ai.google.dev/api/models.md.txt)

**Design conclusion:** credential entry → list all pages → choose/filter text-capable candidates → allow manual model ID → explicit low-cost capability test. Separate “listed,” “tested for chat,” “tested for schema output,” and “usable with current quota.” Model lists do not provide a universal, complete account billing/entitlement guarantee. Handle authentication, region, deployment IDs, quotas, and streaming differences per adapter; make pricing estimates explicitly user-configured.

## R20 — Credentials belong in native secret stores

**Documented:** the Rust keyring ecosystem provides native credential-store integrations. Its project has evolved into a wrapper/core/store ecosystem, so pin the appropriate crates and explicitly chosen OS backends rather than copying an outdated feature list. [1](https://github.com/open-source-cooperative/keyring-rs)

**Design conclusion:** Secret Service-backed store on suitable Linux desktops, Keychain on macOS, and Windows' native credential store. Exercise locked/missing-store behavior. If unavailable, keep the credential in memory for this run; do not fall back silently to plaintext config, `.env`, SQLite, or browser storage.

**Unverified:** backend behavior in the selected packaging, especially minimal Linux desktops and sandboxed distributions.

## R21 — Replace flickering with an accessible, optional cue

**Documented:** WCAG 2.2 addresses flash thresholds, pause/stop/hide for certain automatic motion, and disableable interaction animation. These are useful design constraints, not proof that an arbitrary desktop visual is safe for every person. [1](https://www.w3.org/TR/WCAG22/#animation-from-interactions)

**Design conclusion:** no strobe, alternating saturated red, full-screen brightness swings, or indefinite edge animation. Default to static/text/status feedback; make desktop glow opt-in, low contrast, short, disableable, and reduced-motion aware. A slow fade is a product choice, not a clinical safety certification. Never depend on color or motion alone.

## R22 — Existing tools are design references, not evidence of our feature quality

**Documented:** ActivityWatch demonstrates a watcher-oriented, local data ownership approach with AFK/window watchers. Stretchly documents configurable short/long breaks, advance reminders, and strict-mode settings. [1](https://github.com/activitywatch/activitywatch) [1](https://github.com/hovancik/stretchly)

**Design conclusion:** borrow the ideas of small adapters, visible control, configurable schedules, and testable boundaries—not code without license review. This project's potential differentiation is an opt-in, confidence-aware focus/break companion with source-aware AI triage. Do not copy another tool's settings as medically optimal or import its data collection wholesale.

## R23 — Keep personal assistance separate from workplace emotion surveillance

**Documented:** Regulation (EU) 2024/1689 addresses biometric emotion inference and workplace/education restrictions. Recital 18 distinguishes physical states such as fatigue from emotion recognition; that distinction does not by itself settle this product's regulatory classification. [1](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32024R1689) [2](https://eur-lex.europa.eu/legal-content/FR-EN/TXT/?uri=CELEX%3A32024R1689)

**Design conclusion:** keep the initial app personal, voluntary, non-diagnostic, and free of manager dashboards or emotional scoring. Before commercial, employer, school, or cross-border deployment, obtain jurisdiction-specific privacy, AI, consumer, and health-claims review. Do not advertise legal compliance merely because processing is local or the user clicked consent.

## R24 — Cross-platform testing must include the actual desktop runtime

**Documented:** Tauri's current testing documentation recommends WebdriverIO with `@wdio/tauri-service` across desktop platforms, including an embedded-server path for macOS. Direct `tauri-driver` use remains Windows/Linux-only in that documentation. Old advice that all macOS Tauri automation is impossible is too broad. [1](https://v2.tauri.app/develop/tests/webdriver/)

**Design conclusion:** use browser tests for fast UI checks, then evaluate the current native service on each OS. Keep any embedded testing server out of production builds. Even native UI automation does not validate physical webcam behavior, TCC/OS consent UX, notification timing, or multi-monitor compositor behavior; retain real-device checklists.

## R25 — Release/update security is a separate workstream

**Documented:** Tauri's updater requires update signatures; its documentation says verification cannot be disabled. Recent CLI release notes also discuss binding artifact signatures to the app version. [1](https://v2.tauri.app/plugin/updater/) [2](https://v2.tauri.app/release/@tauri-apps/cli/v2.12.0/)

**Design conclusion:** pin audited versions, validate version-bound artifact signatures where supported, test mismatched/corrupt updates, and keep signing keys outside the repository. OS code signing/notarization, updater signatures, model checksums, and model licenses are separate requirements. Initial local development does not need an auto-updater; release automation must not block the feasibility work.

## R26 — Typing dynamics justify an experiment, not a mood detector

**Published evidence:** de Jong et al. (2020), *Dynamics in typewriting performance reflect mental fatigue during real-life office work*, monitored typing over six weeks and reported changes in interkey intervals/backspace use with time-on-task and time context. The authors describe a proof of principle; this does not validate distinguishing boredom, creative thinking, task difficulty, and psychological flow in our product. [3](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0239984)

Epp, Lippold, and Mandryk (CHI 2011), *Identifying emotional states using keystroke dynamics*, collected typing features and self-reported states and reported classifiers for some labels. This is evidence that interaction patterns have been studied—not that a universal label, a published accuracy, or the same result transfers to our coarser privacy-preserving features. [1](https://dl.acm.org/doi/10.1145/1978942.1979046)

**Design conclusion:** investigate within-person, work-style-specific rhythm changes, with optional editing-key counts carefully distinguished from error counts. Keep local, quantized, bounded summaries; exclude raw/per-key timing histories and identity signatures. Use voluntary feedback and explicit unknown states rather than guessing mood from speed. No LLM is needed to compute these features. See [INPUT_RHYTHM.md](INPUT_RHYTHM.md).

**Unverified:** incremental usefulness over idle/timer rules, privacy-compatible feature sufficiency, minimum sample sizes, accessibility/device confounds, and actual global availability on the user's desktop.

## R27 — Field generalization and context are major limits

**Preliminary evidence:** the version read of Naegelin et al. (2025), *One does not fit all: Detecting work-related stress from mouse, keyboard, and cardiac data in the field*, is explicitly a **non-peer-reviewed medRxiv preprint**. Its eight-week field study of 36 office employees found weak general-model correlations with self-reported stress (reported Spearman correlation 0.078; 0.096 with temporal sequences). Personalized mouse/keyboard models performed better but still had limited correlations (mean 0.188 for the reported XGBoost family). These are correlations, not classification accuracy, and the target was stress—not boredom or flow. [2](https://www.medrxiv.org/content/10.1101/2025.08.02.25332538v1.full)

**Published contextual evidence:** Mark et al. (CHI 2014), *Bored Mondays and Focused Afternoons*, combined digital activity logging with repeated reports from 32 information workers over five days and related attentional states to engagement/challenge and context. This motivates contextual self-reports; it is not validation of a sensor-only psychological-flow detector. Do not use the study's group time-of-day patterns to label an individual. [1](https://dx.doi.org/10.1145/2556288.2557204)

**Design conclusion:** evaluate real work across held-out sessions/days, compare timer/idle/rhythm/combined baselines, and report unknown coverage, false check-ins, feedback bias, and interruption cost. Do not randomly split overlapping time windows or transfer laboratory/stress accuracy claims to a boredom/flow feature. Longer-window study associations do not validate our trial short-window intervention thresholds. Validate using the exact coarsening and privacy constraints intended for release.

**Unverified:** whether the requested input-style extension improves this person's experience at all. Keep it observation-only or omit adaptive prompts if it does not.

## Remaining research questions, in order

1. Exact user Linux desktop and its camera/idle/overlay capabilities.
2. Packaged worker-based camera operation while minimized across all three OSes.
3. Whether calibrated camera and/or privacy-limited input-rhythm cues produce fewer unwanted reminders than timer/idle baselines for comparable tasks.
4. Which *real* notification source to integrate first, and its auth/scopes/distribution constraints.
5. CPU-only model latency, useful tone, instruction following, and license suitability.
6. Windows listener package identity and authorization, if observe-after-delivery is useful enough to justify it.
7. Desktop-specific glow adapters and GNOME extension maintenance costs.
8. Native vision fallback cost if WebView-based capture fails its lifecycle gate.

Each is turned into a time-boxed task and a stop/fallback decision in [ROADMAP.md](ROADMAP.md).
