# Proposal

## Why

The current skill drives Studio through repeated shell commands, exposing sandbox/network failures and allowing server connectivity to be mistaken for a successfully opened editor. A harness-managed MCP connection will give agents discoverable design tools and a single automatic startup operation while preserving the existing local app and document engine.

## What Changes

- Bundle a stdio MCP executable in the npm package and register it alongside the skill using the existing `--harness <codex|claude|devin> --local|--global` installation interface.
- Let the harness launch the MCP process; invoking the skill calls `open_studio`, which starts or reuses a repository-bound local web server and opens the browser automatically.
- Expose structured MCP tools for session status, document and selection reads, live object operations, previews, immutable submissions, implementation ownership, update waits, and progress reporting.
- Make MCP the normal skill interface. Retain the CLI for installation, diagnostics, and compatibility rather than executing a shell command for every collaboration action.
- Return the browser URL on every open request and distinguish an accepted browser-launch request from a connected editor. Do not wait for a design submission when the editor failed to open and no submission is pending.
- Preserve design state and pending submissions across MCP process restarts. Keep user implementation instructions button-gated and harness object changes live.
- Preserve unrelated MCP configuration and skills, detect managed-entry conflicts, and roll back installation failures across skill and MCP registration changes.

## Capabilities

### New Capabilities

- `studio-mcp`: Harness-managed local MCP transport, automatic Studio startup, structured collaboration tools, scoped registration, and reconnect behavior.

### Modified Capabilities

None. Main specs are currently empty. This change adds an MCP adapter over the implemented capabilities from `add-picasso-studio-harness-integration`; it does not duplicate or replace their document/session requirements.

## Impact

- Extract reusable lifecycle logic from `runtime/cli.ts`; add an MCP entry point and SDK integration without invoking CLI commands for each tool call.
- Extend `runtime/install.ts` with scoped JSON/TOML MCP registration and managed rollback; update the packaged skill and build/file allowlist as needed.
- Reuse `runtime/server.ts`, `runtime/store.ts`, the shared operation schemas, preview rendering, browser-launch diagnostics, and editor connection status.
- Add protocol-client, installer, lifecycle, packed-package, and real-browser tests for the MCP path.
- This follow-up supersedes the earlier design's CLI-first agent-interface decision and its exclusion of a required MCP connection. That earlier change remains in progress at 28/30 tasks; this proposal does not mark its remaining compatibility checks complete or edit its artifacts.
- Hosted services, remotely hosted harnesses, HTTP MCP exposure, forced agent interruption, and automatic revival of ended agent turns are outside this change.
