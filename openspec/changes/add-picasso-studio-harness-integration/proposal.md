# Proposal

## Why

Picasso currently provides a browser editor without a connection to a coding agent. Picasso Studio will let users design visually and submit implementation instructions to their current agent, while both the user and agent can continue editing the design.

## What Changes

- Rename the product and distributable to Picasso Studio and `picasso-studio` respectively.
- Bundle the production editor, local server, bridge CLI, and Codex, Claude Code, and Devin CLI skill adapters in one npm package; no hosted Picasso service or account is required.
- Support `npx picasso-studio --harness <codex|claude|devin> --local|--global` to install a persistent runtime and the selected harness's skill integration.
- Let `$picasso-studio` in Codex and `/picasso-studio` in Claude Code and Devin CLI open a repository-bound local Studio session.
- Provide a discoverable, validated API for reading pages and objects, applying object operations, retrieving previews and selection, consuming events, and reporting implementation progress.
- Synchronize harness design edits live into the browser. User design edits remain drafts as implementation instructions until the user presses Implement or Update implementation.
- Publish immutable implementation submissions, track the revision being implemented, and deliver subsequent submissions through a durable event stream checked by the active agent at implementation checkpoints.
- Detect stale writes and reconnect without silently losing edits or falsely reporting an old submission as current.

## Capabilities

### New Capabilities

- `studio-installation`: Self-contained npm distribution, explicit installation scope, persistent runtime, and harness skill registration.
- `studio-sessions`: Local session lifecycle, repository isolation, persistence, browser launch, and authenticated local communication.
- `design-collaboration`: Structured document operations, live bidirectional editing, revision conflicts, selection, and visual previews.
- `implementation-handoff`: Explicit design submissions, agent event consumption, revision-aware progress, and updates during implementation.

### Modified Capabilities

None. The project has no existing main specs.

## Impact

- `package.json`, build configuration, packaging metadata, and new Node CLI/server modules will provide a publishable runtime instead of a private Vite-only app.
- `src/main.tsx`, `src/Editor.tsx`, and `src/model.ts` will gain a Studio session integration while preserving the existing standalone React/custom-element embedding contracts.
- Existing editor-local mutation, history, and page activation paths need adaptation to avoid whole-document overwrites and active-page-dependent agent targeting.
- New bundled skill templates will explain tool contracts and the implementation checkpoint loop for each harness. Native mid-turn interruption and automatic revival of ended agent sessions are outside the initial scope.
- Tests will cover installer isolation, packed-package execution, document concurrency, local transport, and handoff/reconnect flows. Existing exports remain available.
