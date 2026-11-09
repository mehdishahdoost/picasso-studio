# Spec Delta

## Purpose

Turn explicit user design submissions into revision-specific work for an attached coding agent and support later submissions during implementation.

## ADDED Requirements

### Requirement: Explicit immutable submissions
Implement and Update implementation SHALL publish an immutable snapshot of the synchronized draft with a submission ID, document revision, repository binding, and visual reference availability. Editing by either participant SHALL NOT mutate an existing submission or create a new one automatically.

#### Scenario: Initial implementation request
- **WHEN** the user presses Implement after draft synchronization succeeds
- **THEN** Studio persists and queues a submission containing that exact design revision

#### Scenario: Draft changes during implementation
- **WHEN** either participant edits the draft after submission
- **THEN** the implementation target remains the submitted snapshot until the user publishes another submission

#### Scenario: Submit unsynchronized changes
- **WHEN** the user presses Implement with unsynchronized or conflicting edits
- **THEN** Studio does not publish a partial design and identifies what must synchronize first

### Requirement: Resumable submission delivery
Studio SHALL expose ordered events with resumable cursors and durable submission acknowledgements. Replayed events SHALL NOT create duplicate implementation runs for an already acknowledged submission.

#### Scenario: Reconnect before acknowledgement
- **WHEN** the agent reconnects after receiving a submission but before acknowledging it
- **THEN** it can retrieve that submission again and acknowledge it using the same identity

### Requirement: Cooperative implementation loop
Each bundled harness skill SHALL instruct the active agent to wait for a submission, acknowledge it, implement in the bound repository, check new submissions before each implementation step and after checks, and report progress. Draft events SHALL be distinguishable from submitted implementation instructions.

#### Scenario: Submission arrives while coding
- **WHEN** the user publishes another submission during an implementation step
- **THEN** it is available at the agent's next event checkpoint without another manual skill invocation
- **AND** Studio shows it as pending until acknowledged

#### Scenario: Harness edits the design
- **WHEN** the harness uses the object API during the implementation loop
- **THEN** those changes appear live in Studio but do not authorize implementation of unrelated unsubmitted user edits

### Requirement: Explicit supersession
At a checkpoint the agent SHALL acknowledge the newest pending submission as its target and mark earlier pending submissions as superseded. It SHALL reconcile existing repository work against the new snapshot without resetting unrelated user changes.

#### Scenario: Multiple updates between checkpoints
- **WHEN** two newer submissions arrive before the next checkpoint
- **THEN** the newest becomes the implementation target and the skipped submission is visibly marked superseded

### Requirement: Revision-aware progress and completion
Agent progress SHALL identify its submission and run. The UI SHALL distinguish the current target, newer pending submissions, dirty draft, disconnected agent, failure, and completion. Completion of an older target SHALL NOT mark a newer submission complete.

#### Scenario: Newer submission races with completion
- **WHEN** the agent reports completion of submission A after submission B has been published
- **THEN** A is recorded as complete and B remains pending or in progress

### Requirement: Single implementation owner and reattachment
A session SHALL allow only one attached implementation owner at a time. An ended or disconnected harness SHALL leave submissions durable and SHALL require explicit skill reattachment to resume; Studio SHALL NOT claim it can interrupt or revive an unavailable harness.

#### Scenario: Another agent tries to attach
- **WHEN** an agent requests ownership of a session with a live implementation owner
- **THEN** Studio refuses the second ownership request and identifies the active owner

#### Scenario: Resume an ended session
- **WHEN** the user invokes the skill to reattach after the previous owner has ended or expired
- **THEN** the agent can recover the last acknowledged target and pending submissions without resetting the design
