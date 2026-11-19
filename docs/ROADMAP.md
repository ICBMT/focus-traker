# Roadmap, feasibility gates, and validation

**Status:** implementation authorized and started on the portable M1/M2 foundation, with scoped M4/M5 experiments. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for code and observed tests. No complete milestone or native feasibility/device gate is claimed passed; the wider work below remains gated.

**Planning baseline:** Linux first, concurrent Windows/macOS work, Rust/Tauri, 16 GB CPU-only reference laptop.

**Rule:** do not build the entire product around an unverified camera, notification interception, or OS-lock assumption.

## 1. Delivery strategy and effort

Build vertical slices that remain useful when optional sensing or AI is unavailable. Keep platform adapters and build/test coverage in the same development cycle, with Linux as the first device-validation target.

### Planning estimate, not a commitment

For one experienced full-time desktop/full-stack developer with access to all three OSes:

| Milestone | Indicative engineering effort | Deliverable |
| --- | --- | --- |
| M0 — feasibility spikes | 2–3 weeks | Recorded results and architecture decisions for the risky integrations |
| M1 — application foundation | 1–2 weeks | Three-OS app shell, deterministic core, safe settings/history, synthetic replay |
| M2 — useful focus/break MVP | 2–3 weeks | Task sessions, idle-aware schedules, controls, summaries, camera/AI-free use |
| M3 — camera observation beta | 2–4 weeks | Calibrated local sensing, quality/failure handling, observation-only evaluation |
| M4 — AI coach and provider setup | 1–3 weeks | Local + first remote protocol, secure credentials, capability tests, optional chat |
| M5 — real source-aware triage | 2–4 weeks | Rules/classifier evaluation and one real controlled notification source |
| M6 — intervention hardening and release | 2–4 weeks | Gated adaptive suggestions, supported cues, release checks, external beta |

The original scope is roughly **12–23 engineering weeks**, before substantial contingency or additional integrations. Budget about **4–7 calendar months** for a polished first cross-platform beta once platform debugging, testers, and part-time availability are included. A useful Linux timer/rules build should arrive much earlier (M2); its camera/AI beta depends on the gates, not a promised date.

With multiple developers, split Linux/Windows/macOS adapters and AI/UI work in parallel after the contracts are stable. Do not promise one person's parallel work has no time cost. Phone detection, many provider protocols, a GNOME notification/overlay companion, native vision fallback, and mini-games add separate effort.

These estimates predate the input-rhythm addition. Allocate an initial 2–3 engineering days to F07; an extended field study or trained classifier requires separate estimation, not silent expansion of the original dates. Re-estimate after M0 using actual devices and the chosen first notification source.

## 2. M0 — prove the difficult assumptions first

Each spike must record exact OS/library/model versions, hardware, methods, observed results, failure cases, and the decision. A screenshot or successful compile is not a passing runtime test.

### F01 — baseline inventory and least-privilege capability probe

- Confirm the user's distro/version, GNOME/KDE/other desktop, Wayland/X11, CPU, camera, and monitors.
- Provision Linux, Windows, and macOS test access; record what cannot currently be tested.
- Probe idle, camera, background operation, notifications, native secret store, overlays, shortcut, and native lock independently.
- Establish whether the app can remain visibly controllable without a working tray icon.

**Gate:** documented runtime capability map; missing capabilities are explicit and no test requires root/admin input monitoring. Do not set minimum system requirements yet.

### F02 — packaged camera and worker spike (highest technical risk)

- Minimal trusted Tauri camera host + bundled MediaPipe assets + worker.
- Test Linux WebKitGTK first, then Windows WebView2 and macOS WKWebView in the same milestone.
- Grant/deny/revoke, no camera, busy camera, device unplug, frozen stream, low light, glasses, different head poses, multiple people, and monitor layouts.
- Run at least a 30-minute hidden/minimized session and exercise lock/sleep/resume; longer soak follows later.
- Measure timestamps, usable sampling rate, dropped frames, CPU, memory, and UI responsiveness while the user performs ordinary work.
- Verify pause stops hardware capture and late worker messages cannot revive it.

