---
name: picasso-studio
description: Open the local Picasso Studio visual editor, collaborate on objects, and implement user-submitted designs through the Picasso Studio MCP tools.
---

# Picasso Studio ({{HARNESS}})

Invoke with `{{INVOCATION}}`. Use tools from the installed `picasso-studio` MCP server.
Host-generated prefixes vary: find the advertised base tool names below rather than guessing a prefix.

## Open the editor

1. Resolve the absolute repository root from this conversation's current workspace.
2. Call `open_studio` with `{"repository":"<absolute-repo>"}`. For an explicitly selected existing design, also pass `sessionId`.
   The harness-managed MCP process starts/reuses the local web server and attempts browser opening automatically.
   If several sessions exist, use `list_studio_sessions` and select the session the user intends; do not silently choose one.
3. ALWAYS present the returned browser URL as a clickable link. Read `browserLaunch` and `browserConnected`.
   Server readiness, an accepted opener request, and agent attachment do not prove the editor is open.
   If needed, use the harness browser tool to open the returned URL, then call `get_studio_status`.
4. Call `get_submissions` to check pending work. If no editor is connected and no submission is pending,
   report the URL and actionable launch outcome, then stop this invocation. Do not enter an endless submission wait.
   Existing submitted work can resume even when the editor is closed.

If MCP tools are unavailable, explain that the harness must reload/discover the installed MCP registration
and approve it if required. Do not replace the MCP workflow with repeated shell polling.
For `permission_required`, use the host's normal approval/restart mechanism; do not bypass policies or
assume that sandbox-blocked networking means the server has died. Never claim successful opening after a failed tool call.

## Implement submitted designs

Every session tool needs `repository` and `sessionId`. Use the exact canonical values returned by open_studio.

1. Call `attach_implementation` for that session. Save the returned `ownerId` and run `id` as `runId`.
   Never take over another live implementation owner. Ownership tools also need these owner/run identifiers.
2. Call `wait_for_submission` with the last returned event cursor as `after` and `timeoutMs: 20000`.
   Save its cursor. Pending submissions are returned immediately even after reconnecting with a current cursor.
   Empty timeouts are not submissions. Renew ownership using `heartbeat_implementation` before/after long checks.
3. Acknowledge pending work with `acknowledge_submission`. Implement the returned immutable submission document,
   not the mutable draft returned by get_design. Use get_submissions with submissionId to reread an immutable snapshot.
   Retrieve visual references with `get_preview` using the exact pageId and documentRevision; report unavailable images honestly.
4. Before EACH bounded implementation step, and after tests, check get_submissions/wait_for_submission for newer submissions.
   Acknowledge the newest target and reconcile work toward it while preserving unrelated user code. Never reset the repository.
5. Call `report_progress` with the exact ownerId, runId, submissionId, status, and a concise message.
   Valid statuses: in-progress, complete, failed. Completing an older target does not complete a newer pending submission.
6. While the user remains in the active Studio workflow, use bounded waits for updates without repeating idle status messages.
   If the editor disconnects and no submission is pending, show the link once, detach_implementation, and end the wait attempt.
   On explicit exit, detach only your own implementation lease; leave the web server and saved design intact.

MCP process restart does not erase the design. Reopen the selected session and reacquire available ownership.
A conflicting active lease must be respected. An ended harness turn requires a new skill invocation; MCP cannot
force mid-tool interruption or revive an inactive model automatically.

## Edit design objects live

Use `get_design` and `get_selection` first. Objects have stable page/object IDs.
Call `apply_operations` with a revision-aware batch, replacing sample IDs with values you just read:

```json
{"repository":"<absolute-repo>","sessionId":"<session-id>","batch":{"requestId":"<unique-request>","actorId":"<owner>","origin":"harness","baseRevision":42,"operations":[{"type":"update","pageId":"<page-id>","id":"<button-id>","patch":{"text":"Create account","fill":"#2563eb","width":180}}]}}
```

Harness edits appear live. User edits remain drafts as implementation instructions until they press Implement/Update implementation.
Neither harness edits nor visibility of draft events authorize implementing unsubmitted changes. There is no agent tool to submit the draft.
Input schemas describe add/update/move/delete and page operations. Patch null removes an optional property.
Batches are atomic, request IDs deduplicate identical retries, and revision_conflict requires rereading and deliberate reconciliation.
Never blindly apply the same patch against a newer revision.

CLI diagnostics remain available at `node {{LAUNCHER}} --help`; normal startup, reads, edits, waits and progress use MCP tools.
