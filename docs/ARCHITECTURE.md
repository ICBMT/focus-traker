# Proposed architecture

**Status:** target design, not a claim that every diagrammed component exists. A simplified Rust/Tauri/React foundation is now implemented; see [IMPLEMENTATION.md](IMPLEMENTATION.md) for the actual layout, JSON storage, scoped experiments, and unverified native integrations. Decisions requiring a spike remain open.

**Product contract:** [PLAN.md](PLAN.md) · **Evidence:** [RESEARCH.md](RESEARCH.md) · **Delivery gates:** [ROADMAP.md](ROADMAP.md)

## 1. Architectural rules

1. The deterministic Rust core works without Tauri, a webcam, a network, or an LLM.
2. OS permissions, user consent, actual capability, and current sensor health are separate facts.
3. Raw camera frames and individual input events never become durable domain events.
4. AI receives bounded, explicitly permitted context and produces advice—not executable actions.
5. All side effects pass through Rust authorization and capability checks.
6. A missing/failed component reduces functionality; it does not increase intervention strength.
7. Platform differences are explicit in types and UI, not hidden behind misleading success results.

## 2. Runtime layout

```text
                         USER
               task / permissions / feedback
                          |
             Tauri UI: React + TypeScript
          main · settings · coach · break view
                          |
              narrow typed command/event IPC
                          |
 +-------------------- RUST HOST -----------------------+
 | Consent + capability registry                       |
 | Session controller + clock + lifecycle               |
 |                                                     |
 | Activity adapters ----> input/rhythm summaries        |
 | Camera worker -------> bounded vision feature samples|
 |                           |                         |
 |                 temporal feature engine             |
 |                           |                         |
 |               explainable evidence snapshot          |
 |                           |                         |
 |                 deterministic policy engine          |
 |                           |                         |
 |              authorized intervention controller      |
 |                /          |          \              |
 |        UI/tray/break    overlay     native lock*      |
 |                                                     |
 | Notification sources -> rules -> optional classifier |
 |                           |          |              |
 |                    allow/defer/digest |              |
 |                                      v              |
 | Coach requests -----------------> AI gateway         |
 |                               /            \        |
 |                 local Ollama          chosen API     |
 |                                                     |
 | SQLite worker: minimal history/settings               |
 | Secret store: credentials, separate from SQLite       |
 +-----------------------------------------------------+
 * Native lock is separately consented and supported;
   neither LLM output nor uncertain camera cues authorize it.
```

This is a local desktop app, not a hosted backend product. No cloud account or central server is needed for the core.

## 3. Proposed repository structure

The working slice currently uses root-level `src/`, `src-tauri/`, and `crates/focus-core/`. The following is an aspirational larger layout, not the current tree; split/migrate only when additional verified adapters justify it:

```text
apps/desktop/
  src/                       TypeScript interface
  src/vision/                camera lifecycle and vision worker
  src-tauri/                 Tauri executable, commands, capabilities
crates/
  focus-core/                sessions, clocks, windows, evidence, policy
  focus-platform/            traits and platform capability models
  focus-platform-linux/      D-Bus, supported Wayland, optional X11
  focus-platform-windows/    native Windows integrations
  focus-platform-macos/      public macOS integrations
  focus-ai/                  provider protocols, parsing, redaction
  focus-storage/             SQLite worker and migrations
  focus-test-support/        synthetic traces, fake clock/providers
packages/contracts/          generated TS contracts, if extraction is useful
models/manifest.json         URLs/hashes/licenses only, not model binaries
fixtures/                    synthetic, non-personal replay data
scripts/                     future checks and model provisioning
.github/workflows/           future CI and release workflows
docs/                        these planning documents
```

Keep the workspace small initially; split modules into crates when that reduces coupling. The tree is a boundary map, not a requirement to scaffold empty packages. Model weights, local databases, recordings, caches, `.env` files, credentials, build output, and test artifacts must be ignored/external, never casually added to Git.

### Candidate stack

