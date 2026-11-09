# Spec Delta

## Purpose

Let supported coding harnesses start Picasso Studio automatically and collaborate through a persistent local MCP connection instead of per-operation shell commands.

## ADDED Requirements

### Requirement: Harness-managed stdio connection
The installed runtime SHALL provide a stdio MCP server with initialization, tool discovery, and structured tool calls. Starting the MCP connection SHALL NOT open a browser until the agent requests Studio. Standard output SHALL contain only MCP protocol messages.

#### Scenario: Harness discovers Studio tools
- **WHEN** the harness starts the registered MCP executable and initializes its connection
- **THEN** it can list the Studio tools without starting a browser or receiving non-protocol output

### Requirement: Automatic repository-bound Studio opening
The `open_studio` tool SHALL start or reuse the local web server and attempt to open the editor without requiring the user to start a server manually. It SHALL return the canonical repository, session ID, browser URL, launch outcome, and editor connection state.

#### Scenario: First invocation
- **WHEN** the skill calls `open_studio` for a repository with no existing design session
- **THEN** Studio creates a persistent session, starts its local server, and attempts to open the browser
- **AND** subsequent design tools can target the returned session without shell commands

#### Scenario: Reuse an existing session
- **WHEN** the agent requests an existing session in its bound repository
- **THEN** Studio reuses that session and its saved design rather than creating a replacement

### Requirement: Honest browser launch status
Studio SHALL distinguish server readiness, browser-launch acceptance, connected editor, and attached implementation owner. Every open result SHALL include a browser URL. Failure, missing desktop, and timeout SHALL NOT be represented as a connected editor.

#### Scenario: Launcher succeeds without opening the editor
- **WHEN** the desktop opener exits successfully but no editor connects
- **THEN** the result reports server readiness and an unconfirmed editor connection with the URL for manual or harness-browser opening

### Requirement: Repository and session targeting
Every session tool SHALL resolve an explicit repository and session binding. A repository-scoped installation SHALL reject another repository. A global installation SHALL accept a repository from the current skill invocation without baking in the directory where installation occurred.

#### Scenario: Cross-repository mutation
- **WHEN** an agent uses a session ID with the wrong repository
- **THEN** the mutation is rejected without changing either session

### Requirement: Structured collaboration tools
MCP tools SHALL support reading the draft and selection, applying page-qualified operation batches, and retrieving revision-specific previews using discoverable input schemas. Mutations SHALL preserve the existing atomic validation, request deduplication, and stale-write protection.

#### Scenario: Harness edits a design object
- **WHEN** the agent calls the object mutation tool with valid IDs and the current revision
- **THEN** the operation is applied once and appears live in the connected editor
- **AND** no implementation submission is created

#### Scenario: Stale mutation
- **WHEN** the mutation uses a stale base revision
- **THEN** the tool returns a structured conflict and preserves accepted state

### Requirement: Submission and progress tools
MCP tools SHALL expose immutable submitted designs, single-owner implementation attachment, acknowledgement, heartbeat, detach, and submission-specific progress. The MCP interface SHALL NOT expose an operation that publishes the user's draft for implementation.

#### Scenario: User submits during implementation
- **WHEN** the user presses Update implementation while a prior submission is active
- **THEN** the agent can discover and acknowledge the new snapshot through MCP
- **AND** reporting completion of the old target does not complete the new submission

### Requirement: Bounded update waits
The submission-wait tool SHALL accept a resumable event cursor, return within its documented timeout, and support cancellation. A timeout SHALL return an empty result and a cursor without inventing a submission or restarting the session.

#### Scenario: No submission arrives
- **WHEN** the wait timeout expires without a submitted design
- **THEN** the call returns successfully with no submission and a resumable cursor

#### Scenario: Caller cancels a wait
- **WHEN** the MCP client cancels a waiting call
- **THEN** the wait releases its resources without acknowledging, discarding, or implementing a submission

### Requirement: Recovery independent of MCP process lifetime
Closing or restarting an MCP process SHALL preserve saved designs, revisions, submissions, and acknowledgements. Reattachment SHALL recover the intended session and SHALL NOT take over another live implementation owner.

#### Scenario: MCP process restarts
- **WHEN** the harness reconnects after its MCP process exits
- **THEN** it can reopen the same session, read its pending submissions, and reacquire an available ownership lease without resetting the canvas

### Requirement: Scoped skill and MCP installation
The existing installation command SHALL register both the skill and stdio MCP connection for Codex, Claude Code, or Devin CLI in the selected `--local` or `--global` scope. Registration SHALL reference the persistent installed runtime rather than an npx cache.

#### Scenario: Local installation
- **WHEN** the user installs a supported harness with `--local`
- **THEN** its skill and MCP entry are registered for that repository and unrelated user-level configuration is unchanged

#### Scenario: Global installation
- **WHEN** the user installs a supported harness with `--global`
- **THEN** its user-level skill and MCP entry can open sessions in different repositories after normal harness discovery and trust checks

### Requirement: Managed configuration preservation
Installation SHALL preserve unrelated harness settings and MCP servers, refuse unmanaged or user-edited conflicting entries, and recover the previous working skill/MCP/runtime references if registration fails. Reinstalling unchanged managed configuration SHALL be idempotent.

#### Scenario: Registration fails after staging
- **WHEN** installation cannot complete all required configuration changes
- **THEN** it reports failure and restores its prior working registrations without removing unrelated entries

### Requirement: MCP-first skill behavior
The installed skill SHALL use MCP tools for normal startup and collaboration, show the browser URL, and check editor connectivity before waiting for a new design. It SHALL avoid repeated idle status messages and SHALL report unavailable tools or permission failures without claiming successful opening.

#### Scenario: No editor is connected
- **WHEN** startup cannot establish an editor connection and no submission is pending
- **THEN** the skill shows the URL and actionable launch outcome and ends the wait attempt

#### Scenario: Tools need rediscovery
- **WHEN** the harness has not loaded the installed MCP entry
- **THEN** the skill explains how to reload or approve that entry instead of entering a shell polling loop

### Requirement: Local trust boundary and structured failures
The MCP interface SHALL retain loopback authentication and repository checks, expose no arbitrary shell or filesystem operations, and report application failures with machine-readable codes. Registration SHALL NOT change harness approval policies or mark a repository trusted automatically.

#### Scenario: Host blocks startup
- **WHEN** the harness denies the networking or process permission required to start Studio
- **THEN** the tool returns an actionable permission failure without treating it as lost design data or bypassing the host policy
