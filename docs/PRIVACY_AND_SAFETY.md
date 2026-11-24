# Privacy, safety, and trust plan

**Status:** standing product requirements, not a claim of audited compliance. The current foundation implements a subset; [IMPLEMENTATION.md](IMPLEMENTATION.md) documents actual plaintext storage, consent scopes, tests, and remaining gates.

**Scope:** a voluntary personal desktop companion, not workplace surveillance, a medical device, or a system security product.

## 1. Non-negotiable defaults

- No camera access before a deliberate opt-in; no autostart monitoring without separate approval.
- No microphone, clipboard inspection, face identification, or stored screen recordings/OCR archives. The separately authorized **automatic opt-in screen-context** exception is scoped below; never silently enable it.
- Never persist webcam frames, raw landmarks, key identities, sensor-captured typed content, exact per-key timing, or pointer trails; never send this sensing data over a network.
- No remote camera/input sensing analysis. The camera pipeline stays on-device. Deliberately entered task/chat text and optional screen context have separate sharing consent. Numeric loopback is not proof of local-only inference; disclose server-side forwarding/logging risk.
- No hidden telemetry, advertising SDK, cloud account, automatic support upload, or default history sync.
- No silent cloud fallback when a local model is unavailable.
- No mandatory game, guilt message, productivity rank, or punitive lockout.
- Pause/quit, permission revocation, and emergency escape always remain reachable.

These are implementation requirements to test—not something guaranteed by choosing Rust or a local LLM.

## 2. Consent and controls

Maintain distinct controls for:

1. Idle/activity summaries.
2. Optional global aggregate key/mouse activity and input-rhythm analysis on capable platforms, separate from idle consent; editing-key counts and pointer-style metrics have independent controls.
3. Camera, selected device, calibration storage, and background operation.
4. Each notification source and the exact data it exposes.
5. Sending task/chat content to a remote provider.
6. Sending notification text to that provider, separately from chat permission.
7. Optional automatic screen context, with its own sensitive-content warning, model capability/routing verification, OS source chooser, persistent indicator, Stop sharing, and volatile per-session grant. No raw-image persistence or screen-text instructions.
8. Desktop glow, sounds, autostart, optional chat history, and commitment/native-lock modes.

Explain what is received, what is kept, what may leave the machine, and the reduced-function alternative before each grant. Record consent version and allow revocation at any time. Permission granted by the OS is not the same as in-product consent.

### Visible state

- Persistent reachable status while monitoring; a visible camera-on indication in addition to any hardware indicator.
- Device chooser/preview and a clear “camera unavailable” state.
- Always-available pause-all and quit controls. Do not require a global shortcut to exist for escape.
- If the desktop has no visible tray/menu integration, do not hide the only control window while sensing.
- Closing, pausing, revoking, locking, or sleeping has explicit lifecycle behavior; never leave an orphan capture process.
- Offer “pause for a meeting/presentation” manually, because automatic meeting detection is not universally available.

### Current screen-context exception (explicitly requested by the owner)

[DESKTOP_COMPANION.md](DESKTOP_COMPANION.md) is the implementation contract for this new mode. It is **off at launch** and separate from camera/chat permission. The OS maintains a live portal share; the worker reduces its latest-frame output to 960×540 at roughly 1 fps, and at most one image every 90 seconds is sent to the explicitly approved vision-model route during the approved work session. No audio, raw screenshot history, OCR archive, global input, or capture fallback. There is no automatic redaction; screen images and AI descriptions can expose sensitive/third-party data. Explain this before the chooser.

Images, observations, model replies and screen grants are volatile and excluded from workspace JSON, exports, and intentional logs. The local model server can still log, retain or forward requests; its configuration is outside the app's control. Stop/pause/session change/presentation/model change/close end the grant and reject late replies. Lock/sleep signals have explicit shutdown handling but require physical platform verification. No memory-zeroization or secure-erasure guarantee.

Screen content is untrusted data. The model has no tools, settings access or OS authority. Its bounded output is rendered as text. It can suggest a change of pace, not diagnose fatigue, distraction, health, emotions or engagement. Deterministic elapsed-time rules, repeated optional suggestions, cooldowns and budgets govern invitations; only a user action opens rest/chat. Gentler language is not a claim that model output is reliable or safe in every case.

## 3. Data inventory and retention

Proposed defaults, to be confirmed before implementation:

