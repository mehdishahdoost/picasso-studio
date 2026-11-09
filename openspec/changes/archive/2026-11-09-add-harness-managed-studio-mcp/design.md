# Design

## Context

See proposal.md for motivation and the relationship to the earlier in-progress change. This change adds a new transport and installation behavior across several runtime modules, so a design artifact is required.

The implemented 0.1.1 runtime already provides loopback HTTP operations, atomic persisted session state, operation schemas, revision checks, immutable submissions, ownership leases, previews, and browser/agent connection status. `runtime/cli.ts` combines argument parsing, lifecycle management, authenticated requests, and a top-level `main()` invocation. Importing it into an MCP executable would also execute CLI behavior, so reusable lifecycle functions must be extracted first.

The installer currently writes a managed skill and a persistent versioned runtime; it does not register MCP. `vite.runtime.config.ts` produces a single CLI bundle, and `runtime/SKILL.md` primarily describes shell commands. Existing tests cover the CLI and packed-package browser flow but do not initialize an MCP client.

The preceding change has no archived main specs and still has uncompleted compatibility checks. The new `studio-mcp` capability layers over its implemented engine; it does not recreate that change's specs or imply its acceptance is complete.

## Goals / Non-Goals

**Goals:**
- Make the harness launch the integration through its normal MCP process management.
- Start and open Studio on skill invocation, without a separately started server or per-action shell commands.
- Keep one authoritative session service for browser, MCP, and diagnostic CLI clients.
- Distinguish MCP availability, web-server readiness, browser connection, and implementation ownership.

**Non-Goals:**
- Streamable HTTP MCP transport, a remote service, cloud-agent tunnels, or a globally exposed listening interface.
- Assuming notifications can wake an inactive model or interrupt an executing coding tool.
- Replacing the document model, browser synchronization protocol, or existing submission rules.
- Removing the diagnostic CLI, changing harness approval policy, or granting workspace trust during installation.

## Decisions

### 1. Run a lightweight stdio MCP executable under the harness

Bundle a separate `dist-runtime/mcp.mjs` entry point using the official TypeScript MCP SDK, with a pinned compatible SDK version and its required runtime dependencies bundled. Initialize tools promptly and keep stdout exclusively for protocol traffic; send diagnostics to stderr with credentials and browser bootstrap secrets redacted. Do not import the side-effectful CLI entry point or launch the browser during MCP initialization.

```text
Harness --stdio--> Picasso MCP process
                         |
                    open_studio
                         |
                  Session service
                    /         \
           Local web server   Saved session state
                    |
                Browser UI
```

The harness owns the MCP process lifetime. The existing detached session web server remains independent, so a harness reload does not erase the document or close the editor. MCP EOF cancels outstanding waits and stops connection-owned timers, without stopping web sessions or deleting state. Release only an ownership lease acquired by that MCP connection when shutdown is graceful; abrupt termination leaves normal lease expiry/reacquisition in force.

Alternative: one process owning both MCP and the HTTP listener makes browser uptime depend on harness teardown. A network MCP endpoint would require endpoint/credential registration and port discovery; stdio matches the confirmed harness-managed startup requirement. The browser still needs a loopback HTTP server, and MCP registration does not bypass host restrictions on starting it.

### 2. Extract lifecycle and session access into a shared service

Move reusable open/list/attach/status, browser result, and authenticated request logic into a side-effect-free module such as `runtime/sessions.ts`. The CLI and MCP entry points call it directly. Existing server/store code remains the sole state writer; MCP calls the authenticated HTTP API inside its own long-lived process rather than spawning `node ... bridge` for every operation.

`open_studio` requires an absolute repository path and accepts an optional session ID. Canonicalize it using the existing Git-root logic. For a repository-scoped MCP registration, require the configured root to match. For a global registration, require the repository supplied by the skill's current invocation; do not use the install-time working directory as the default project. If advertised MCP roots are available, verify the repository is within an advertised workspace; do not require the optional roots capability for hosts that do not provide it.

For no explicit session: create when none exist, reuse the only existing session, and return `session_selection_required` with session summaries when several exist. The agent can then present the choice or use an explicit session previously named by the user. Serialize concurrent creation/open requests per repository/session and verify the server process before reusing a descriptor, preventing two MCP clients from racing into duplicate authoritative servers.

