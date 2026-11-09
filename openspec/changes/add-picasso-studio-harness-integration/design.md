# Design

## Context

See proposal.md for motivation and scope. This is a cross-cutting change, so a design artifact is required.

The repository contains a private React/Vite package with no server, executable, skill templates, or test files. `src/model.ts` defines schema-version-1 documents, stable page/object IDs, and add/delete/move/update commands. Commands currently target the active page and silently ignore some invalid targets. `activatePage` reorders the document, and much of the editor renders `pages[0]`.

`src/Editor.tsx` owns the document and whole-document undo history. Mutations have several paths: commands, direct state changes, page operations, import, and undo/redo. The exposed API provides get/load/execute/exportSvg. SVG export reads the mounted DOM; PNG export renders through a browser canvas. `src/iframe-protocol.ts` is an embedding helper, not a connected harness bridge. React and `<picasso-editor>` consumers must continue to work without a server.

## Goals / Non-Goals

**Goals:**
- Use one authoritative document engine for browser and harness operations.
- Make installed skills and executable assets survive npx cache cleanup.
- Separate live document editing from authorization to change implementation targets.
- Make recovery, concurrency, and cooperative agent operation testable independently of an LLM.

**Non-Goals:**
- Hosted services, accounts, cloud Devin connectivity, or port tunnels.
- Interrupting an arbitrary executing agent tool call or waking an ended agent turn.
- A required MCP server, full CRDT collaboration, or automatic code-to-design reverse engineering.
- Renaming legacy `Picaso*` TypeScript identifiers or `picasso-*` embedding interfaces.

## Decisions

### 1. Ship a production runtime and install explicit scopes

Publish `picasso-studio` with a Node executable, built editor assets, bundled Node server/CLI code, and harness templates. Target Node 22 or later. Production launch must not depend on Vite or a source checkout. Package runtime dependencies with the executable so copying the package's runtime payload is sufficient; installation must not leave dependencies pointing into npx's temporary directory.

The no-subcommand invocation with `--harness` performs installation and requires exactly one scope. `--glonal` is a discussion typo, not a supported alias. Detect the canonical repository root for `--local`; reject it outside Git repositories. `--global` does not need a repository.

| Harness | Local skill | Global skill | Invocation |
| --- | --- | --- | --- |
| Codex | `.agents/skills/picasso-studio/SKILL.md` | `~/.agents/skills/picasso-studio/SKILL.md` | `$picasso-studio` |
| Claude Code | `.claude/skills/picasso-studio/SKILL.md` | `~/.claude/skills/picasso-studio/SKILL.md` | `/picasso-studio` |
| Devin CLI | `.devin/skills/picasso-studio/SKILL.md` | `~/.config/devin/skills/picasso-studio/SKILL.md` (Linux/macOS; `%APPDATA%/devin/skills/` on Windows) | `/picasso-studio` |

Use a small adapter registry, honoring documented harness home overrides when applicable. Validate these paths against supported installed harness releases during compatibility checks. Treat Devin here as Devin CLI running locally, not the cloud service.

Local payloads live under `<repo>/.picasso-studio/runtime/<version>/`; global payloads under `~/.picasso-studio/runtime/<version>/`. Generated skill references resolve a persistent launcher, quote paths safely, and never hard-code the npx cache. A managed manifest records version, harness, scope, owned paths, and payload checksums. Stage and verify payloads before atomically switching the skill integration; refuse unmanaged skill conflicts. Reinstalling the same managed payload is a no-op. Do not alter unrelated settings. Local runtime/session folders carry their own ignore rules for generated data without rewriting the repository's existing ignore file.

Alternative: making skills run `npx ...@latest` every time is simpler but makes invocation depend on network availability and silently changes the runtime. Installing a harness marketplace plugin is not required for this npm-based interface.

### 2. Use a repository-bound loopback session server

The skill runs the persistent executable's `session open --repo <root> --harness <id> --json`. This creates or explicitly reattaches to a session and returns `sessionId`, URL, repository binding, and credential-file location. Each session has a loopback server with a free OS-assigned port and a local state directory under `<repo>/.picasso-studio/sessions/<sessionId>/`. An installation can open sessions in many repositories; global installation never implies a global shared design.