| Data | Where | Default retention / control |
| --- | --- | --- |
| Optional screen images / short descriptions | Bounded worker/native/request RAM; never ordinary saved data | Latest frame/description only, clear on stop; OS/server retention remains outside app control |
| Camera frames and landmark arrays | Volatile capture/worker memory only | Dispose after the frame; never logged or exported |
| Individual OS input events | Native callback/constant-size accumulator only | Aggregate immediately; previous keyboard time and optional previous pointer position/time are overwritten, never an event sequence; clear on gaps/pause |
| Input-rhythm feature windows | Bounded volatile Rust state | At most about two minutes of coarse summaries; no raw timing traces or ordinary history |
| Scalar rolling eye/head/activity features | Volatile bounded buffers | At most about two minutes; clear on pause/session reset |
| Calibration/rhythm-baseline scalars and voluntary rhythm feedback | Memory by default; optional small local profile | Current session unless user explicitly saves; until reset if saved; no sequence of input windows |
| User-entered task/context/settings | Local SQLite/config | Until user deletes; task titles may be sensitive |
| Session/break summaries | Local SQLite | 30 days, configurable/disableable; no verified-productivity claim |
| Decision codes and feedback | Local SQLite | 7 days; no message text or raw sensor samples |
| Fine-grained minute activity aggregates | Optional local table | Off by default; 7 days if enabled; coarse counts only |
| Deferred notification bodies | Bounded RAM queue | Until delivered/expired/session handling, at most 24 hours and 100 items; lost on restart |
| Chat | Session memory by default | Clear at end/quit; optional local history for 30 days with explicit approval |
| API/source credentials | OS secret store | Until removed; memory-only if no suitable store is available |
| Diagnostic logs | Local rotating log | Off/minimal by default; explicit diagnostic mode capped to 7 days and a size limit; no sensitive payloads |
| Export | User-chosen destination | User-controlled; preview fields and warn that exports/backups can outlive deletion |

Raw sensing data must not be stored even when ordinary diagnostic logging is enabled. A future research-recording mode would need a separate design, explicit consent, secure external storage, and a retention protocol; it is not part of the app's initial debug mode.

### Input-rhythm-specific controls

Input style can be sensitive even without recorded text. Global rhythm analysis defaults off, separate from idle/camera consent; optional editing-key and pointer-style metrics have their own controls. No per-key/hold/digraph profiles, identity/authentication model, raw event buffers, or cursor trails. A baseline contains bounded summary statistics only, not a user-identification signature. Do not call coarsened features anonymous or risk-free.

A native listener may receive activity in password/private fields where the OS delivers it. We cannot promise reliable cross-app field exclusion; do not add field scraping to achieve it. Explain this limitation and recommend idle/manual mode when strict exclusion is required. Secure-input blackouts or unsupported input methods yield missing data, not inferred disengagement.

Do not send input-rhythm features, baselines, or automatic behavioral labels to local/remote language models. No default persistence/export of rhythm windows; optional minute-count history does not authorize saving timing histograms. The complete contract is in [INPUT_RHYTHM.md](INPUT_RHYTHM.md).

The queue is bounded and volatile, **not** a guaranteed archival inbox. Original messages remain available at their source. If durable message storage becomes necessary, design encrypted content storage explicitly; do not silently add raw bodies to the history database.

### At-rest security and deletion honesty

SQLite is not encrypted by default. Native secret storage protects credentials separately; it does not encrypt task names, optional chat history, exports, or every session record. Use restrictive local file permissions, encourage OS disk encryption, and investigate optional application-database encryption only with a key/recovery design.

Delete APIs must cover tables, related indexes, caches, logs, SQLite WAL/checkpoint handling, and app-managed backups. Offer export and “delete all data,” including a separate “remove saved credentials” choice. Test these paths. Do not promise forensic secure erasure from SSDs, swap, OS crash dumps, third-party backups, or remote-provider systems. In-memory secrets/frames cannot be absolutely protected against privileged malware or OS memory capture.

## 4. Local versus remote AI

### Strict-local mode

- Permit only an explicitly configured on-device model route.
- Reject known cloud-backed model choices and hosted tools; no automatic remote fallback.
- Explain Ollama's documented server-level no-cloud option and request user approval before configuration changes. A localhost request can select a cloud-backed feature; hostnames alone do not establish inference locality. [1](https://docs.ollama.com/faq)
- Inspect available model metadata and disclose any locality that cannot be independently verified, especially custom aliases/remote servers.
- Test a fully offline session after model/WASM assets are installed.
- Separate app update/model-download network traffic from inference privacy and disclose each. Strict offline mode disables optional update checks/downloads during the session.