On a supported older server, preserve saved state while upgrading its lifecycle implementation as the CLI already attempts. Reject incompatible session/protocol versions rather than resetting files. Return runtime version and installation scope in session results so shadowed registrations can be diagnosed.

### 3. Verify browser opening through the shared server

`open_studio` calls the existing opener and returns `url`, `browserLaunch`, `serverReady`, `browserConnected`, `connectedEditors`, and repository/session identity. Retain the opener's failed/unavailable/unconfirmed outcomes. Use bounded connection confirmation and never turn an opener exit code or timeout into evidence of an editor connection.

The skill always presents the URL. It can use the harness's browser tool when automatic opening fails, then call `get_studio_status`. With no connected editor and no pending submission it reports the actionable outcome and ends the invocation instead of entering an idle polling loop. It can still resume an already submitted design if the browser is closed.

### 4. Provide explicit, schema-described MCP tools

Register the MCP server as `picasso-studio`; host-generated tool prefixes may vary, so the skill identifies tools by their advertised base names rather than hard-coding a particular host prefix.

| Tool | Behavior |
| --- | --- |
| `open_studio` | Open or reconnect to a repository session and attempt browser launch |
| `list_studio_sessions` | List sessions for an explicitly bound repository |
| `get_studio_status` | Report server, editor, owner, scope, and runtime status |
| `get_design` | Return the current draft with its revision and stable page/object IDs |
| `get_selection` | Return the browser's selected page/object IDs |
| `apply_operations` | Apply a validated revision-checked atomic batch |
| `get_preview` | Return a revision/page-specific visual reference or explicit unavailability |
| `get_submissions` | List submission metadata or read an immutable snapshot by ID |
| `attach_implementation` | Acquire or recover a single-owner implementation lease |
| `heartbeat_implementation` | Renew the caller's owned lease |
| `acknowledge_submission` | Select the newest pending target using current supersession rules |
| `report_progress` | Report status for the caller's run and submission |
| `detach_implementation` | Release the caller's implementation ownership |
| `wait_for_submission` | Bounded event wait with cursor and pending-submission metadata |

Reuse shared operation/property schemas as tool input/output contracts instead of maintaining a second object vocabulary. Each session tool carries repository and session IDs. Ownership tools also carry owner/run IDs; connection shutdown cannot detach another owner's run. Application failures return `isError: true` with structured code/message/details; malformed MCP requests remain protocol errors handled by the SDK. Preserve `permission_required`, `revision_conflict`, `session_mismatch`, and ownership errors without retrying mutations blindly.

For previews, return PNGs as MCP image content when available, and SVG as labeled text/resource content with matching revision metadata. Missing browser rendering remains an explicit unavailable result. Supply read-only/mutation annotations accurately, without treating them as authorization controls. Expose no general shell/file tool and no tool equivalent of the browser-only submit action.

Tools are sufficient for the initial release. Resource subscriptions and notification-driven host integrations are deferred because their effect on model execution varies across clients.

### 5. Preserve button-gated implementation and use bounded waits

The agent implements the immutable snapshot returned by acknowledgement/get_submissions. `apply_operations` changes the shared draft live and never publishes it. Before each bounded implementation step and after checks, the skill checks pending submissions through MCP and reconciles to a newer target if present.

`wait_for_submission` defaults to a 20-second wait with a maximum of 25 seconds. It accepts an event cursor and returns matching submission events, pending-submission summaries, and the next cursor. An already pending submission returns immediately, including after MCP reconnection even if the caller's cursor is current. Pass the MCP cancellation signal through the HTTP request and remove listeners/timers on cancellation. A wait does not acknowledge or implement a submission. If ownership metadata is supplied, validate and renew that connection's lease without creating a second owner.

The skill gives one actionable startup message and avoids repeated idle status commentary. After completion it can wait while the user remains in an active Studio workflow. On editor disconnection with no pending work it detaches and returns the browser link; resumption requires a new invocation. This provides update checks during an active turn, not an automatic new model turn after the harness ends.

### 6. Install the skill and MCP entry as one managed integration

