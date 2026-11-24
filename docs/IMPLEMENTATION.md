# Foundation implementation record

**Updated:** 2026-11-19. This file describes the working source, not every feature in the approved target architecture. Release-candidate hardening and signed-public packaging gates are implemented. No signed public production release is claimed.

## Scope implemented

| Area | Actual implementation | Evidence / limit |
| --- | --- | --- |
| Workspace | Overview, focus room, insights/history, sensor lab, notification sandbox, preferences; bundled fonts/vector icon; light/dark/system and reduced motion | Production web build and browser tests; native rendering unverified |
| Sessions | Rust engine and browser fallback; task/work-style selection, 1–180 minute sessions, pause/resume, early finish, optional 20-second–30-minute breaks | Shared JSON scenarios replayed by both engines |
| Interruption | Monotonic elapsed time; large wall/monotonic gap pauses without crediting missing time; restored sessions stay paused | Domain tests and actual browser reload/recovery flow; physical sleep not tested |
| Rest | Voluntary break UI and optional three-pair garden game | Exit does not require waiting or winning; no OS lock IPC |
| Intentions | Add, complete/uncomplete, search, start, delete/undo; maximum 100 | Frontend and browser scenarios; no fabricated starter data |
| History | Up to 30 days/500 local work/break summaries; voluntary four-choice reflection; actual-data daily/chart views | Runtime duration is not verified concentration; no sensor annotations |
| Storage | Version-1 browser JSON or native app-data JSON, validation, debounced serialized writes, native randomized staged replacement; export/reset | Browser persistence/deletion tests pass. Expanded native file/lock/export tests await the current CI run. SQLite/encryption are not implemented |
| Recovery safety | Unreadable/unsupported workspaces are read-only rather than overwritten; pending writes invalidated on reset; no automatic feature restart | Regression tests for initialization failure, history-off, quick finish/start, stale polls, cancellation, deletion failure |
| Camera | Explicit two-step opt-in foreground/visible lab preview; no audio, inference, recording, or uploads | Synthetic lifecycle tests: deliberate start, stop, denial, page-exit/late permission result. No real camera/WebView test |
| Keyboard experiment | Own-pad key count and five coarse inter-press buckets; ignored repeats, bounded 30-second window; in-memory comparison sample | Rust/TS parity and accumulator tests; experimental thresholds, no field validation |
| Mouse/trackpad experiment | Separately enabled own-pad move/click/scroll counts; optional separate editing-key count | Counts only. No trajectories or movement-style classifier. No global input/idle adapter |
| Companion | Canned offline prompts plus native loopback-only Ollama discovery/chat implementation; optional explicit task context | Offline path tested; recent-context byte/UTF-16 bounds tested. Native client has not contacted a server here |
| Notifications | Deterministic simulator: explicit urgent bypass, user-marked low deferral, lexical match, conservative uncertain allow, releasable examples | Synthetic/volatile only; zero real integrations, no OS interception or suppression |
| Packaging | Desktop config, five generated icons, macOS usage text/entitlement, restrictive main-window command allowlist | Source/configuration only; native compile/sign/package validation is open |
| Concurrent platforms | Linux, Windows, and macOS native jobs; Linux WebKit/Xvfb smoke; unsigned deb/AppImage/NSIS/universal-DMG packaging | Initial Linux/Windows native jobs passed at e125546, macOS cancelled; current exact-commit outcomes live in Actions. No physical-device matrix is passed |
| Release preparation | MIT license, pinned CI actions, npm/Cargo notices, in-app licenses, exact-commit/artifact integrity gates, protected signing workflow | Signing identities, required reviewers, physical QA, and system-library legal review must be configured/approved by the owner |

## Runtime and security boundaries

- `src/lib/runtime.ts` makes the adapter distinction explicit. A web page cannot discover the viewer’s model server or start native monitoring. Desktop session time/commands are handled by `focus-core` and Tauri.
- All native commands check the invoking window label in addition to main-window-only generated command permissions. There are no shell/general filesystem/general network/global input/OS lock commands exposed to the UI.
- Release CSP permits local bundled assets and Tauri IPC, not arbitrary remote HTTP. Development CSP adds the Vite development script/socket allowances. This configuration still needs native WebView testing.
- Native storage deserialization rejects unknown fields; browser persistence reconstructs an allowlisted schema. Sensors, chat, baselines, and credentials have no persisted fields. Native reads are capped at 2 MiB; writes stage an owner-only file on Unix before replacement.
- Native app-data ownership uses an OS file lock; browser editing uses Web Locks and fails closed to read-only without ownership.
- Export can write only through a deliberate native save-file dialog (or browser download). Native exports use owner-only staged replacement without changing the destination directory permissions. Exports intentionally omit the active checkpoint.
- The Ollama client uses numeric loopback, no proxy/redirect, short connection/discovery limits, at most 128 KiB of response bytes, one active chat request, and cancellation. It supplies no tools. Model text is rendered as text, not executable HTML.
- Loopback is **not** a local-inference guarantee. The UI requires an explicit routing acknowledgement before discovery and discloses that server-side generation can continue after cancellation. No API-key provider, credential persistence, silent fallback, or automatic model installation exists.

## Timing and data semantics