**Gate:** bounded, responsive, local processing with correct degraded states. If hidden capture cannot be made dependable within the time box, choose a scoped native-helper experiment or ship a clearly limited camera mode. Do not build adaptive policies on a browser-only success or assume an ONNX runner accepts `.task` files.

### F03 — idle/activity and Wayland boundary

- GNOME idle adapter and one protocol-supported Wayland adapter; genuine X11 where needed.
- Native Windows/macOS idle summaries; optional passive aggregate-count prototype where justified.
- Verify inactivity versus unavailable data, reading with no input, idle inhibitors, lock/suspend, keyboard layouts, assistive input, and device changes.
- No raw device permission escalation, key text collection, or InputCapture/RemoteDesktop workaround.

**Gate:** a working no-global-counts Wayland mode. Timer/manual mode remains viable if a specific idle API is unavailable.

### F04 — notification feasibility, not an AI demo

- Identify the user's first actual source/application and confirm its permitted integration/authentication/scopes.
- Demonstrate the difference between controlled delivery, observing an already posted native item, and unsupported sources.
- On Windows, separately test package identity, manifest capability, access request/revocation, and original-toast timing if the observer is in scope.
- Test quiet-mode settings, original-source muting, our app's allowed delivery path, duplicate prevention, and action/deep-link preservation.
- Time-box GNOME/KDE companion research; do not replace the user's notification daemon.

**Gate:** one honest source architecture. If a source cannot be controlled, do not market its notifications as filtered. If the user has not selected a source, continue the simulator/rule work but leave the real-integration gate open.

### F05 — overlay and five-minute break feasibility

- Try native click-through/no-activation surfaces on Windows and a public-API Mac candidate.
- Try layer-shell on a supporting compositor; explicitly record GNOME fallback/companion requirements.
- Test mixed DPI, monitor hotplug, fullscreen, virtual desktops, focus stealing, keyboard/screen-reader access, and pause/escape.
- Demonstrate an escapable five-minute app break separately from a native lock request.
- No early-login prevention, stored OS credentials, repeated relocking, or auto-unlock promise.

**Gate:** safe fallback works everywhere. Unsupported desktop-edge glow remains disabled; it does not block the core product.

### F06 — CPU-only AI and license spike

- Test the user's requested `qwen2.5-coder:3b` within its applicable license, a general-purpose permissively licensed candidate such as `qwen3:4b`, and a smaller fallback.
- Record exact model digest, license, quantization, context, runtime, prompt, hardware, cold/warm latency, CPU/RAM, and impact on ordinary work.
- Run model listing, explicit schema/streaming tests, cancellation, unavailable model, quota/auth errors, and malformed replies using mocks and a real model.
- Validate strict-local behavior with assets installed and network unavailable. Disclose unknown/custom-route locality rather than claiming proof from loopback.
- Prototype native secret-store persistence and locked/missing-store behavior.

**Gate:** choose a measured candidate/default or retain rules-only operation. License review is a separate gate from speed and output quality. No automatic multi-gigabyte download.

### F07 — privacy-preserving input-rhythm feasibility (new request)

**Initial time box:** 2–3 engineering days for extraction/privacy/native-capability feasibility, not proof of boredom/flow recognition.

- Prototype coarse cadence, burst/pause, optional editing-key, and pointer-activity/style summaries with synthetic traces and at least one authorized passive native path.
- Prove constant-size raw-event accumulation, bounded coarse windows, no character decoding/raw traces, feature-level consent, gaps, cold start, pause/revocation, and minimum sample requirements.
- Record scope as global, own-window-only, or unavailable on each target. Continue Windows/macOS capability work alongside Linux; never elevate device access to force Wayland parity.
- Compare user-selected work-style baselines; output steady/changed/unknown only. Do not treat repetitions/deletions, reading, IME/assistive input, or device changes as emotion labels.
- Define the later voluntary self-report study and held-out-session evaluation before any learned interpretation or adaptive check-in. Camera and AI are not prerequisites.

