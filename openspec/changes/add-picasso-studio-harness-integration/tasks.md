# Tasks

## 1. Structured document protocol

- [x] 1.1 Define the versioned session, operation, event, submission, and progress schemas plus machine-readable property descriptions; verify representative documents and malformed inputs with schema tests.
- [x] 1.2 Extend the document engine with explicit page/object targeting, validated atomic operation batches, and page lifecycle operations; test inactive-page edits, duplicate IDs, invalid geometry, missing targets, reference integrity, and last-page protection.
- [x] 1.3 Add base-revision checks, request deduplication, and inverse operations; test stale concurrent writes, lost-response retries, reused IDs with changed payloads, and undo after remote changes.
- [x] 1.4 Document the operation contract and structured errors alongside executable JSON examples; verify the examples through the document engine tests.

## 2. Local server and session persistence

- [x] 2.1 Implement canonical repository binding and serialized atomic state persistence; test independent repositories, state recovery after interrupted writes, and preservation of acknowledged revisions/submissions.
- [x] 2.2 Implement the loopback HTTP API, browser bootstrap credentials, authorized same-origin SSE, and static production asset serving; test missing credentials, wrong origins/hosts, asset traversal, and cross-session access rejection.
- [x] 2.3 Implement ordered persisted events and bounded resumable long polling; test timeout responses, reconnect replay, and transaction-before-broadcast ordering.
- [x] 2.4 Add session open/list/attach/stop commands, managed background launch, browser opening, and stale-process detection; test readiness, port selection, browser failure fallback, and explicit session selection.
- [x] 2.5 Document session lifecycle, credential handling, recovery, and Node runtime requirements; verify documented commands against a local server fixture.

## 3. Collaborative editor integration

- [x] 3.1 Introduce Studio and in-memory editor controllers while preserving the React/custom-element API; test existing document loading and standalone get/load/execute/export behavior without a server.
- [x] 3.2 Route shape edits, gestures, inline text, property edits, page operations, and API document loads through the Studio operation queue; integration-test browser-to-server changes and server-to-browser harness edits without event echo loops.
- [x] 3.3 Decouple active page/selection/viewport from persisted page order and expose current browser selection to the bridge; test that viewing a page does not change document revision and agent edits do not switch the user's page.
- [x] 3.4 Implement inverse-operation collaborative undo/redo and stale queue reconciliation preserving unsent intent; test remote edit preservation, disconnect during a gesture, and explicit retry/discard after a conflict.
- [x] 3.5 Extract revision-specific SVG rendering and connected-browser PNG support; test previews for inactive pages and immutable submissions, verify revision labels, and report unavailable formats explicitly.
- [x] 3.6 Rename visible product branding to Picasso Studio and document connected versus standalone usage; verify branding in the editor and preserve schema-version-1 export/import compatibility through regression checks.

## 4. Implementation submissions and progress

- [x] 4.1 Add Implement/Update implementation controls that flush local edits and create immutable synchronized snapshots; test pending gesture/inline changes, disconnected submission prevention, and snapshot immutability after later edits.
- [x] 4.2 Implement single-owner attachment leases, heartbeat, durable acknowledgement, and newest-pending supersession; test competing owners, lease expiry, replayed acknowledgements, and multiple queued submissions.
- [x] 4.3 Add submission-targeted progress and completion plus UI indicators for draft, pending, active, disconnected, failed, and complete states; test the race where an older target completes after a newer submission arrives.
- [x] 4.4 Document the submission lifecycle and checkpoint latency; verify a scripted agent can implement submission A, observe submission B at its next checkpoint, and reattach after restart without losing pending work.

## 5. Agent bridge and skills

- [x] 5.1 Implement the bundled bridge CLI for describe/document/selection/apply/preview/events/acknowledge/progress and ownership operations with stdin/file input and structured results; test commands end-to-end against the server, including errors and paths containing spaces.
- [x] 5.2 Add Codex, Claude Code, and Devin CLI skill templates using persistent launcher references; verify generated templates contain executable launch/object-edit examples and the complete wait/acknowledge/implement/check/report loop.
- [x] 5.3 Document that only submissions authorize implementation targets, while harness design edits are live; test a scripted skill consumer distinguishes draft events from submission events and preserves unrelated repository edits when switching targets.
- [ ] 5.4 Add adapter compatibility metadata and installation help for invocation, reload, and local/global precedence; verify registration paths against current official harness documentation and record supported versions.

## 6. npm distribution and scoped installation

- [x] 6.1 Configure the `picasso-studio` executable, Node production build, bundled runtime dependencies, production editor assets, and npm file allowlist; verify a built tarball contains all required assets and runs without source files or Vite.
- [x] 6.2 Implement explicit harness/scope argument validation and managed local/global installation destinations; test all three harnesses in both scopes plus missing/both scopes, unsupported harnesses, and local installation outside a repository with no partial writes.
- [x] 6.3 Implement persistent versioned payload staging, checksums, managed ownership manifests, idempotent reinstall, and atomic integration replacement; test unmanaged conflicts, failed updates, rollback, and invocation after the initiating npx cache is unavailable.
- [x] 6.4 Document installation, invocation, updating managed versions, reconnecting, and stopping sessions; execute the documented installation commands against a local packed-package fixture in isolated repositories and user homes.

## 7. End-to-end acceptance

- [x] 7.1 Run the build and complete automated suite, then exercise the packed package with two isolated repositories and a browser; verify install, launch, live bidirectional edits, draft gating, update submission, reconnect, and older-completion handling together.
- [ ] 7.2 Smoke-test actual skill discovery and the design/implement/update loop in supported Codex, Claude Code, and Devin CLI versions for both installation scopes; record observed versions and results, and leave unavailable harness checks explicitly incomplete rather than claiming support from template tests alone.
- [x] 7.3 Verify package-name availability and release metadata without publishing; record any registry ownership blocker and confirm this change does not publish a package or require a hosted service.