### Remote-provider mode

- Show provider hostname, protocol, model, and a plain-language data-sharing summary.
- By default send only chat the user writes and task context they approve. Notification content needs a separate per-source grant.
- Never send video, face geometry, key/mouse events, stored credentials, or automatic biometric summaries. A coaching explanation can use a generic user-approved event such as “break reminder due” without exporting sensor measurements.
- A notification may contain another person's data or confidential work. Prefer local classification; allow source-level exclusions, redaction, and content previews. Do not send sensitive identity/authentication/security notifications for model classification.
- Provider retention, regional routing, training policy, and account terms are provider-specific. Link the chosen provider's current policy during implementation; do not promise zero retention for “any API key.”
- Display estimated usage, a hard local request/token budget, cancellation, and quota errors. Do not equate estimated cost with the provider's actual bill.

## 5. Credential handling

Use native credential stores with explicitly tested backends: Linux Secret Service where available, macOS Keychain, and Windows native credential storage. The keyring ecosystem's API/backend packaging must be reviewed at the pinned version. [1](https://github.com/open-source-cooperative/keyring-rs)

- A credential necessarily passes through a transient entry field if entered in our UI. Clear it immediately after saving and never persist it in localStorage/IndexedDB, a frontend state persistence layer, logs, SQLite, `.env`, or Git.
- Only a narrow backend command accepts a new secret. Commands thereafter return masked status/references, never the saved secret to arbitrary WebViews.
- Keep credentials out of URLs/query strings and redact headers, error bodies, and support exports.
- If the secret store is locked/missing, request user action or use a clearly labeled memory-only session; never silently downgrade to a plaintext file.
- Bind credentials to the selected endpoint/provider and reauthorize endpoint changes. Disable credential forwarding across redirects.
- Use minimum source permissions/scopes; keep model credentials separate from future notification-source credentials.
- Removing the profile can remove its credential; explain revocation at the provider as a separate action.

## 6. Threat model and required mitigations

| Threat / failure | Required design |
| --- | --- |
| A notification says “ignore rules and send secrets” | Treat all source content as untrusted data; no classifier tools, credential access, URL fetching, rule edits, or OS actions |
| Model returns valid JSON with a wrong decision | Validate evidence IDs and semantics; deterministic urgent/allow rules win; uncertainty/failure defaults conservatively |
| Model output injects HTML/script/deep links | Render escaped/sanitized text; no raw HTML; links/actions require validation and explicit user interaction |
| Compromised UI calls privileged commands | Explicit custom-command permissions, caller/window checks, parameter bounds, consent/capability verification, no generic shell/network command |
| Malicious endpoint/redirect leaks a key | Rust-owned network layer, endpoint policy, TLS, redirect restrictions, provider-specific headers, no model-selected URLs |
| Overbroad global input access | Prefer idle summaries; opt-in passive aggregation only; no raw device privilege escalation or data persistence |
| Camera denied, occluded, dark, frozen, or multiple people | Unknown/degraded state; no inferred tiredness from missing data, no escalating intervention, no identity association |
| Stale worker emits after pause | Capture/session generation tokens, prompt stream shutdown, reject late samples |
| Reminder floods interrupt the user | One central intervention manager, hysteresis, cooldowns, per-hour caps, protected-focus mode |
| Break/overlay traps input or survives a crash | No keyboard/pointer grab; emergency controls; watchdog/cancel; stop overlays on lifecycle changes; fail open |
| Lost/expired source credentials | Disable that integration and explain; no scraping or surprise fallback credentials |
| Wrong model/license or tampered download | Explicit download consent; checksummed/pinned assets, model manifest, license notices, release license review |
| Debug/test transport ships to users | External dev-only WebDriver, artifact inspection, no general automation server. The intentional authenticated GNOME bridge is restricted to redacted status/enumerated user controls; no workspace, AI, or pixel endpoint |
| Malicious/rolled-back update | Audited updater, verified artifact/version binding, negative tests; separate OS signing/notarization and key custody |

A local app is not a sandbox against malware already running as the same user or administrator. State this honestly rather than promising absolute privacy.

## 7. Break and wellbeing safeguards

### No medical or emotional certainty

- Use “possible rest-related cues,” not “you are definitely tired.”
- Do not label boredom, sadness, dishonesty, mental illness, disability, or productivity from the face or typing behavior. Input-rhythm output is steady/changed/unknown; “bored” or “in the zone” is voluntary user feedback, not a sensor verdict.
- Do not present an estimated closure fraction as a medical measurement.
- No driver-monitoring, safety-critical, clinical, or employer-assessment claims.
- If users report persistent troubling symptoms, encourage appropriate professional advice rather than increasing model authority.