**Gate:** privacy-preserving features on an honest native scope, or a documented idle/manual fallback. No claim of automatic boredom, mood, or psychological-flow identification. See [INPUT_RHYTHM.md](INPUT_RHYTHM.md).

### M0 exit decision

Write an architecture decision record answering:

- Is worker-based packaged camera operation viable, and on which exact targets?
- Which Linux features are supported, degraded, optional-companion, or unavailable?
- Is there a real gateable notification source, or only a simulator/observer?
- Which local model is usable for which role under its license and budget?
- Which interventions can safely ship, and which need postponement?
- Which privacy-limited input-rhythm features are available, and is an observation-only personalized pilot justified?

Only then finalize dependency versions, the initial UI contract, and a revised effort estimate.

## 3. M1 — application foundation

### Work items

- **B01:** Rust workspace and Tauri/TypeScript app using M0's selected versions; Linux/Windows/macOS builds.
- **B02:** typed capability/consent registry and fake/synthetic adapters.
- **B03:** pure domain/session state, fake clock, observation gaps, bounded channels, intervention manager.
- **B04:** SQLite migrations/history/retention worker; native secret store interface with memory-only fallback.
- **B05:** IPC authorization, window scopes, CSP, navigation restrictions, redacted error/log handling.
- **B06:** CI: formatting, lint/typecheck, unit tests, platform builds, dependency/license checks, production/test feature separation.

### Exit criteria

- Shared synthetic traces produce the same policy decisions on all OS builds.
- No source permissions are requested at first launch just to show the UI.
- A fresh run works offline without Ollama or a camera.
- Database migration/rollback-recovery procedures and unclean-exit session recovery are tested.
- Test automation transports cannot enter a production build.

## 4. M2 — useful focus/break MVP

### Work items

- **P01:** task/session profiles and configurable work/break schedules.
- **P02:** progressive onboarding, capability report, idle adapters, clear unavailable state.
- **P03:** tray/menu or visible-window control path; pause-all, quit, meeting mode, “I'm reading/thinking.”
- **P04:** reminders, snooze, look-away/physical rest options, return-to-task flow, no punitive game/lock.
- **P05:** minimal session review, correction, export, delete all, consent/retention settings.
- **P06:** if F07 passes, optional observation-only input-rhythm pilot, work-style baseline/reset controls, and voluntary self-labels; no camera/LLM dependency or guessed mood dashboard.

### Exit criteria

A person can complete a normal work session and break with all of camera, global input counts, and AI disabled. Lock/sleep/resume, missing tray, clock changes, denied permissions, and app restart do not cause surprise enforcement or lost control. Session duration is not labeled verified focused time.

## 5. M3 — camera observation beta

### Work items

- **V01:** camera lifecycle, selected-device preview/status, local bundled worker, explicit release on pause/lock.
- **V02:** accessible calibration with optional profile storage and versioning.
- **V03:** timestamp-based closure/head-pose trends, measured coverage, gaps, abstention, configurable thresholds behind an experiment flag.
- **V04:** offline synthetic/research replay harness and consenting seated-user observation study.
- **V05:** power modes; turn off unsupported temporal metrics rather than inventing precision at low frame rates.
- **V06:** optionally compare camera, input-rhythm-only, and combined observations without assuming more correlated features prove the interpretation.

### Exit criteria