- Rust stable, `tokio`, `serde`, `thiserror`, `tracing` with redaction.
- Tauri 2 and only required official plugins; assess single-instance, tray, notifications, dialog, and autostart individually.
- React/TypeScript/Vite, accessible semantic components and CSS; no large state framework initially.
- `reqwest` with bounded bodies, timeouts, cancellation, and TLS verification.
- `rusqlite` on a dedicated serialized worker; transactional migrations and retention jobs.
- Native credential-store crates from the keyring ecosystem, with explicitly selected platform stores.
- Linux candidate bindings: `zbus`, `wayland-client`, and an optional X11 binding; Windows: `windows`; macOS: targeted public API bindings, with a small Swift/ObjC bridge only when justified.
- Rust unit/property tests; Vitest/Testing Library; Playwright for browser UI; evaluate current WebdriverIO Tauri service for native UI tests.
- Consider Rust-to-TypeScript schema generation after testing the chosen tool's Tauri/version compatibility. Runtime validation remains necessary.

These are proposed dependency families, not installed packages or a claim that their current versions interoperate. Pin reviewed versions and lockfiles during implementation.

## 4. Platform contracts

Model capabilities independently:

```text
CapabilityReport
  os, desktop, session_type, adapter_versions
  idle_summary
  global_input_aggregation
  input_rhythm_features[]        # per-feature scope/availability; separate consent
  camera_capture
  camera_background_operation
  desktop_overlay
  native_lock_request
  global_shortcut
  notification_send
  notification_observe_after_delivery
  notification_gateable_sources[]
```

Each capability has `Available`, `NeedsPermission`, `Degraded`, `Unavailable`, or `Error`, plus a stable reason code. Store no identifying machine serial numbers.

A capability does **not** encode consent or healthy data. Track those independently. For example, camera hardware can be available while capture is declined, or permission can be granted while the camera is busy.

Suggested abstractions:

- `ActivitySource`: idle summary, optional coarse counters/rhythm summaries, per-feature scope, coverage, health and freshness.
- `VisionSource`: bounded scalar feature stream and capture health.
- `SessionLifecycle`: suspend, resume, lock, unlock, logout, display changes.
- `OverlayBackend`: show a noninteractive cue, stop it, report limitations.
- `ScreenLockBackend`: request an authorized native lock; report requested versus confirmed.
- `NotificationSource`: declared delivery semantics, source authentication, events and expiration.
- `NotificationSink`: display our own notice/digest and retain appropriate provenance.
- `SecretStore`, `HistoryStore`, `AiProvider`.

`NotificationSource` must distinguish `GateableBeforeOurDelivery`, `ObserveAfterDelivery`, and `Unsupported`. A native observer cannot implement a true gate by simply returning `defer` after the original popup has appeared.

## 5. Sensing pipeline

### Input activity

Prefer native idle summaries. Add optional global event aggregation only on verified platforms and after separate consent.

The native callback immediately increments counters/coarse active-time buckets and discards event details. Do not decode characters or forward key codes, individual event timestamps, clipboard contents, or cursor positions into the domain layer. Process pointer activity as active seconds or coarse distance totals, not a reconstructable path. Never block the OS callback on I/O or inference.

The optional constant-size input-rhythm accumulator may retain the immediately previous keyboard-press time and, when needed, one previous pointer position/time to update coarse histograms/counters; overwrite each on its next relevant event rather than recording an event sequence or per-key/device map. Separately consented Backspace/Delete category counts are editing activity, not an error rate. Exclude per-key/hold/digraph signatures. Start with roughly 30-second summaries, at most two minutes of rolling summary state, explicit sample/coverage validity, and bounded aggregate baseline statistics. Disable unsupported metrics independently.

Compare only compatible user-selected work styles and baselines. Add a pure Rust rhythm comparison stage yielding `Unknown | Steady | Changed`, not a mood label or an LLM decision. No rhythm measurements/baselines go to a model or ordinary history. Details and validation are in [INPUT_RHYTHM.md](INPUT_RHYTHM.md).

Expose unavailable counters as missing, **not zero**. A zero count means a working source observed zero events. Input inactivity is not automatically absence, boredom, or poor work.

### Camera and vision

