# Security and privacy reports

Do not post task text, exports, camera imagery, keystrokes, access tokens, private keys, or signing passwords in public issues or build logs.

Report a sensitive vulnerability through the repository's **Security → Report a vulnerability** channel when private reporting is enabled: https://github.com/ICBMT/focus-traker/security/advisories/new . If that channel is unavailable, open a public issue containing only a request for a private contact method, not exploit details or personal data.

## Current support status

The 0.1.0 line is a **release candidate under validation**, not a production security certification. The native/device/signing ledger is in `docs/RELEASE.md` and `docs/NATIVE_QA.md`. There is no automatic updater, remote provider, global input hook, OS-lock command, or real notification interceptor.

## Boundaries

- The main Tauri window has a restricted IPC allowlist. The app does not expose general filesystem, shell, or remote-network commands.
- The optional Ollama client sends deliberate chat and optionally task text to numeric loopback. A user's Ollama server can route inference elsewhere; the app cannot prove server locality.
- Workspace/export data is plaintext. OS full-disk encryption is recommended. Deletion cannot erase existing backups, swap, or exports.
- Desktop storage requires an exclusive process lock. Browser writes require a Web Lock; unsupported/secondary tabs are read-only rather than competing writers.
- Runtime diagnostics must use static/redacted failures, not task, chat, or raw input contents.

## Release security

Signed-public distribution must fail closed when certificates, notarization, integrity verification, or required validation are missing. Signing keys belong only in a protected CI environment or hardware-backed local signing system, never in this repository or chat. Test artifacts are explicitly unsigned and are not a public stable release.
