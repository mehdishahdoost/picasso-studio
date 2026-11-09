# Harness-managed Picasso Studio MCP

Install using `npx picasso-studio --harness codex|claude|devin --local|--global`.
Installation registers both a skill and the persistent stdio MCP executable.
Reload the harness and approve/discover the MCP entry using its normal controls.
Project trust is not granted by the installer. The MCP process initializes without
opening a browser; invoking the skill calls `open_studio`, which starts/reuses the
local web server and attempts opening the editor automatically.

## Tool examples

Every session call targets an absolute `repository` and its `sessionId`. Local
registrations reject another repository; global ones accept the current skill's
workspace explicitly. Tool prefixes differ by host; use the advertised base names.

```json
{"name":"open_studio","arguments":{"repository":"/absolute/repo"}}
```

Always present the returned URL and inspect `browserConnected`. A server or agent
connection is not proof of an open editor. If false, open the URL manually or with
the host browser tool, then call `get_studio_status`. Do not idle indefinitely if
there is no editor and no pending submission.

```json
{"name":"get_design","arguments":{"repository":"/absolute/repo","sessionId":"session-id"}}
```

Read page/object IDs and revision first, then use the batch in
[update-button.json](examples/update-button.json) as `apply_operations.arguments.batch`,
substituting the actual IDs/revision. Harness edits update the shared draft live;
only the browser Implement/Update implementation action publishes instructions.
Tool input schemas provide the complete property/operation vocabulary.

Read selected IDs with `get_selection`. Use `get_preview` with pageId, revision,
and optional format svg/png. PNG results use MCP image content; unavailable
rendering is explicit. SVG and metadata carry the exact revision. `get_submissions`
returns metadata by default or an immutable document when passed submissionId.
Implement the acknowledged snapshot rather than the mutable draft.

## Ownership, updates and recovery

`attach_implementation` returns ownerId and run id. Ownership calls carry ownerId
and runId on the same MCP connection. Use `heartbeat_implementation`,
`acknowledge_submission`, `report_progress`, and `detach_implementation` to manage
that lease. Status values are in-progress, complete, and failed. Progress always
names its submission; completion of an older one cannot complete newer work.

`wait_for_submission` accepts after (event cursor) and timeoutMs (default 20000,
maximum 25000). It returns pending metadata and a resumable cursor. Pending work
is immediate even after reconnecting with a current cursor. Empty waits are not
new instructions. Cancellation releases the pending request without acknowledging
work. An absent editor with no pending submission returns editor_disconnected so
the skill can return the URL and stop waiting. Check updates before implementation
steps and after checks; notifications cannot force an inactive model to resume.

MCP EOF cancels waits and releases only leases acquired by that connection. The
web session remains available. Abrupt termination uses normal lease expiry; a
new connection cannot take over a live owner. Reopen the session after reconnecting
and inspect pending submissions instead of starting a replacement document.

Application failures return isError plus structuredContent.error with code,
message, and details. Examples: permission_required, revision_conflict,
session_mismatch, owner_conflict, session_selection_required. Reconcile stale
writes deliberately. Host policy remains in force; MCP does not bypass networking,
process, tool approval, or workspace trust controls. Diagnostic CLI commands remain
available, but normal collaboration calls the shared service directly inside the
MCP process rather than launching a shell command for each operation.