Initial candidate:

1. User enables a session's camera and approves the selected device.
2. A trusted local capture host requests video only—no microphone.
3. Transfer the latest frame to a dedicated worker running bundled MediaPipe Tasks Vision/WASM.
4. Extract per-frame scalars: eye aperture/closure coefficients, approximate head pose, optional mouth opening, detection/geometry quality, timestamp, sequence, and capture generation.
5. Discard image/landmark data as soon as needed for that frame; close transferred image resources.
6. Rust validates/receives only those bounded scalars, then computes rolling features.
7. Publish a coalesced evidence snapshot at roughly 1 Hz; do not push video-rate UI updates or database writes.

MediaPipe's calls are synchronous; worker execution is a requirement of this candidate, not a claim of an asynchronous detector. The exact WebView implementation must pass the camera spike. [4](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.facelandmarker)

**Background operation is a go/no-go test:** hidden/minimized capture, OS privacy prompts, worker scheduling, tray lifecycle, power saving, and permission revocation. If it fails, investigate a native helper with documented camera APIs and a complete, licensed inference pipeline. Preserve Rust domain contracts. Do not silently add a Python environment, force another display session, or claim `ort` can execute a MediaPipe `.task` file unchanged.

### Sampling and temporal metrics

- Starting experiment: 640×480 capture and approximately 15–20 usable feature samples/second for closure timing. These are trial settings, not proven sufficiency or hardware guarantees.
- Low-power presence-only mode can run slower but disables any blink-duration metric not validated at that sampling rate.
- Keep one in-flight frame plus at most one newest pending frame; drop obsolete frames instead of accumulating latency.
- Use monotonic sample time and explicit observation gaps. Never extend an eye closure across missing frames.
- Initial research windows: about 60 seconds for trends and up to 120 seconds of volatile feature state. Revisit after evaluation.
- An estimated closure fraction is time-weighted: estimated closed **validly observed** time divided by validly observed eye time. Low coverage yields unknown; missing time belongs in neither numerator nor denominator.
- Define whether ordinary blinks are excluded before comparing with PERCLOS literature. Version the definition. A blendshape value is not a calibrated physical closure percentage.
- Treat yawns versus talking, head pose versus second-monitor work, and eye strain versus drowsiness as unresolved distinctions.
- Compare a maximum-two-face configuration with its own smoothing against alternatives in the spike. Suspend adaptive judgments on detected ambiguity or track discontinuity; do not identify faces.

### Calibration

Store a versioned, setup-specific baseline only if the user asks to retain it. Start with guided natural viewing, comfortable closed/open-eye examples if the user wants, and normal head positions across their monitors. Let the user skip any movement. No demand for fast reactions or medically uncomfortable maneuvers.

Do not average “fatigue” into a continually drifting normal baseline. Recalibration is explicit when the camera/setup changes or signal quality deteriorates. If calibration fails, camera suggestions stay unavailable; timers still work.

## 6. State and decision model

Do not use one state enum that forces “focused” and “tired” to be mutually exclusive.

### Independent dimensions

- **Session phase:** idle, calibrating, working, paused, break-planned, break-active, complete.
- **Observation:** available/partial/unavailable plus source coverage and freshness.
- **Attention hypothesis:** unknown, user-confirmed-working, working-steadily-candidate, possible-attention-shift.
- **Input rhythm:** unknown, steady, changed; baseline status and feature quality are separate. No automatic boredom/flow/mood enum.
- **Rest cues:** unknown, no-suggestion, possible-rest-need.
- **User context:** task, reading/thinking, meeting/presentation, protected focus, optional voluntary bored/stuck/in-the-zone feedback, explicit preferences.
- **Delivery:** quiet-mode configuration known/unknown, source gateability, deferred count.

Quality scores and evidence strength are heuristic bookkeeping unless separately calibrated. Never turn them into a displayed probability that the person is focused or tired.

### Evidence and decisions

Every candidate action carries:

- Applicable consent/capability state and policy version.
- Timestamp, source quality/coverage, and stale-data status.
- Stable evidence/reason codes; no saved camera frame or notification body.
- Proposed action, permitted intensity, cooldown and override status.
- A deterministic fallback message. AI wording may paraphrase facts but may not invent observations.

