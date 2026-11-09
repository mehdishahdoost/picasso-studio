# Spec Delta

## Purpose

Distribute Picasso Studio as a self-contained npm package and install reusable skill integrations for supported local coding harnesses.

## ADDED Requirements

### Requirement: Explicit harness and installation scope
The installer SHALL accept `--harness codex`, `--harness claude`, or `--harness devin` and exactly one of `--local` or `--global`. Local scope SHALL target the current repository; global scope SHALL target the current user's harness skills.

#### Scenario: Repository installation
- **WHEN** the user runs `npx picasso-studio --harness codex --local` inside a repository
- **THEN** the installer registers the Codex skill for that repository and reports its location and invocation command
- **AND** user-level harness files are unchanged

#### Scenario: User installation
- **WHEN** the user runs the installer with a supported harness and `--global`
- **THEN** the skill is registered for that user across repositories without changing the current repository

#### Scenario: Invalid arguments
- **WHEN** the harness is unsupported, the scope is missing, both scopes are passed, or local scope is requested outside a repository
- **THEN** installation fails with an actionable error before modifying files

### Requirement: Persistent bundled runtime
The package SHALL include production editor assets, a local server, a bridge CLI, and skill templates. Installed integrations SHALL use a persistent versioned runtime that remains usable without the initiating npx cache, a source checkout, a development server, or a Picasso hosted service.

#### Scenario: Installation survives cache removal
- **WHEN** installation completes and the initiating npx cache is subsequently unavailable
- **THEN** the installed skill can launch the bundled editor and bridge without downloading runtime assets

### Requirement: Harness-specific skill invocation
The installer SHALL register `picasso-studio` as a skill callable with `$picasso-studio` in Codex and `/picasso-studio` in Claude Code and Devin CLI. The skill SHALL document launch, object operations, submissions, event checkpoints, and progress reporting using the installed runtime.

#### Scenario: Invoke installed skill
- **WHEN** a supported local harness discovers and invokes the installed skill in a repository
- **THEN** the skill instructs that agent to open a repository-bound Picasso Studio session and wait for implementation submissions
- **AND** any required harness reload is explained by the installer

### Requirement: Safe repeat installation
Installation SHALL preserve unrelated harness configuration and user-authored skills. Reinstalling the same managed version SHALL be idempotent; replacing a managed version SHALL leave the previous installation usable if replacement fails.

#### Scenario: Existing user-authored skill
- **WHEN** a target skill location contains an unmanaged `picasso-studio` skill
- **THEN** the installer refuses to overwrite it and reports the conflict

#### Scenario: Reinstall managed integration
- **WHEN** the same package version is installed again for the same harness and scope
- **THEN** only one usable managed integration exists and unrelated files are unchanged

### Requirement: Picasso Studio identity and embedding compatibility
The distributed application SHALL identify itself as Picasso Studio while continuing to accept schema-version-1 Picasso documents and preserving the existing React and custom-element embedding interfaces.

#### Scenario: Existing consumer
- **WHEN** an embedding consumer supplies an existing document using the current component or custom-element API
- **THEN** the document loads without requiring a Studio session or renaming its existing interface identifiers