- Observation-only by default. Camera cues cannot cause automatic locks or game prompts.
- Low light, occlusion, camera loss, detected multiple-face ambiguity, and poor sampling yield unknown/degraded states.
- Reading, thinking, second monitors, conversations, and normal glances are included in evaluation—not just scripted eyes-closed clips.
- Privacy and responsiveness tests pass; the results justify enabling a **gentle optional** adaptive suggestion in M6.
- If camera cues do not add user value over timers, retain them as an opt-in experiment or remove them from the default experience.

## 6. M4 — AI coach and user-configured providers

### Work items

- **A01:** native Ollama discovery/details/chat/schema requests and explicit warmup.
- **A02:** OpenAI-compatible adapter with model pagination/manual IDs, capability tests, endpoint validation, and secure credential workflow.
- **A03:** per-role model choice, strict-local mode, request/token caps, cancellation, short timeouts, provider failure fallback.
- **A04:** user-initiated supportive side-chat, approved task context, ephemeral chat by default, no tools or camera mood inference.
- **A05:** bounded structured notification-classification protocol, initially simulator-only.

### Exit criteria

No secrets are returned from saved profiles, printed, exported, or stored in renderer persistence. No raw sensing data goes to any model. A model outage or slow reply does not stop sessions or block controls. Actual provider support is listed by tested protocol/capability, not “works with any API key.”

Native Anthropic/Gemini/other adapters are later tickets if requested; do not quietly expand M4 to every provider protocol.

## 7. M5 — one real source-aware notification integration

### Work items

- **N01:** authentic source adapter with minimum scopes, deduplication, expiry, and declared delivery semantics.
- **N02:** urgent/allow/batch rules, task profile matching, configurable conflicts/fallbacks, and “why” display.
- **N03:** classifier evaluation, prompt-injection tests, evidence validation, hard latency/cost bounds.
- **N04:** bounded volatile queue, single digest, verified source deep links, allow-once/always and correction controls.
- **N05:** user walkthrough for original-alert muting and OS quiet mode; distinguish our allowed delivery path from affected/unsupported sources.

### Exit criteria

Show a live event from the chosen source taking an intended path **before our app displays it**, alongside urgent-rule pass-through and AI-timeout fallback. Original source data remains available. No duplicate/toast race is concealed by calling observe-after-delivery a block. A source-selection or authorization blocker keeps this milestone incomplete; a simulator is not a substitute.

## 8. M6 — trustworthy interventions and external beta

### Work items

- **R01:** centrally rate-limited adaptive suggestions after camera/input-rhythm evidence review; independently gate each source, with reason codes and easy correction.
- **R02:** optional desktop glow only on device-validated adapters; static/text alternatives and motion controls.
- **R03:** optional commitment break UI and separately authorized native locking only where verified; robust escape/crash/resume behavior.
- **R04:** full-day soak, performance/power profiling, accessibility review, manual permission checks, privacy/network inspection.
- **R05:** installer/uninstaller, macOS signing/notarization, Windows release signing path, audited dependency/model manifests and notices.
- **R06:** safe migrations, signed/version-verified updater if enabled, negative integrity tests, support diagnostics, user privacy documentation.

### Exit criteria

All applicable [privacy/safety release gates](PRIVACY_AND_SAFETY.md) pass, native test evidence exists for each advertised feature, and platform limitations are visible in onboarding/release notes. Do not label unknown OS features stable just because they compile.

## 9. Deferred experiments and scope controls

Approve separately, in this order of potential value:

1. **Extra real notification sources** and provider-native protocols, chosen by actual user demand.
2. **Finite boredom resets/mini-games:** user-requested, 30–90 seconds, no eye-rest claim, mandatory completion, or addictive reward loop.
3. **Opt-in app/domain context:** only if source rules/task declaration are insufficient; no automatic window-title/page scraping.
4. **GNOME/KDE companions:** separately versioned/installable, explicit maintenance and distribution plan.
5. **Phone-object detection:** separate small local detector, runtime/model license review, power budget, and confirmation UX; visible phone does not prove off-task use. No OCR of its screen.
6. **Posture/extra vision models:** only after demonstrating value and resource headroom.
7. **Native vision helper:** bring forward only if the camera feasibility gate requires it; allocate new integration/packaging effort.

