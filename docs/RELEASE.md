# Release candidate and publishing guide

Updated 2026-11-19. Owner decisions: **MIT** source/app license, **signed public** distribution, **Ubuntu/GNOME first** with Windows/macOS in the same cycle. Exact Ubuntu version and Wayland/X11 session are still unknown.

## What the download means

CI test packages are **unsigned release candidates**, not signed/public production releases. The 0.1.0 application includes task sessions, optional breaks/game, local history/recovery/data controls, offline guidance, a native Ollama client, foreground camera preview, and a pad-scoped cadence experiment. It does **not** include validated webcam inference, global input/idle monitoring, inferred mood/boredom/flow, real notification suppression, remote API-key providers, an OS lock, desktop-edge effects, or an updater. Those must not be advertised as shipped features.

Never bypass OS security prompts to claim that signing worked. Do not use a self-signed/ad-hoc certificate as evidence of trusted public distribution.

## Build and test artifacts

The `Focus checks` workflow builds Linux `.deb` / `.AppImage`, Windows NSIS `.exe`, and macOS `.dmg` test packages and uploads versioned manifests, SHA-256 sums, and dependency notices. Linux packages use the documented CI runner's libc/WebKit baseline; this is not a promise of compatibility with older distributions. macOS packages must be tested on both advertised CPU architectures. Windows' installer can download the Microsoft WebView2 bootstrapper if WebView2 is absent; a fresh offline installation needs WebView2 provisioned separately.

Download only the artifacts for the intended workflow commit. The manifest records the commit and target. Verify hashes before installing, for example:

```sh
sha256sum -c <target>-SHA256SUMS.txt
```

Hashes in an unsigned archive detect accidental damage, not a maliciously replaced archive. Signed public releases additionally need the signatures/identity checks below.

Local builds require Node 22.12+, the pinned Rust toolchain, and Tauri's platform prerequisites:

```sh
npm ci
npm run typecheck
npm test
npm run test:e2e
cargo fmt --all -- --check
cargo test --workspace --locked
node scripts/licenses.mjs --rust
npm run check:release -- --native
npm run tauri -- build --ci
```

No model weights, credentials, user data, development browser binaries, or test automation drivers belong in a release bundle. Native WebDriver tests are external development tools, not a production IPC test bridge.

## Signed-public workflow — owner setup required

`Signed release candidate` is manual, on this development branch, and uses the `release-signing` environment. Configure **required reviewers and protected-branch restrictions** on that environment before use. The preflight checks that required reviewers exist; inability to verify the environment fails closed. Create/protect the intended version tag at the exact approved commit first; publishing never silently creates or retargets a tag. Do not grant secrets to pull-request workflows. The workflow must validate an exact current commit and never publish a stable release automatically.

Configure secrets directly in repository/environment settings, not in chat:

| Platform | Secret/configuration | Purpose |
| --- | --- | --- |
| Windows | `WINDOWS_CERTIFICATE_PFX_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`, `WINDOWS_CERTIFICATE_THUMBPRINT` | A trusted Authenticode certificate, imported only into the ephemeral runner; thumbprint must match |
| macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Developer ID Application signing plus notarization; APPLE_PASSWORD is an app-specific password |
| Release integrity | `RELEASE_GPG_PRIVATE_KEY`, `RELEASE_GPG_PASSPHRASE`, `RELEASE_GPG_FINGERPRINT` | Detached signature over the final checksums; publish the independently verified public-key fingerprint |

Signing identities must be owned/authorized by the publisher. Do not generate throwaway identities and label the result a trusted release. Certificate enrollment, platform fees, private keys, and notarization approval cannot be supplied by this coding environment.

The signed workflow checks secrets before building, signs Windows executables/installers and verifies Authenticode, verifies macOS code signatures/notarization/Gatekeeper, signs the final integrity manifest, and produces a **draft prerelease** for owner review only after all build jobs succeed. No automatic updater is configured: it requires a separate signed-update/integrity design and tests.

## Mandatory approval checklist

- [ ] Web/domain/privacy tests and native Rust tests pass for the exact release commit.
- [ ] Ubuntu/GNOME on the owner's exact version/session, Windows/WebView2, and macOS/WKWebView pass the native QA checklist; both macOS architectures if advertised.
- [ ] Real camera grant/deny/revoke/hidden/close behavior and no microphone/recording/upload are verified. A preview is not an inference test.
- [ ] Real Ollama discovery/chat/cancel and no-cloud server configuration are tested on the 16 GB CPU-only reference machine; memory/latency are recorded, not guessed.
- [ ] Storage replacement/ownership, export, restart recovery, close failures, disk-full, sleep/lock, and long-session cases pass on physical targets.
- [ ] Accessibility, minimum-window/mixed-DPI behavior, native dialogs, and full-day resource/power soak tests pass.
- [ ] Generated npm/Cargo notices are complete; separately bundled shared libraries, installer resources, trademark obligations, and model licenses have been reviewed. The dependency inventory is not a legal certification.
- [ ] Trusted Authenticode and Developer ID identities, notarization/stapling, detached manifest signatures, independent public-key distribution, and clean-machine installation/uninstallation are verified.
- [ ] Release notes describe only validated features/targets and retain degraded/unsupported states.
- [ ] Owner approves the exact commit and artifacts. Only then remove Draft/Prerelease status manually.

## Evidence ledger

For initial commit `e125546`, the remote workflow recorded successful web, Linux native source/test/build, and Windows native source/test/build jobs. macOS was cancelled. Those jobs produced executables, not installer or physical-device evidence. Later release-candidate work must record its own exact-commit results. See `IMPLEMENTATION.md` for local browser/core evidence; do not reuse an old green check as proof of a changed build.

**Still blocked until explicitly recorded:** owner signing-secret setup, physical-device QA, model performance/routing validation, bundled-system-library license review, and final public-release approval. This guide does not mark those gates passed.
