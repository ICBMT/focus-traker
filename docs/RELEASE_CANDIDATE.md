# Focus 0.1.0 — validated test build

Recorded 2026-11-19. **Status: unsigned release candidate, not approved for signed public production distribution.** This is the implemented sessions/local-data foundation, not every feature in the wider product plan.

## Exact validated build

- Branch: `arena/4326f80b-focus-traker`; `main` was not changed.
- Commit: `1ce3c48a2c27e8ad877a369e0d74fc622e736de3`.
- [Successful four-job checks run 45375456839](https://github.com/ICBMT/focus-traker/actions/runs/45375456839): web, Ubuntu, Windows, and universal macOS.
- Any later commit needs its own successful checks run before release. The package manifests identify their actual commit; do not substitute a newer source checkout for the build above.

## Download the installers

These are GitHub Actions artifacts, retained for 14 days by the workflow. They are **test packages**, not permanent public releases. GitHub may require sign-in to download them.

| Target | Artifact | Contents |
| --- | --- | --- |
| Ubuntu 24.04 CI baseline, x86-64 | [Linux test packages](https://github.com/ICBMT/focus-traker/actions/runs/45375456839/artifacts/14911606373) | `.deb` and `.AppImage` |
| Windows x86-64 | [Windows test package](https://github.com/ICBMT/focus-traker/actions/runs/45375456839/artifacts/14910903882) | NSIS `.exe` installer |
| macOS Intel + Apple silicon | [Universal macOS test package](https://github.com/ICBMT/focus-traker/actions/runs/45375456839/artifacts/14911941123) | Universal `.dmg` |

Each archive includes a target manifest, package SHA-256 checksums, MIT license, dependency notices, and the release guide. Extract into a new folder and verify the checksums **before** installation. Linux example, from the extracted directory:

```sh
sha256sum -c linux-x86_64-SHA256SUMS.txt
```

Unsigned checksums detect accidental corruption, not publisher authenticity. Do not disable OS protections or interpret an unsigned/ad-hoc package as verified public signing. Older Linux distributions, fresh offline WebView2 installation, and both macOS architectures need the separate compatibility/device checks in [RELEASE.md](RELEASE.md).

## Validation completed

| Check | Result |
| --- | --- |
| Application/domain/component tests | 131 passed across 8 files |
| Release integrity and external harness tests | 6 passed |
| Production Chromium scenarios | 17 passed |
| Automated accessibility | 32 light/dark screen/dialog scans, 0 reported violations in the selected WCAG A/AA rules |
| Browser runtime/network | No uncaught errors or third-party HTTP requests in those scenarios |
| Rust workspace tests | Linux/macOS: 19 core + 16 native-host tests; Windows: 19 core + 13 host tests (Unix-only cases excluded) |
| Rust clippy, formatting, TypeScript, production asset build | Passed |
| Real Linux Tauri/Rust/WebKit smoke | 5 checks passed under Xvfb |
| Package builds and uploads | Linux deb/AppImage, Windows NSIS, universal macOS DMG passed |
| Local npm audit | 0 reported vulnerabilities; not a complete security audit |

The native smoke launches the actual release executable, exercises start/pause/resume through Rust IPC, verifies private-schema disk persistence and renderer reload, creates native history, exits a voluntary break, and replaces the isolated workspace destination with a directory to confirm a real failed save keeps the app open with usable controls. It does not pass a physical GNOME/Wayland or hardware gate.

## Still required for the requested signed public release

1. Complete [physical-device QA](NATIVE_QA.md), starting with the owner's **exact Ubuntu/GNOME version and Wayland/X11 session**, then Windows and both macOS architectures. Installer launch/uninstall, native dialogs/accessibility, sleep, disk-full, camera lifecycle, Ollama routing/cancel, and 16 GB CPU-only performance remain unverified on real devices.
2. Review npm/Cargo notices plus separately bundled system/installer libraries and any chosen model's terms. MIT covers this app's source, not every external component.
3. Configure the protected `release-signing` environment with required reviewers and the authorized Windows, Apple, and GPG signing identities described in [RELEASE.md](RELEASE.md). No signing material belongs in chat.
4. Review/merge the manual workflow through the normal process, protect an exact-commit version tag, run the gated signed-candidate workflow, and verify Authenticode, notarization/stapling, and the detached integrity signature on the actual outputs. That workflow has **not** been executed here.
5. Approve the exact signed artifacts and release notes before manually publishing the draft prerelease. No public release was created and no automatic updater is enabled.

The sensor and notification pages remain explicitly labeled experiments/simulators. There is no webcam inference, global monitoring, inferred mood/flow, real notification suppression, OS lock, desktop overlay, or remote API-key provider in this build.