Start the server as a managed background child process that survives an individual shell tool call; wait for readiness before returning. Support `session list`, `session attach`, and `session stop`. Do not silently choose among multiple sessions. The skill reports the URL if browser opening fails. Port conflicts choose another free port; stale process records are checked rather than trusted.

Authenticate all API/event requests with a random session token stored in a restricted local file. Bootstrap the browser using a one-time URL fragment exchange, then remove it from the URL and use a same-origin session cookie. Require exact local Origin/Host checks for browser requests and authenticated headers for the CLI. Bind only to loopback; reject path traversal in static assets and never expose a general shell/file API. Do not use the iframe helper's permissive default origin for the server bridge.

Alternative: letting the browser own the document and reading its DOM requires an open tab and loses state on refresh. A server-owned document supports agent mutations and recovery even when no editor is connected.

### 3. Separate document, submission, and event identities

Keep schema version 1 for document content. Store collaboration metadata in a session envelope:

```text
Session: id, canonicalRepo, protocolVersion, document, revision
Operation: requestId, actorId, origin, baseRevision, operations[]
Submission: id, sequence, documentRevision, immutableDocument,
            previewReferences, createdAt, status
Event: sequence, type, origin, documentRevision, submissionId?, payload
Run: id, ownerId, leaseExpiry, targetSubmissionId, status, message
```

Use serialized state transactions with atomic JSON file replacement for the initial local single-writer server. Persist document, deduplication receipts, event records, submissions, and acknowledgements together before returning success or broadcasting. A successful transaction increments the document revision only for content mutations and increments event sequence for every emitted event. Ephemeral selection and heartbeat updates do not dirty the document. Interrupted writes retain the last valid state; never load partial files. Do not prune event history in the initial implementation; future compaction needs an explicit cursor reset contract.

### 4. Expose one contract through HTTP and a bundled CLI

The CLI is the required portable agent interface. MCP can wrap the same service later without changing semantics. Define a protocol-versioned JSON schema and a `bridge describe` command so skills do not need to repeat every property definition.

```text
bridge describe
bridge document --session <id>
bridge selection --session <id>
bridge apply --session <id> --input <operations.json>
bridge preview --session <id> --page <id> --revision <n>
bridge events --session <id> --after <cursor> --wait <seconds>
bridge acknowledge --session <id> --input <ack.json>
bridge progress --session <id> --input <progress.json>
```

Commands emit machine-readable JSON, structured error codes, and nonzero exits on failure. Input files or stdin avoid shell interpolation of object text. Session descriptors resolve endpoints and credentials; token values are not printed in routine output. Events use bounded long polling for the CLI and authenticated same-origin SSE for the browser. Heartbeat/ownership commands are part of the contract. Poll timeouts return successfully with no events and an unchanged cursor.

`apply` accepts atomic batches with page-qualified targets and stable IDs. Add validation for known kinds/properties, finite geometry, unique IDs, page existence, reference integrity, and at least one page. Errors include `invalid_operation`, `not_found`, `revision_conflict`, `unauthorized`, and `session_mismatch`. A stale document revision rejects the entire batch; clients reread and deliberately reconcile. Request IDs deduplicate identical retries and reject reuse with a different payload.

This conservatively rejects even disjoint stale edits. Field-level merging and CRDTs offer better concurrency but are unnecessary to prevent data loss in the initial release. No automatic conflict winner is assumed: accepted edits remain authoritative, rejected browser edits remain recoverable, and the UI offers explicit retry/discard after inspection.

### 5. Adapt editor mutation and history paths

Introduce a Studio controller around the editor and retain an in-memory controller for existing embeds. Route every Studio content mutation through the operation service, including drag, resize, rotation, inline edits, properties, page operations, and JSON loading. Keep selection, viewport, and active page as presentation state; viewing a page must not reorder persistent pages or affect agent targeting. Treat intentional page reorder as a content operation.