Do not add custom model training, a vector database, cloud synchronization, organization dashboards, kernel services, or a mobile companion before the core has demonstrated benefit.

## 10. Validation plan

### A. Deterministic unit/property/scenario tests

Use synthetic feature traces and a fake clock, with no camera recordings or personal data in Git.

Required scenarios include:

- Typing, reading with little input, creative thinking, second monitors, and ordinary short look-aways.
- Input rhythm: held/repeated keys, normal editing versus alleged errors, IME/assistive input, secure-input gaps, sparse windows, cold start, device/DPI changes, and task-specific baseline mismatch.
- Transient blink versus longer closure, variable frame rate, dropped/duplicated/out-of-order frames, long gaps, and changing camera generations.
- Low light, blocked camera, unusable calibration, no face, track jumps, detected multiple people, and pose/eye disagreement.
- Sleep/lock/resume, wall-clock jump, native tick irregularities, device unplug, adapter restart, and app crash/restart.
- Urgent/allow/batch rule conflicts, repeated source events, source expiry, queue full, no model, schema-valid nonsense, malformed/oversized JSON, timeout/quota failure, and malicious instructions in source text.
- Busy focus override, meeting mode, simultaneous timer/camera/notification suggestions, rate caps, emergency exit, and a missing global shortcut.

Property-test invariants:

1. Revoked consent cannot produce new sensor-driven actions.
2. Unknown quality cannot increase enforcement.
3. A model cannot authorize a system action or modify user rules.
4. Explicit protected/urgent rules do not wait on classification.
5. A break/overlay never requires game success or sensor proof to exit.
6. No unbounded queue, frame buffer, retry loop, or stale-session replay exists.
7. Unsupported counters are missing rather than zero; missing camera time is not counted as closed-eye time.

### B. Model evaluation

Start with at least roughly 200 hand-reviewed synthetic/de-identified notification examples covering related/unrelated/uncertain cases, urgent exceptions, ambiguous language, long text, spoofed urgency, and injection attempts. Add realistic consented examples without putting confidential content into Git.

Report per-class precision/recall, important-item misses, fallback rate, sample sizes, disagreement reasons, schema validity, latency percentiles, and cost/resource use. Test multiple prompt versions on held-out examples. JSON validity is not semantic accuracy.

**Hard gate:** zero bypasses of explicit urgent/allow rules in deterministic fixtures. This is a test requirement, not a population guarantee. Initially auto-defer only items in categories the user explicitly allowed to be deferred. Do not enable high-consequence blocking on the strength of a small accuracy score or an uncalibrated model confidence number.

Evaluate coach tone separately: supportive/nonjudgmental responses, short task suggestions, explicit AI identity, no diagnostic claims, and no emotional pressure or dependence language. Include actual desired languages/wording once the user chooses them.

### C. Sensing and usefulness study

- Begin with a small voluntary alpha (for example 5–10 users) and describe results as exploratory.
- Include eyewear, varied lighting/appearances, cameras, monitors, input methods, and seated work styles. Never infer demographic identities from the camera; any study demographics need separate voluntary consent.
- Use voluntary tiredness/boredom/in-the-zone/reading/helpfulness reports as subjective labels, not clinical ground truth. Report missing labels and response bias; do not interrupt protected focus with repeated surveys.
- No induced sleep deprivation or safety-critical trials. No claim that acted yawns represent all real fatigue.
- Compare timer-only, idle-only, privacy-limited input-rhythm-only, and optional combined-camera behavior across ordinary work periods. Hold out whole later sessions/days, not overlapping windows from the same session; test only the feature detail that would actually ship.
- Measure unwanted nudges per observed working hour, user corrections, abstention/unknown coverage, perceived helpfulness, breaks chosen, and whether the companion itself becomes a distraction.
- A provisional UX target is fewer than one unwanted sensor nudge per working hour, with a default maximum of two nonurgent sensor nudges/hour. Publish actual rates and uncertainty; the cap alone does not prove good detection.
- Retain camera features in observation-only mode if they do not improve the experience. More reliable self-report may be preferable to a complex model.

