# Tasks

## 1. Shared session lifecycle

- [x] 1.1 Extract side-effect-free session access, launch/reuse, browser opening, and connection-status functions from the CLI; verify importing the service produces no CLI output and existing CLI/session/browser-launch tests pass.
- [x] 1.2 Add canonical repository restrictions, single-session reuse, explicit multiple-session selection, and cross-process launch serialization; test global access to two repositories, local rejection of another root, simultaneous opens, and stale connection records.
- [x] 1.3 Add cancellable authenticated requests and expose runtime version/scope with browser/server/owner status; test aborted requests, permission failures, and an opener success that never produces a connected editor.
- [x] 1.4 Document shared lifecycle and reconnect behavior in the session docs; verify examples preserve existing session IDs and do not require a user-started web server.

## 2. MCP executable and collaboration tools

- [x] 2.1 Add a pinned official MCP SDK and bundle a dedicated stdio entry point; use an MCP client to verify initialization and tool discovery, no browser opening at initialization, and stdout containing only valid protocol messages.
- [x] 2.2 Implement open/list/status, document/selection, operation, and preview tools with shared schemas and structured errors; test actual tool calls for inactive-page edits, duplicate request replay, stale conflicts, repository mismatch, permission denial, and exact-revision SVG/PNG results.
- [x] 2.3 Implement submission reads, ownership attach/heartbeat/detach, acknowledgement, and progress tools without exposing draft submission; test competing owners, lease expiry, newest-target acknowledgement, and older completion racing a newer submission.
- [x] 2.4 Implement bounded wait_for_submission with cursors, immediate delivery of already pending work, cancellation, and caller-owned lease renewal; test empty timeout, reconnect with a current cursor, cancellation cleanup, and submission arrival during a wait.
- [x] 2.5 Handle MCP EOF and graceful shutdown without stopping web sessions or releasing another owner's lease; restart a real stdio client and verify saved design, pending submissions, acknowledgements, and editor availability survive.
- [x] 2.6 Document tool schemas, application-error results, identity targeting, preview availability, and wait semantics; exercise the documented tool examples through the MCP client tests.

## 3. Managed harness registration

- [x] 3.1 Add Codex TOML and Claude Code/Devin JSON registration adapters for both installation scopes with documented path overrides; test all six target combinations and ensure local registrations restrict the repository while global ones contain no install-time project binding.
- [x] 3.2 Extend manifests and staged installation to register the skill and MCP entry together, including upgrades from skill-only 0.1.x manifests; test persistent runtime references after cache removal and successful migration without resetting session data.
- [x] 3.3 Add configuration ownership checks, target locks, fingerprints, and recoverable rollback across skill/MCP writes; test unmanaged names, edited entries, malformed configs, no-op reinstalls, interrupted registration, and unrelated concurrent config edits.
- [x] 3.4 Update installer output and installation/compatibility docs with resolved config paths, scope mapping, reload/trust guidance, and observed versus verified versions; validate generated configurations using supported harness parsing/discovery commands without bypassing host trust.

## 4. MCP-first skill workflow

- [x] 4.1 Replace normal shell-based startup/collaboration instructions with discoverable MCP tool calls, while retaining CLI diagnostics documentation; verify rendered skills for all harnesses name the complete open/read/edit/acknowledge/check/report workflow and handle host-generated tool prefixes.
- [x] 4.2 Require URL presentation and editor-status checks before waiting, plus actionable missing-MCP/permission handling and quiet idle behavior; test startup failure, editor absence, existing pending submissions with no browser, and editor disconnection during an idle wait.
- [x] 4.3 Document and test the draft/submission distinction through the skill-facing MCP flow; verify user edits require the button, harness edits appear live, and updates are picked up at checkpoints without claiming forced interruption or inactive-agent revival.

## 5. Integrated acceptance

- [x] 5.1 Build and pack the npm artifact, install it into isolated repositories/user homes, and connect an MCP client to the installed executable after removing its source/cache; verify discovery and normal collaboration use no per-operation CLI subprocesses.
- [x] 5.2 Run the complete regression suite and a packed-package browser/MCP acceptance flow covering automatic opening, visible connection, bidirectional edits, button-gated submission, updates while implementing, reconnection, and repository isolation; record commands and results.
- [ ] 5.3 Verify actual skill/MCP discovery and the implement/update workflow in Codex, Claude Code, and Devin CLI for local and global installations; record exact versions and evidence, and leave unavailable harness checks unfinished rather than treating template/client tests as full compatibility proof.