Keep the existing installation flags. Register a stable server key `picasso-studio` with `command: node` and an argument array pointing at the persistent installed `mcp.mjs`. For local scope include the canonical `--repo` restriction; global scope includes no install-time repository binding. No secrets or ports belong in the MCP configuration. Use the installer-resolved Node executable where appropriate and preserve arguments as data, not a shell command string.

Default configuration targets:

| Harness | Picasso `--local` MCP target | Picasso `--global` MCP target |
| --- | --- | --- |
| Codex | `<repo>/.codex/config.toml`, `mcp_servers.picasso-studio` | `~/.codex/config.toml`, same table |
| Claude Code | `<repo>/.mcp.json`, `mcpServers.picasso-studio` | `~/.claude.json`, `mcpServers.picasso-studio` |
| Devin CLI | `<repo>/.devin/mcp_config.json`, `mcpServers.picasso-studio` | `~/.config/devin/mcp_config.json`, same key |

Picasso `--local` means repository scope. It deliberately maps to the harness's project scope where its own term "local" instead refers to a private user-file entry. Honor documented configuration home/platform overrides, including Codex's configured home, Claude's configuration location, and Devin's XDG/Windows locations. Print the resolved file, key, scope, launcher, and discovery/trust instructions.

Evidence: [Codex configuration](https://developers.openai.com/codex/mcp), [Claude MCP scopes](https://code.claude.com/docs/en/mcp), and [Devin MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration), checked alongside installed CLI help during planning. Project configurations can require harness trust/approval or a reload; installation must report those requirements without approving them automatically.

Extend the existing managed manifest to record MCP config location, entry fingerprint, runtime version, and the prior managed state. Older manifests containing only a skill are upgradeable: add the MCP entry without discarding user files. Refuse an unmanaged `picasso-studio` server name or user-edited managed entry. Parse/validate JSON or TOML before writing, modify only the owned key/table, and preserve unrelated values and comments where supported.

Use per-target installation locks and a recoverable transaction journal. Stage the runtime and skill, verify config fingerprints have not changed, then replace the owned registrations. On failure restore prior owned entries and the skill; do not overwrite unrelated concurrent edits from another process. If a configuration changed concurrently, abort/reconcile rather than restoring an old whole-file snapshot over it. Report success only when both registrations point to the staged persistent version. A no-op reinstall must verify both registrations, not return early based on the skill alone.

Alternative: executing each harness's `mcp add` blindly may choose the wrong scope and cannot safely distinguish managed from user-owned entries. A scoped configuration adapter provides the needed ownership and rollback behavior while retaining the harness's normal discovery mechanism.

## Risks / Trade-offs

- MCP startup may still be denied by host process/network policy -> Return actionable permission failures, preserve sessions, and use normal host approval/reload paths; do not promise permission-free operation.
- A global MCP process may serve several repositories -> Require repository/session IDs on every operation and apply local-registration restrictions independently of client parameters.
- Config files also hold unrelated and sensitive settings -> Parse before editing, limit changes to owned entries, avoid logging file contents, and use recoverable registration transactions.
- Concurrent processes can race startup or ownership -> Use repository/session launch serialization and retain the existing server-side single-owner lease checks.
- The SDK or bundled dependencies may accidentally emit stdout logs -> Protocol tests launch the packed executable and reject any non-JSON-RPC output.
- Host timeouts and notification handling differ -> Bound tool waits below normal call timeouts, support cancellation, and verify real-client discovery separately from protocol tests.
- The earlier change remains unarchived -> Keep this delta additive under `studio-mcp`; retain earlier unfinished acceptance tasks rather than marking them complete as part of planning.

## Migration Plan

1. Extract shared session access/lifecycle code with existing CLI regression tests passing.
2. Add and bundle the SDK-backed MCP entry point, then test initialization, tools, errors, waits, and cancellation through a real MCP client.
3. Add transaction-aware config adapters and update the skill to use MCP; test fresh and legacy-manifest upgrades for all three harnesses in both scopes.
4. Exercise a packed install and browser through MCP, including submission updates, state recovery, permission errors, and failed opening.
5. Record actual harness discovery/flow evidence and publish no package as part of this change unless separately requested.

Rollback restores the previous owned MCP entry and skill/runtime references while retaining session files. A user may continue using the compatible CLI diagnostic interface. Unsupported future state versions must be rejected instead of silently downgraded.
