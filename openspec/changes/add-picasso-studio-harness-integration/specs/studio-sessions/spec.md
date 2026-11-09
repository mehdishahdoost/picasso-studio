# Spec Delta

## Purpose

Provide persistent local design sessions that connect a browser editor and an active coding agent to the same repository without a hosted Picasso service.

## ADDED Requirements

### Requirement: Local repository-bound launch
Studio SHALL launch its bundled production editor on loopback, bind each session to a canonical repository root, and return a session identifier and browser URL. It SHALL attempt to open that URL in the user's default browser.

#### Scenario: Launch from a skill
- **WHEN** the installed skill starts Studio in a repository
- **THEN** a local session serves the editor and exposes connection information to the invoking agent
- **AND** the browser opens to that session

#### Scenario: Browser launch unavailable
- **WHEN** the operating system cannot open a browser
- **THEN** Studio remains available and prints the URL with instructions to open it manually

### Requirement: Repository and session isolation
Studio SHALL require explicit session targeting for bridge operations and SHALL prevent access to a session through a different repository binding. Separate sessions SHALL have separate documents, submissions, and implementation state.

#### Scenario: Two repositories
- **WHEN** Studio sessions are opened for two repositories
- **THEN** edits, submissions, and progress in one session do not affect the other

#### Scenario: Mismatched repository
- **WHEN** an agent targets a session bound to another repository
- **THEN** the bridge rejects the request before reading or modifying that session's design

### Requirement: Local connection authorization
Studio SHALL authenticate browser and bridge requests with session-scoped credentials and restrict browser origins to its own local application. It SHALL reject unauthorized requests and SHALL NOT expose arbitrary shell execution or unrestricted filesystem access through the design API.

#### Scenario: Unrelated website attempts mutation
- **WHEN** a request lacks valid credentials or comes from an unauthorized browser origin
- **THEN** the local server rejects the request and leaves session state unchanged

### Requirement: Durable session recovery
Studio SHALL persist accepted document revisions, submissions, and implementation acknowledgements before confirming them. A restarted server SHALL restore these records and provide reconnect information without resetting revision identities.

#### Scenario: Restart after submission
- **WHEN** the server restarts after acknowledging an implementation submission
- **THEN** reconnecting browser and agent clients can retrieve the same submission and document revision

### Requirement: Visible connection lifecycle
The editor SHALL display agent and server connection state, distinguish disconnection from implementation completion, and provide a reconnect path. A disconnected editor SHALL retain unsent local edits and require reconciliation before submitting them.

#### Scenario: Connection drops during editing
- **WHEN** the editor loses its server connection with unsent edits
- **THEN** it marks those edits as unsynchronized and does not report them as submitted
- **AND** reconnecting preserves the edits for retry or conflict resolution

#### Scenario: Agent exits
- **WHEN** the agent detaches or its connection expires
- **THEN** Studio shows that the agent is disconnected and retains pending submissions for explicit reattachment