### D. Platform/native tests

Minimum physical coverage before claiming stable support:

- GNOME/Wayland baseline, one supported KDE/Wayland setup, and genuine X11 for any claimed X11-only features.
- Windows 11 with actual permission/notification/lock behavior.
- Supported macOS with packaged-app camera/Input Monitoring flows and needed architectures.
- At least one laptop webcam, one alternative camera if supported, single/multiple monitors, and mixed DPI where relevant.

Use native UI automation where viable, but manually test first-run/revoked OS consent, screen locks, hardware capture, fullscreen, and monitor changes. Browser mocks do not verify global input, package identity, native notifications, or compositor overlays. Keep automation servers/test hooks out of production.

### E. Performance, privacy, and resilience

- Measure against [architecture budgets](ARCHITECTURE.md), recording exact hardware, process accounting, workload, and normalization.
- Test a full working day plus repeated start/pause/revoke cycles for leaks, freezes, abandoned capture, and queue growth.
- Test normal work while inference warms and runs; track missed UI frames and sensing gaps, not only tokens/second.
- Inspect local storage/logs/exports and network traffic under every mode. No prohibited data should appear in app-controlled artifacts.
- Run offline after provisioning; test the absence of implicit downloads, remote inference fallback, telemetry, and hosted tools.
- Exercise keyring locked/missing, disk full, corrupted/migrating database, provider failures, expired credentials, and model deletion.
- Test reduced motion, high contrast, screen readers, keyboard-only/assistive input, static-cue alternatives, and emergency escape.
- Reject corrupt/unsigned/mismatched-version update artifacts if updates are enabled; verify signing/notarization separately.

## 11. Definition of done for the first external beta

- [ ] The app is useful with no camera, no AI, and no global input access.
- [ ] Advertised platform features have real-device evidence and unsupported modes are clearly labeled.
- [ ] Capture and input collection stop promptly on pause/revoke/quit/lock; stale events cannot restart them.
- [ ] No prohibited raw sensing data is persisted, exported, or sent over a network; credentials exist only in the approved secret store/transient memory and go only to their explicitly authorized endpoint.
- [ ] Camera suggestions are opt-in, quality-gated, evaluated, and never presented as a diagnosis.
- [ ] Input-rhythm features are opt-in, independently available, privacy-tested, and useful over timer/idle baselines before any check-in; no automatic mood/boredom/flow claim.
- [ ] Model/provider choices are tested, licensed appropriately, bounded, and safely replaceable.
- [ ] One real notification source passes the controlled-delivery gate; unaffected sources are disclosed.
- [ ] Explicit urgency rules and conservative model-failure behavior are tested.
- [ ] Five-minute commitment UI/native locking are accurately distinguished; escape is always available.
- [ ] No flashing, game-completion requirement, or unsolicited mood inference ships.
- [ ] Retention/deletion/export/migration and credential-store fallbacks are tested.
- [ ] Full-day reliability/performance and accessibility checks pass on the stated reference devices.
- [ ] Installers, licenses/notices, dependency security, production capabilities, and any updater integrity checks are reviewed.
- [ ] Documentation explains uncertainty, privacy boundaries, exact source support, known failures, and recovery paths.

## 12. Immediate next step

The overall plan direction is approved. Confirm the exact Linux setup, then start **M0/F01–F07** with a small, measurable feasibility slice—not the complete monitoring/AI/gaming product at once. The first notification source remains an explicit decision for F04/M5; it does not block independent input/core feasibility work. No desktop permission, native-device success, or user-state accuracy is implied by the current documents.
