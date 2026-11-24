# Focus Tracker — product and implementation plan

**Release decisions (2026-11-19):** owner selected MIT licensing, signed public distribution, and Ubuntu/GNOME as the first physical-device target. Exact Ubuntu version/session and signing credentials remain unverified. Current scope/release gates are in [RELEASE.md](RELEASE.md).

**Date:** 2026-11-19

**Status:** overall direction and implementation authorized by the user on 2026-11-19, including the keyboard/mouse rhythm experiment. A portable foundation is now implemented; this approved plan covers a wider, partly unimplemented product. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for actual features/evidence. Native and sensor feasibility gates remain open.

**Working name:** Focus Tracker (the repository name remains `focus-traker`)

## 1. The product we are building

A personal desktop companion that helps someone start a task, protects their attention while they work, notices *possible* signs that a pause would help, and offers a small, supportive reset when asked.

The goal is **fewer unwanted interruptions and healthier, user-controlled work sessions**, not more surveillance or higher keyboard activity.

### Confirmed by the user

- Linux is the first priority, while Windows and macOS should be developed alongside it.
- Rust handles the native application, with a web interface inside Tauri.
- Design around a 16 GB laptop without a dedicated GPU.
- Use existing webcam, keyboard, and mouse/touchpad hardware.
- Investigate changes in keyboard/mouse interaction style as possible cues for boredom and steady work; feasibility and interpretation must be validated.
- Support local Ollama, including evaluation of `qwen2.5-coder:3b`, and a user's own model-provider credentials.
- Include work-aware notification handling, break recommendations, gentle screen-edge cues, optional mini-games, and a supportive side-chat.

### Recommended product boundaries

1. **Local-first and optional sensing.** Camera-free and AI-free modes are first-class.
2. **Rules decide actions; AI advises and explains.** The model cannot issue arbitrary system commands, change permissions, or independently lock the computer.
3. **Uncertainty is visible.** “Possible fatigue cues” and “signal unavailable” are valid results. Do not present a fabricated percentage of focus or a medical diagnosis.
4. **Protect reading and thinking.** Little input, looking away, a phone in view, or a neutral expression is not proof of distraction.
5. **No universal notification-interception claim.** Support depends on the notification source and OS; show that distinction in the interface.
6. **Breaks are not punishment.** Never make winning a game a condition of using the computer.

The user has approved the overall direction. Exact dependency choices, experimental thresholds, permission scope, and the remaining product decisions still depend on feasibility work and the open questions below.

## 2. What is feasible, and what needs reframing

| Requested experience | Proposed implementation | Boundary | Delivery |
| --- | --- | --- | --- |
| Track keyboard/mouse behavior | Idle time, activity bursts, coarse counts where permitted; no typed text or cursor trails | Global counts are not portable on Wayland | Core MVP, capability-dependent |
| Notice changes in input style | Optional local cadence/burst/pause summaries, editing-key counts, pointer-style aggregates, and within-person task-specific baseline | Changed rhythm is observable; boredom, mood, and psychological flow are not established by it | F07 feasibility, observation-only pilot, then validation-gated check-ins |
| Notice eye-related tiredness | Local face landmarks, calibrated eye-closure trends, signal quality, head-pose trends | Experimental wellness cues, not fatigue measurement or exact gaze | Camera beta after validation |
| Recognize flow and leave the user alone | User-selected focus protection, sustained session context, optional “working steadily” estimate | Flow cannot be established from the three sensors alone | Core rules first; estimate later |
| Distinguish work notifications | Task profile + explicit source/person/project rules + optional text classification | Needs authorized notification content; sensors alone cannot determine relevance | Controlled-source beta |
| Stop distractions but pass relevant items | Gate messages from integrated sources before our app displays them; assist OS quiet-mode setup | Most native notification APIs do not provide a universal pre-display veto | Per-source integrations |
| Detect phone use | Optional, separate local object detector plus context and user confirmation | A phone being visible does not establish use or irrelevance; may be off-camera | Later experiment |
| Smoothly flicker screen edges | Replace flicker with an opt-in low-contrast fade/glow; static alternative | Native desktop overlays differ by compositor; no strobing | Supported platforms after spike |
| Suggest coffee or a break | User-chosen wording; water, stretch, walk, or look-away alternatives | No prescribed caffeine or claim that five minutes cures fatigue | Core MVP |
| Five-minute lock | Five-minute commitment break UI; optional native lock on verified platforms | App overlay is bypassable; OS lock cannot safely guarantee “no login for five minutes” or automatic unlock | Commitment mode later |
| Mini-games when bored | User reports boredom, then optionally chooses a short, finite reset | Not during an eye-rest break and not auto-opened from facial inference | After core beta |
| Emotional support side-chat | Optional, clearly identified AI coach; encouragement, task breakdown, short conversation | Not a therapist or facial emotion reader; does not promise to improve mood | AI beta |