The browser can display optimistic changes while queuing ordered operations, but only acknowledged revisions are shared. On a conflict, stop that queue, fetch current state, and preserve unsent intent in a reconciliation UI. Flush in-progress gestures and inline text before Implement; block submission if reconciliation is pending. Apply incoming events without echoing them as new local mutations.

Replace shared-session whole-document history restoration with inverse operation batches and revision checks. Undo can safely reject when intervening edits conflict; it must not roll back remote work. Preserve current standalone behavior through the in-memory controller and keep the legacy embedding API.

Extract a document/page renderer usable for revision-specific SVG references without depending on current selection or the live active page. Return preview bytes or durable local file references with revision metadata. PNG rendering can use a connected browser when available and returns explicit unavailability otherwise. Snapshot preview generation must render the requested immutable document, not whatever draft happens to be mounted. An absent preview does not block submission; its availability is explicit.

### 6. Use button-gated submissions and cooperative agent checkpoints

The mutable draft is shared and readable by the agent. That visibility is distinct from implementation authorization. Only Implement/Update implementation copies the synchronized draft into an immutable submission and emits `implementation.submitted`. Harness edits change the draft immediately, without creating a submission or changing the current implementation target. Skills must implement the acknowledged snapshot and must not treat arbitrary draft events as instructions to change repository code.

The skill joins as the single implementation owner using a renewable lease, opens the browser, then performs bounded event waits while the session remains active. It acknowledges a submitted snapshot, reads its JSON/visual references, implements one bounded step in the repository, checks for updates, runs relevant checks, checks again, and reports status tagged with run and submission IDs. Ownership calls and event polling renew the lease; use a lease longer than expected individual build/check commands and an explicit heartbeat command for longer operations. An expired owner must reacquire before further acknowledgements or progress writes.

At each checkpoint, atomically acknowledge the newest pending submission and mark skipped pending submissions superseded. Reconcile repository work toward the newer target rather than resetting the repository. Replayed acknowledgements are idempotent. Completion of an older target is recorded only against that target; the UI still shows a newer pending submission. After completing work, the skill waits for another submission until the user ends or detaches the session. An ended agent requires explicit reattachment; the server does not inject terminal keystrokes or claim automatic revival.

This portable loop provides updates at checkpoints, not guaranteed mid-tool interruption. Native hooks or harness APIs could shorten latency later, but are not a dependency for initial support. Each adapter must be exercised with its actual harness; a prompt alone is not evidence of compatibility.

## Risks / Trade-offs

- Agent may skip checkpoint instructions -> Include exact bounded-loop guidance, durable pending state, revision-specific status, scripted protocol tests, and real harness smoke checks; do not advertise forced interruption.
- Concurrent dragging may produce stale batches -> Queue/coalesce gesture operations, preserve unsent intent, and provide explicit reconciliation rather than silently overwriting.
- Whole-document editor paths can bypass synchronization -> Inventory every mutation and cover page/history/import/inline-edit flows in integration tests.
- Browser preview code currently depends on mounted state -> Extract the renderer and label every result; report unavailable formats explicitly.
- Local endpoints are reachable by other local processes -> Session credentials, restrictive files, Origin/Host checks, and no arbitrary execution endpoints.
- npm name availability and publish rights are unverified -> Verify before release; no registry publication or package renaming fallback is authorized by this planning workflow.
- Global and local skills can shadow one another -> Installer reports the selected scope and launch version; acceptance checks cover both scopes and document the harness's precedence.

## Migration Plan

1. Introduce protocol/model validation and the standalone controller without requiring consumers to run a server.
2. Add the loopback runtime, persistence, and bridge; connect the Studio entry point while retaining embedding interfaces.
3. Add submission/progress UI and the cooperative skills for all three harnesses.
4. Rename visible branding and npm metadata, build a tarball, and test installation from that tarball in isolated repositories and user homes. Do not publish as part of implementation unless separately requested.
5. Document install/invoke/update/reconnect/stop behavior and checkpoint latency. Run actual supported-harness smoke checks before claiming release readiness.

Rollback switches the managed skill pointer to its prior installed runtime. Retain session data and reject unsupported protocol/data versions rather than downgrading them silently. Existing schema-version-1 document exports remain portable independently of session metadata.