### Policy priority

1. Pause/quit/revoked consent wins; terminate sensor work and cancel stale generations.
2. Lock/suspend/logout and active breaks stop sensing and prevent new intrusive prompts.
3. Meeting/presentation mode suppresses discretionary overlays, games, auto-chat, and automatic native locking. Use manual mode when automatic meeting detection is unavailable.
4. Honor explicit urgent-source rules and the user's chosen timer/commitment contract.
5. Honor protected-focus and “still working/reading” overrides when considering nonurgent adaptive nudges.
6. Low-quality, insufficient, or stale evidence cannot escalate an intervention.
7. Only sustained, eligible hypotheses may produce a gentle optional suggestion.
8. Apply cooldowns and a global cap to prevent competing components from interrupting separately.

**Trial UX policy:** at least 10 minutes between nonurgent sensor-driven nudges, at most two per working hour, and roughly 45–90 seconds of sustained attention-shift evidence before even asking. These are tunable product hypotheses, not medical thresholds. Chosen timer reminders are separately configured and not misreported as sensor detections.

Use hysteresis and minimum dwell time to prevent flickering between hypotheses. Glances, low input alone, one yawn, or one blink never authorize a forced break. A “working steadily” candidate cannot silently erase the user's explicit break schedule.

### Commitment breaks and native locking

- Default: suggestion/reminder only.
- Commitment mode: explicitly enabled for a session; visible advance warning and cancellation, then an escapable five-minute app break UI.
- Any native-lock option is separately authorized, platform-verified, and never derived from LLM instructions or an inferred emotional state.
- The app countdown may end after five minutes; an actual OS lock still needs normal user authentication, and early login is not prevented.
- No repeated relocking, login credential collection, keyboard grabbing, or privileged lockout service.
- On crash/restart/resume, do not replay an overdue lock or automatically reapply a stale break overlay.

## 7. Notification pipeline

```text
Authorized source event
  -> normalize + authenticate provenance + bound text
  -> deduplicate / expire
  -> urgent and explicit user rules
  -> task/source rules
  -> eligible optional AI advice (with content-sharing permission)
  -> validate + deterministic policy resolution
  -> allow once | defer in bounded queue | quiet uncertainty review
  -> digest / source deep link / feedback
```

Rules always retain authority. The model is not allowed to alter source urgency, identity, permissions, exception lists, or the delivery deadline.

### Proposed classifier output

```json
{
  "relevance": "related",
  "advice": "allow",
  "reason_code": "TASK_MATCH",
  "evidence_ids": ["task.project_term.0"],
  "short_reason": "Mentions the project selected for this session."
}
```

The schema constrains enums, lengths, array sizes, and extra fields. Evidence IDs must exist in the provided context; reasons must not assert unavailable facts. `uncertain` is supported. Do not treat the model's self-reported confidence as a calibrated probability.

### Fallback semantics

- Explicit urgent/allow rules: immediate delivery through an available, user-configured channel; no AI wait.
- Other potentially important events: if classification fails, times out, is malformed, or is uncertain, default to allow rather than silently hide.
- A source the user explicitly put in a low-priority batch-only category can continue batching according to that rule without AI.
- “Ask” means a quiet item in the inbox, not a new modal interruption for every classification.
- Unsupported native sources are unaffected. Do not call them protected.
- Do not clear/remove native source notifications by default. Original content/actions remain owned by the source. Use only verified deep links/actions on explicit user click, never replay arbitrary payload commands.

Initial in-memory queue budget: 100 items, source-defined expiration with a 24-hour upper cap, deduplication and provenance. Expiration or app restart may discard our queued copy; disclose this and preserve originals at the source. Crash-durable message storage is a later, separately consented encrypted-content feature—not something ordinary SQLite provides by default.

## 8. AI provider abstraction

`AiProvider` supports optional model discovery, model metadata/capability inspection, a small explicit test, bounded classification, streaming chat, and cancellation. Unsupported methods are reported, not emulated with misleading success.