The underlying research and citations are in [RESEARCH.md](RESEARCH.md), with operational differences in [PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md).

## 3. The everyday experience

### A. First launch

1. Explain local processing, what is never collected, and how to pause or quit.
2. Let the user start a timer **without granting any sensor permissions**.
3. Offer separate permission steps: idle/activity, camera, notification source, then optional cloud AI. Show why each helps and what happens if it is declined.
4. Show a capability check rather than a blanket “Linux supported” label: idle detection, global activity counts, camera, overlay, notification gating, native lock.
5. Choose rules-only, local Ollama, or remote provider. No model download or paid test request without consent.
6. Optional camera calibration with preview, camera-on indicator, lighting/eyewear guidance, and a stop button. Start with roughly 60–120 seconds, then validate whether that is enough.

### B. Start a session

Ask: **“What are you working on?”**

A task profile contains:

- A short goal, such as “Implement the login form.”
- Work style: coding/writing, reading/studying, creative thinking, or meeting/presentation.
- Optional project terms, approved applications, sources, people, channels, and domains.
- A work/break preset or custom timing. Offer 25/5 and 50/10 as preferences, not scientifically optimal schedules.
- Camera choice and intervention intensity for this session.
- A clear “protect my focus” switch and an always-available “I am still working” control.

Do not inspect documents, browser pages, screenshots, clipboard, or microphone to fill in task context automatically. Additional context integrations require separate opt-in.

### C. While working

- The main window can hide; a tray/menu-bar entry or equivalent visible status remains.
- The app shows session time, available signal categories, and the current reason for a suggestion—not a productivity grade.
- In protected-focus mode, it batches nonurgent **controlled-source** notifications and avoids games, unsolicited chats, and repeated nudges.
- A passing glance, an ordinary blink, reading with no input, or a temporary camera failure causes no reprimand.
- If there is sustained, usable evidence and the user has enabled adaptive suggestions, offer: “Would a short pause help?” Include “Not now,” “I'm reading/thinking,” and “Take a break.”
- An explicit timer the user chose can still become due even if sensing is unavailable. Explain whether a reminder came from a schedule or from experimental cues.

### D. Breaks and returning

Offer different interventions rather than treating them as interchangeable:

1. **Look-away microbreak:** optional 20-second timer; encourage looking at a distant object, not at an animated screen target. The 20-20-20 idea is optometric guidance, not a treatment guarantee. [1](https://www.aoa.org/healthy-eyes/eye-and-vision-conditions/computer-vision-syndrome)
2. **Physical rest:** a user-chosen pause, commonly five minutes, for movement/water/rest. Camera stops by default; there is no “prove you rested” monitoring.
3. **Bored/stuck reset:** user-requested 30–90 second finite puzzle, breathing guide without breath-hold demands, or a brief chat. Offer a screen-free alternative. These do not count as an eye-rest break.
4. **Commitment break:** optional pre-authorized countdown and break UI, with visible emergency exit. It ends its own UI after five minutes; it does not bypass OS authentication.

Afterward: “Continue the same task, pick one small next step, or finish?” Provide a compact digest rather than a burst of delayed popups.

### E. Session review

Show work-session duration, breaks taken, user-rated helpfulness, deferred-item count, and sensing coverage. Allow corrections and deletion. “Time in a focus session” is not the same as verified focused time. Do not score the person for typing speed, expression, or break compliance.

### F. Interface map

- **Today/session:** task, timer, protected-focus toggle, sensing status, pause, and one small next action.
- **Task setup:** work style, allowed sources/people/project terms, timing, and intervention preferences.
- **Notification inbox:** allowed/deferred items, source coverage, concise reasons, digest, and correction controls.
- **Break view:** clear countdown, rest choices, snooze/exit, and a return-to-task action; no forced puzzle.
- **Coach:** user-opened side panel or separate compact window, with Stop, provider/privacy status, and optional history.
- **Privacy/settings:** per-feature consent, capability diagnostics, calibration, models/credentials, retention/export/deletion, motion controls, and quit behavior.

Avoid opening several windows automatically. Desktop positioning/always-on-top behavior is capability-dependent, particularly on Wayland; the coach must also work as an ordinary user-opened window or in-app panel.

## 4. Sensing design

### What we observe

- **Camera:** face/eye visibility, eyelid geometry, approximate head orientation, prolonged closures, and optional mouth-opening events.
- **Keyboard/mouse:** time since input; aggregate counts/active seconds, and optional privacy-limited rhythm summaries only when the platform can supply them appropriately. A touchpad generally contributes pointer activity, not separate physiological measurements.
- **User context:** chosen task, session mode, timer, and explicit feedback.

### Keyboard/mouse rhythm extension

The requested extension goes beyond idle detection: compare coarse typing cadence, bursts/pauses, optional editing-key proportions, and pointer activity/style with this person's baseline for comparable tasks. Process locally in Rust; do not record text, per-keystroke sequences, or cursor trails. This experiment can operate without a camera or an LLM.

Keep observation (**steady / changed / unknown**) separate from interpretation. Let the user voluntarily confirm “in the zone,” “bored/stuck,” or “reading/thinking.” Slow typing, many deletions, or sparse mouse activity alone must not be treated as boredom, mistakes, or poor work. Compare against timer/idle baselines before enabling an optional check-in. The research rationale is in R26–R27 of [RESEARCH.md](RESEARCH.md).

The complete feature/consent contract, personalization rules, platform fallbacks, and acceptance gate are in [INPUT_RHYTHM.md](INPUT_RHYTHM.md).

### What we may cautiously infer

- A possible change in rest-related cues relative to a personal baseline.
- A possible attention shift worth asking about, after a sustained interval and with low confidence handled conservatively.
- A candidate “working steadily” period for reducing our own interruptions.

### What we will not claim

Reliable automatic identification of exact on-screen gaze, boredom, emotions, phone intent, clinical fatigue, ADHD, depression, heart rate, HRV, blood oxygen, or true psychological flow from this pipeline. User-reported states remain distinct from sensor-derived hypotheses. Facial blendshapes are model coefficients, not emotional diagnoses. Existing evidence cautions against treating facial movements as reliable emotional labels. [5](https://www.apa.org/monitor/2020/10/behind-smile)

### Quality before inference

- Calibrate to the current camera, eyewear, posture, and monitor setup; do not silently adapt the baseline toward worsening closure trends.
- Use timestamped windows, separate low light/occlusion from eye closure, and discard stale or missing observations.
- A low-frame-rate power-saving mode may support presence checks but must disable unvalidated blink-duration metrics.
- Multiple visible people, track jumps, major head turns, and conflicting cues should cause abstention where detectable. There is no face recognition to identify the owner.
- Ship adaptive camera suggestions initially in observation-only mode. Enable interventions only after the [validation gates](ROADMAP.md) pass.

## 5. Notification protection

This is the biggest platform constraint, not simply an AI prompt-writing problem.

### Three separate capabilities

1. **Controlled-source gating:** a source integration delivers an event to our app before our app chooses to display it. We can allow, defer, or put it in a digest. Original alerts must be muted/configured separately to avoid duplicates.
2. **Observe-after-delivery:** a platform lets us read notifications already added to its notification system. Useful for a digest, but it may already have interrupted the user.
3. **Unsupported:** no authorized integration exists. Explain how to configure OS Focus/Do Not Disturb manually; do not pretend the source is filtered.

Windows provides a permissioned notification listener, but its documented interface concerns current notifications and changes, not a pre-delivery approval hook. macOS's public notification-center method is scoped to the app's own notifications. Linux's standard uses a single notification-server service, not a portable filter-chain API. [1](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener) [1](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/getdeliverednotifications(completionhandler:)) [1](https://specifications.freedesktop.org/notification/latest-single/)

### Decision order

1. User-approved urgent sources/people and protected categories bypass AI.
2. Apply explicit task/source rules, resolving conflicts transparently.
3. If the event is eligible and the user permits sharing its text with the selected model, ask for structured relevance advice and a short evidence-grounded reason.
4. Validate the output. Uncertain/failed/late classification uses the user's declared fallback; never silently discard a potentially important item.
5. Keep a bounded deferred queue, release a digest at a chosen boundary, and provide “allow once/always” and “this was important” feedback.

The LLM does not control OS notification settings. We must also configure our app's own allowed delivery path if OS quiet mode would otherwise silence the relevant notifications it reissues.

## 6. AI and model selection

### Supported routes

- **No model:** templates, schedules, rules, and all privacy controls continue to work.
- **Ollama native adapter first:** list installed models, inspect metadata, test the selected model, stream chat, and request structured classifier output.
- **OpenAI-compatible provider adapter:** user supplies an endpoint, credential, and model selection; capability tests establish the supported subset.
- **Provider-native adapters later:** separate adapters for providers whose authentication, model listing, streaming, or request formats differ. An API key is not a universal protocol.

Allow different models for chat and classification, but default to a single small model to reduce memory usage. Model lists need a manual model-ID fallback and a real test request: being listed does not prove a key has working quota or the required capability.

### About `qwen2.5-coder:3b`

Support it as an evaluation candidate, not an irrevocable default. Its published default quantized tag is about **1.9 GB of model data**, not 1.9 GB total runtime memory, and it is code-specialized. The tag links a **Qwen Research License** whose grant is for noncommercial purposes; obtain appropriate permission or choose another licensed model before use outside that grant. Local or separately downloaded does not remove license obligations. [1](https://ollama.com/library/qwen2.5-coder:3b)

For this coaching/classification use case, benchmark a general-purpose candidate such as **`qwen3:4b`**, whose current library entry lists Apache 2.0 and about 2.5 GB of model data, alongside a smaller fallback. This is a candidate, not a measured speed/quality recommendation. [1](https://ollama.com/library/qwen3:4b)

Strict-local mode must exclude cloud-backed model routes and hosted tools, not merely connect to a loopback address. Ollama documents disabling its cloud features with `OLLAMA_NO_CLOUD=1`; apply that to the Ollama server configuration with the user's approval, rather than silently changing their installation. [1](https://docs.ollama.com/faq)

### Supportive chat

- Open on user request, or show a quiet invitation only if the user opted in.
- Be warm, brief, and nonjudgmental; help split a task into a small next action.
- Do not infer sadness or boredom from camera signals or promise therapeutic benefit.
- Keep chat separate from the notification classifier and its untrusted inputs.
- No shell tools, browsing, autonomous messages to others, or permission changes.
- Never send video, images, landmarks, or raw input to a model. Remote notification text requires its own explicit permission.

## 7. Recommended technical direction

| Area | Recommendation |
| --- | --- |
| Desktop shell | Tauri 2, pinned stable versions after feasibility testing |
| Native logic | Rust; deterministic core separated from OS adapters |
| Interface | React + TypeScript + Vite, accessible CSS, no remote UI assets |
| Vision prototype | MediaPipe Tasks Vision/WASM in a worker; packaged model/runtime assets |
| Background-camera fallback | Time-box a native capture/inference helper if WebView lifecycle tests fail; do not assume a `.task` model can be run by an ONNX library |
| Network/model I/O | Rust `reqwest` + `tokio`, timeouts, cancellation, per-provider adapters |
| Local persistence | SQLite through a serialized `rusqlite` worker; no secrets in the database |
| Credentials | Native credential stores, or memory-only when unavailable |
| Desktop integrations | Linux D-Bus/Wayland/X11 adapters; Windows APIs; macOS public APIs with minimal native bindings |
| Testing | Rust unit/property/replay tests; TypeScript unit tests; browser UI tests; native desktop tests and real-device checks |

Detailed component contracts and budgets: [ARCHITECTURE.md](ARCHITECTURE.md).

## 8. Delivery scope

### First useful version

Task sessions, timer/break controls, progressive permissions, capability reporting, idle sensing where available, tray/menu controls, local settings/history/deletion, and a useful no-AI/no-camera mode. Keep Windows/macOS builds and native adapters in the same delivery cycle.

An optional observation-only input-rhythm pilot can join this stage after F07, with separate consent, baseline/reset controls, and no camera dependency. Missing global input access leaves this feature unavailable rather than weakening privacy.

### Adaptive/AI beta

Calibrated local camera experiment, separately evaluated input-rhythm cues, bounded suggestions, local Ollama and one remote protocol, supportive side-chat, notification-rule simulator, then **one** real controlled notification source chosen with the user. Real source integration is a separate milestone from the simulator.

### After the core is trustworthy

Commitment mode, supported desktop-edge glow adapters, short games, additional notification sources/provider protocols, opt-in app/domain context, and optional phone-object detection. Do not train a custom model before establishing a useful baseline.

### Not in the initial product

Employer dashboards, employee scoring, covert recording, face identification, screen recording/OCR, microphone-based emotion detection, kernel input capture, privileged lockout services, guaranteed five-minute OS access denial, and universal interception of arbitrary applications.

## 9. Decisions still to make

These do not prevent approval of the architecture, but they gate implementation details:

1. **Exact Linux environment:** distribution/version, desktop, Wayland or X11, camera type, and number of monitors. Provisional lab baseline: Ubuntu 24.04 LTS GNOME/Wayland plus a supported KDE/Wayland system.
2. **First notification source:** which actual application/channel matters most? Agree on its official integration/authentication route and how original alerts are muted. Do not pick a source on behalf of the user.
3. **Release intent and code license:** personal research, open source distribution, or commercial use? Do not assume a repository license or a model license choice.
4. **Break commitment:** approve an escapable five-minute app break versus optional native locking; neither is advertised as tamper-proof timed OS enforcement.
5. **Physical test machines:** access to Windows and macOS devices or volunteer testers. CI alone cannot verify webcams, permissions, monitor overlays, or native notification timing.

**Next action:** the overall plan direction is approved. Confirm the exact Linux environment and run the feasibility milestone, including the new input-rhythm experiment, before building a large application. Choosing the first notification source gates that integration, not independent core/input research. See [ROADMAP.md](ROADMAP.md).
