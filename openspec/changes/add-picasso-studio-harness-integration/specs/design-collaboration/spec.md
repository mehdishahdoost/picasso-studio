# Spec Delta

## Purpose

Allow a user and coding harness to inspect and edit the same design through structured, revision-aware operations while preserving concurrent work.

## ADDED Requirements

### Requirement: Discoverable design API
Studio SHALL expose a versioned machine-readable contract for reading the document, current selection, supported object kinds and properties, applying operations, obtaining previews, consuming events, and reporting progress. Bundled skill instructions SHALL explain these operations with executable examples.

#### Scenario: Agent discovers editable objects
- **WHEN** the agent reads the contract and current document
- **THEN** it can identify pages and objects by stable IDs and determine which operations and properties are supported without browser automation

### Requirement: Explicit page and object addressing
Object mutations SHALL identify their target page and stable object ID independently of the browser's active page. Supported operations SHALL include object creation, property update, movement, and deletion, plus page creation, rename, reorder, and deletion with at least one page retained.

#### Scenario: Edit an inactive page
- **WHEN** the harness updates an object on a page that the user is not viewing
- **THEN** that object is updated and the user's active page remains unchanged

### Requirement: Validated atomic operations
Studio SHALL validate operation types, IDs, property values, and document invariants before applying an operation batch. Batches SHALL be atomic and carry a request ID that prevents duplicate application on retry.

#### Scenario: Batch contains invalid operation
- **WHEN** a batch contains an unknown object ID or invalid property value
- **THEN** no operations in the batch are applied and a structured error identifies the failed operation

#### Scenario: Retry after lost response
- **WHEN** a client repeats an accepted request with the same request ID and payload
- **THEN** Studio returns its original result without applying the mutation again

### Requirement: Live shared editing
Accepted user and harness operations SHALL update the shared draft and be broadcast to connected editors with origin and revision metadata. Harness operations SHALL appear without a user approval button and SHALL NOT automatically submit the design for implementation.

#### Scenario: Harness edits a button
- **WHEN** the harness changes a button's label through the bridge
- **THEN** the connected browser shows the new label without refresh or an Implement click
- **AND** the current implementation submission remains unchanged

#### Scenario: User changes a draft
- **WHEN** the user moves an object without pressing Implement
- **THEN** the shared draft records the move but no implementation submission is created

### Requirement: Stale write protection
Mutation requests SHALL include their base revision. Studio SHALL reject stale batches without overwriting accepted state, return current revision information, and preserve unsent browser edits for explicit reconciliation. Clients SHALL NOT blindly retry conflicting patches against a newer revision.

#### Scenario: Concurrent property changes
- **WHEN** user and harness submit changes based on the same revision and one is accepted first
- **THEN** the second batch is rejected as stale and its author can inspect the latest state before reapplying

### Requirement: Revision-specific visual references
Studio SHALL return document and preview references labeled with their exact revision and page IDs. Preview retrieval SHALL report failure or unavailability explicitly rather than presenting an older preview as current.

#### Scenario: Preview requested without an editor connection
- **WHEN** the agent requests a preview that cannot currently be rendered
- **THEN** it receives an explicit unavailable result while document inspection remains usable

### Requirement: Collaborative history safety
Undo and redo in a shared session SHALL use validated operations and SHALL NOT restore an old whole-document snapshot over newer remote work.

#### Scenario: Undo after a remote edit
- **WHEN** a user undoes their last action after the harness has edited another object
- **THEN** the remote edit remains intact or the undo reports a conflict without modifying the document