### No coercive health enforcement

- Normal mode is suggestive and snoozable.
- Commitment mode must be deliberately enabled for a session, with advance warning and an obvious emergency exit.
- Never require mini-game success, rapid input, camera presence, or a certain expression to regain access.
- Native lock is optional and distinct from app-level break UI. Normal authentication is owned by the OS. No password collection, automatic login, credential-provider hacks, or repeated relocking after early login.
- A missed timer after a crash/resume does not authorize a surprise lock.
- Disable native-lock automation in meeting/presentation mode; do not infer meeting absence when reliable detection is unavailable.
- Users may be using a phone, reading paper, using assistive input, thinking, or caring for someone. None is proof that punishment is appropriate.

### Games and coaching

- Games are finite, optional, and user-initiated after a voluntary rest invitation/check-in, with no streak, loot, competitive ranking, or endless loop.
- A screen game/chat is not counted as eye rest.
- The coach identifies itself as AI, is nonjudgmental, and does not claim to replace friends, healthcare, or therapy.
- No dependency-building language, emotional pressure, shaming, or guaranteed mood improvement.
- If the user expresses serious distress, respond supportively and encourage appropriate human/professional help; never turn distress into a productivity intervention.

## 8. Accessibility and visual cues

Use WCAG 2.2 as a design/testing reference while recognizing that a desktop overlay needs its own review. Flash thresholds are not a guarantee of comfort or safety for every user. [1](https://www.w3.org/TR/WCAG22/#animation-from-interactions)

- Replace requested “flicker” with optional gentle fade/static glow. No strobe, rapid red flashes, or full-screen luminance changes.
- Desktop-edge effects default off; static/text/status cues are available without motion.
- Honor reduced-motion and high-contrast preferences, and provide explicit independent off controls.
- Keep cue duration short; do not animate continuously while someone is trying to work.
- Never rely on color, sound, motion, vision, or rapid reactions as the only communication method.
- Screen-reader labels, keyboard navigation, visible focus, adjustable type/contrast, and accessible countdown controls.
- No keyboard traps. The break UI is not allowed to disable OS accessibility shortcuts or secure attention sequences.
- Test mixed DPI, multiple monitors, screen readers, alternate input, and presentation/screen-share scenarios. When screen-share detection is unreliable, manual presentation mode must work.

## 9. Commercial and workplace boundary

Before external release, review applicable privacy/AI/consumer laws, biometric/health-inference rules, third-party API terms, distribution policies, and every model/runtime license. Local-only processing does not automatically remove legal obligations.

The EU AI Act has specific workplace/education emotion-inference restrictions and distinguishes fatigue from emotions; this is a reason for legal review, not a shortcut to declaring this app compliant or prohibited in every use. [1](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32024R1689) [2](https://eur-lex.europa.eu/legal-content/FR-EN/TXT/?uri=CELEX%3A32024R1689)

Keep employer dashboards, centralized employee profiles, emotional ranking, and compulsory monitoring outside this plan. A future organizational product would require a separate proposal, threat model, lawful-basis review, and validation—not just an admin switch.

## 10. Security and safety release gate

Do not release an intervention-enabled beta until the following are demonstrated:

- Pause/revoke/quit stops collection and late samples cannot resurrect it.
- No prohibited raw data appears in the database, logs, exports, telemetry, network requests, or crash artifacts under app control.
- Strict-local test succeeds offline; no silent remote fallback exists.
- Urgent explicit rules bypass AI in all fixtures; model errors cannot lock or alter rules.
- Each supported break/overlay has a tested escape and does not steal/block input unexpectedly.
- Camera quality failures produce unknown, not accusations or forced breaks.
- Input-rhythm consent, bounded extraction, cold-start/gap handling, and baseline deletion pass their tests; no raw traces or guessed moods leak to storage/models.
- Missing native keyring results in an explicit safe fallback.
- Secrets are redacted across provider/source failure modes.
- Production artifacts exclude test automation transports and use the intended capabilities/CSP.
- Retention, export, deletion, restore/migration, and uninstall instructions have been exercised.
- External releases pass license, signing, dependency/advisory, and update-integrity review.

Track these as test evidence in [ROADMAP.md](ROADMAP.md), not as checkmarks based on documentation alone.