- Focus/break elapsed time includes only unpaused time the engine actually observes. A gap **greater than 15 seconds**, backwards monotonic movement, or a large wall-clock change pauses the session. These are conservative interruption rules, not idle or attention detection.
- The browser adapter ticks when observed; browser throttling can therefore pause it. The native host includes an independent one-second Rust tick, but suspend/lock/long-run behavior still needs device tests.
- Timer expiry sets `breakReady`; it does not start a break. The user can take a break or finish without one.
- Settings/history writes debounce by approximately 300 ms; active checkpoints are approximately every 15 seconds and at phase changes. Native window close pauses/stops and waits for the final save; failure keeps the window open. Browser pagehide flushes synchronously before releasing its lock. Force-quit, OS termination, in-flight browser commands, and failed storage can still lose recent changes; this is not guaranteed crash durability.
- Daily totals/charts group each summary by its local session-start date; paused segments and cross-midnight sessions are not split into fabricated continuous intervals.
- Turning history off clears summary records. An active task checkpoint may still be saved for recovery. Re-enabling history does not resurrect already-processed terminal records from the live snapshot.
- Storage is plaintext, not encrypted. Exclusive process/tab ownership prevents competing saved-data writers. Import/SQLite migration and independent background checkpoint persistence remain open work.

## Evidence observed in this workspace

| Check | Observed result |
| --- | --- |
| TypeScript strict typecheck | Passed |
| Production Vite web build | Passed |
| Frontend/domain/component regression suite | 112 passed across 8 test files |
| Rust domain core | 19 passed, including two contract tests replaying 12 session and 10 rhythm scenarios |
| Release-integrity unit tests | 3 passed: exact commit/approval, artifact identity/hash, traversal/symlink/duplicate rejection |
| Production-browser scenarios | 16 passed, including invalid-data reset, competing-tab rejection, and immediate pagehide flush |
| Accessibility scans | 32 screen/dialog states in light/dark; no selected WCAG A/AA rule violations reported by axe |
| Browser widths | 390, 940, 1024, 1440 px checked for document overflow; native-minimum size 940×680 exercised as a browser viewport |
| Browser runtime/network | No uncaught errors or third-party HTTP requests in tested scenarios; no real camera/model call |
| Rust formatting | Parsed/formatted with rustfmt 1.99 toolchain; standard formatting check included |
| Cargo dependency resolution | Root Cargo.lock generated from the official crates.io index via GitHub; registry sources/checksums preserved |
| Initial remote native evidence | e125546: Linux/Windows workspace tests and executable builds passed; macOS cancelled |
| Current native/packaging evidence | New lock/storage/HTTP mocks, native WebKit smoke, and installer builds await the exact-commit CI outcome; live model/hardware not tested |
| Native GUI, actual sensor capture, OS permissions, CPU/RAM, model speed/quality | **Not measured or validated** |
| Signed publishing | Workflow is manual/fail-closed and draft-prerelease-only; credentials, protection rules, actual signatures/notarization have not been verified here |

The sandbox started without Rust or the Linux desktop development stack. A temporary Rust 1.99 toolchain was obtained through npm-hosted toolchain packages. Because crate-download hosts are unavailable here, the core was checked through a temporary offline manifest using upstream GitHub sources at the **same versions as Cargo.lock**; disabled optional/test-only dependency edges in those temporary third-party manifests were stripped. Project domain sources and shared fixtures were used directly, not rewritten substitutes. The full host dependency graph was not compiled. New native source changes are delegated to the standard CI workspace tests, not inferred from the old offline harness. Temporary tools, vendored test dependencies, screenshots, build logs, and browser downloads stay under ignored `.cache/`/`dist`/`node_modules`, not Git.

Automated accessibility success does not establish complete accessibility. Browser Chromium is not WebKitGTK, WebView2, or WKWebView. Synthetic camera tests are not permission, sensor-quality, minimized-capture, hardware, accuracy, or privacy-audit results.

## Remaining gates, in order

1. **Native foundation:** run the configured three-OS build/test matrix; launch Linux first with exact distro/DE/session recorded, then Windows/macOS in the same cycle. Confirm storage replacement, recovery, export dialogs, CSP, packaging, and permissions in each native WebView.
2. **Hardware observation:** validate explicit webcam lifecycle/quality and CPU/RAM with ordinary laptop hardware; add no inference until the camera gate passes. Determine actual idle/input coverage without privileged device access or global-capture workarounds.
3. **Rhythm investigation:** expand permitted coarse style features only after consent/coverage feasibility; collect voluntary reports and evaluate held-out sessions/days against timer/idle baselines. No adaptive nudges before benefit/unknown-coverage checks pass.
4. **AI:** test explicit loopback discovery, routing disclosures, bounded errors/cancel, CPU-only model memory/latency, and licensing. A later remote protocol requires native secure-credential tests and new consent.
5. **Real notifications and effects:** select/authorize a controllable source; test delivery ownership, urgent bypass, explanations, and failure handling. Keep unsupported suppression/overlays/lock unavailable.
6. **Release:** MIT and signed-public distribution are selected. Finish system-library/transitive legal review, data migrations, native accessibility, certificate setup/signing/notarization verification, performance/soak tests, and device validation. No milestone is considered complete just because source or CI configuration exists.

See [NATIVE_QA.md](NATIVE_QA.md) and the approved [ROADMAP.md](ROADMAP.md) for the broader acceptance gates.