### Configuration workflow

1. Select protocol/preset: Ollama native, OpenAI-compatible, then later native provider adapters.
2. Enter endpoint and, if required, a credential in a transient password field. Save directly through a restricted Rust command; do not persist it in renderer state/storage or return it after saving.
3. The backend validates the endpoint, uses the OS secret store, and returns only masked status/credential reference.
4. List models with pagination, cache briefly, permit manual model IDs/deployment configuration, and mark unsupported discovery honestly.
5. User approves a small test request and sees capability results separately for chat, streaming, and schema output. Discovery or schema support does not prove semantic accuracy.
6. Select model per role. Defaults use one small model and short context, not multiple permanently loaded models.

### Network and credential boundaries

- Rust makes all provider requests. Production renderer code never talks directly to model servers or carries authorization headers.
- A local desktop backend may call the user's loopback Ollama service. A hosted browser preview cannot reach that user's loopback via the sandbox; use mocks or an explicitly implemented relative-URL proxy for development, never hard-coded browser `localhost` calls.
- Permit HTTPS remote endpoints; plain HTTP only for explicitly configured loopback/local-development use. Remote/LAN inference is not “on-device.”
- Disable credential-bearing redirects by default; reject embedded URL passwords, unsafe schemes, unexpected hosts, and unapproved endpoint changes. Do not expose a general-purpose HTTP-fetch IPC command.
- Isolate authentication headers by provider/endpoint. Revalidate/redact error messages, URLs, request bodies, and logs; never place an API key in a logged query string.
- Validate DNS/address policy as appropriate for custom endpoints; do not let a notification/model response select network destinations.
- Strict-local mode blocks automatic remote fallback and hosted tools. An independent Ollama server's no-cloud setting requires user cooperation and cannot be silently proven from the HTTP hostname alone.

### Scheduling and budgets

- Inference is event-driven, not per keystroke or per frame.
- Known notification rules avoid LLM calls. Cache bounded classifications by source/task/content hash for only a short session-scoped duration.
- Start with 2–4K context and short classifier replies; coach responses are concise with Stop and Retry.
- Give classification a short deadline (initial experiment: two seconds). A CPU-only model that misses it gets rules-based fallback, not a frozen notification pipeline.
- One inference job at a time by default, with priority/cancellation and backpressure. Foreground chat must not create an unbounded backlog.
- Model warmup is explicit and visible. Do not download, pull arbitrary models, sign in, or run installation scripts automatically.
- Respect battery/load limits and cap cloud requests/tokens. Cost estimates need user-supplied pricing unless a provider provides trustworthy pricing metadata; they are not account billing totals.
- Do not kill the user's Ollama process or forcibly unload models shared with other apps. Document any requested keep-alive behavior.

## 9. Persistence and retention

Proposed logical tables:

| Table | Purpose |
| --- | --- |
| `tasks` | User-entered goal and explicitly chosen context |
| `sessions` | Start/end, active-session duration, mode, completion status |
| `breaks` | User choice, configured duration, actual completion/skip |
| `decision_events` | Reason codes, policy version, action and user feedback, no raw content |
| `settings` / `consents` | Versioned preferences and feature consent history |
| `provider_profiles` | Protocol, endpoint, selected model IDs, credential reference only |
| `notification_rules` | User-approved source/identity/project rules |
| `calibration_profiles` | Optional camera calibration or small input-rhythm baseline scalars, work-style/algorithm/setup version; no raw sequences |
| `activity_aggregates` | Optional coarse minute counts; disabled by default; no interval histogram/window history |
| `chat_history` | Optional user-enabled history, disabled by default |

Raw frames, landmark arrays, input events, exact per-key timings, and default queued message bodies have **no table**.

Use atomic migrations with backup/recovery, a single database worker, size caps, local retention jobs, and versioned export/import formats. SQLite is not encrypted by default; native credential storage is not database encryption. The retention defaults and deletion limitations are specified in [PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md).

## 10. Tauri trust boundaries

Suggested surfaces:

- **Main/settings:** session/preferences and narrow consent/provider-configuration commands.
- **Coach:** chat request/cancel and approved task context; no secret retrieval, native lock, or broad file/shell/network commands.
- **Break UI:** render countdown, snooze/exit/complete through policy-checked commands.
- **Overlay:** render/stop a cue only; ideally no interactive privileged IPC at all.
- **Camera host:** authorized camera lifecycle and validated feature submission only.

Declare custom-command permissions explicitly; Tauri does not automatically scope every registered application command to the intended window. [2](https://v2.tauri.app/security/capabilities/)

Block navigation to remote pages in privileged WebViews, bundle scripts/fonts/models, sanitize model/source text, and prohibit arbitrary HTML execution. Apply a strict CSP; allow only narrowly required WASM/worker behavior after testing rather than disabling CSP. External links open only after scheme validation/user action in the system browser without application privileges.

## 11. Lifecycle and failure behavior

| Event | Required behavior |
| --- | --- |
| Pause all | Stop camera tracks, detach/stop optional input listeners, clear volatile buffers/queues as configured, cancel model jobs, stop overlays |
| Permission revoked | Stop affected source promptly; label unavailable; no repeated permission prompts or escalating reminders |
| Camera missing/busy/frozen | Reject stale data; retain timer/rules-only functionality; offer an actionable status |
| Main window closes | Hide only if background behavior is enabled and a visible reachable status/exit path exists; otherwise do not leave invisible monitoring |
| OS locks/sleeps or user logs out | Stop camera, flush minimal session checkpoint, cancel interactive prompts and inference |
| Resume/unlock | Clear stale windows; no “fatigue” inference from missing time; no immediate forced overdue lock |
| Provider down/quota exhausted | Continue rules/timers, show status; no silent cloud fallback |
| Queue/database full | Apply explicit bounds; preserve controls, report degraded history, never block input callbacks |
| App crash | No data recording or soft enforcement survives as an unowned background process; normal OS lock behavior remains OS-owned |
| Display/desktop changes | Stop invalid overlays, re-probe adapters, never leave an input-blocking surface |

Use a generation token for each capture/session so late worker messages cannot restart monitoring after consent is revoked. Separate wall time for reports from monotonic time for policy. Handle suspend and wall-clock changes explicitly; do not count a sleeping machine as continuous work or proof of recovery. After an unclean exit, offer to review the session rather than automatically restoring enforcement.

## 12. Initial performance targets — not measurements

Reference device: 16 GB RAM, integrated graphics, CPU-only inference; exact CPU/camera still unknown.

| Component | Trial budget / acceptance intent |
| --- | --- |
| Rules/timer-only CPU | Under 1% total machine CPU while idle, measured over a representative interval |
| Camera-enabled sensing CPU | Aim under 10% total machine CPU on a defined four-core-equivalent reference; publish the normalization and actual hardware |
| Desktop app memory, excluding Ollama | Aim under 700 MiB total measured app/WebView process RSS; report shared-memory accounting caveats |
| Local model | Measure total additional RSS, context/KV overhead, cold load and warm inference; download size is not a RAM budget |
| Interactive policy work | Aim below 25 ms per 1 Hz evaluation under replay/load tests |
| UI | Keep controls responsive during capture, model warmup, streaming, and camera failures |
| Camera throughput | Validate useful temporal metrics at actual measured sampling; degrade features instead of inventing precision |
| Storage | Minute/event-level writes, bounded history, no frame-by-frame persistence |
| Notifications | Rules immediate; missed AI deadline falls back without blocking the source indefinitely |

If these targets fail, first reduce redundant inference/updates and offer a lower-power mode. Never lower sampling and continue presenting precise blink measurements without revalidation. The useful product must still work with sensing/AI disabled.

## 13. Decisions intentionally deferred

Exact crate/plugin versions, final native vision fallback, clinical-style fatigue thresholds, universal “focus scores,” first real notification source, GNOME companion packaging, Mac overlay implementation, minimum supported OS versions, and final model default all depend on the [feasibility and validation work](ROADMAP.md). No implementation claim is implied by this architecture.
