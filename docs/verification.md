# Verification record

## Automated checks

The implementation includes document schema and operation tests, session persistence
and ownership tests, HTTP authorization and event delivery tests, standalone and
shared-controller tests, revision-specific preview tests, production CLI lifecycle
tests, installation tests for all harness/scope combinations, and packed-package
browser acceptance tests. Run `npm run build` followed by `npm test`. On 2026-11-09 these checks passed: 32 tests across 9 files, including the real-browser acceptance flow.

The real-browser test installs a packed runtime in a disposable repository,
removes the extracted package source, opens Studio, edits and submits a design,
applies a live harness mutation, renders submitted SVG/PNG previews, submits an
update while the first target is active, verifies old completion does not complete
the new target, reconnects with conflicting offline edits, reloads the editor,
checks a second repository remains isolated, and exercises the custom-element API.
Global packed-package tests isolate the test process's OS home lookup without
writing real user skill files.

## Registry

On 2026-11-09, `npm view picasso-studio name version dist-tags --json` returned
E404 from registry.npmjs.org. There was no published package at that name at check
time. This does not reserve the name or establish publish rights. Nothing was
published by this implementation workflow. The package has a production executable,
a runtime file allowlist, Node engine metadata, and no production dependencies;
all app and server dependencies are bundled.

## Actual harness verification

Installed executables observed: Codex 0.167.0, Claude Code 2.1.319, Devin CLI
3000.12.32. Registration paths were checked against official docs linked in
[compatibility.md](compatibility.md). Actual agent-session acceptance remains
separate from automated protocol and generated-template verification. See task
7.2 in the OpenSpec change for the required local/global end-to-end checks.

Real agent-session tests were requested separately because they start additional
agent sessions. They remain pending approval; tasks 5.4 and 7.2 are intentionally
not marked complete. The installed runtime and generated skills are available for
review without claiming verified harness versions.

## 0.1.1 browser launch regression

The reported launch failure reproduced a loopback `EPERM` sandbox denial. The CLI
now distinguishes permission failures from server disconnection. Opener exit zero
means only that a browser request was accepted; timeout remains unconfirmed. A
separate authenticated status endpoint confirms editor connections. The skill
always presents the link, checks editor presence, and does not enter submission
waits when no editor is connected. Added regression coverage for opener success,
failure diagnostics, timeout, headless launch, nested sandbox errors, CLI status,
and real-browser connection confirmation.

## 0.2.0 MCP verification

The MCP path has SDK-client tests for initialization, typed tool discovery, live
object operations, immutable submission reads, ownership, progress, bounded waits,
cancellation, cross-process session reuse, permission denial, and state recovery.
A packed-runtime browser test removes the extracted package before connecting to
the installed MCP executable, verifies live edits in both directions, submitted
SVG/PNG references, updates while implementing, older completion handling, and
MCP reconnection without resetting the canvas.

Generated registration entries were accepted by native configuration commands in
Codex 0.167.0, Claude Code 2.1.319, and Devin CLI 3000.12.32. The Codex parser check
passes the generated entry through a read-only command-line override because
project config needs user trust; it does not grant that trust. Claude and Devin
checks read the disposable repository registrations directly. These are config
checks, not claims that a model-driven implement/update loop has passed.

Actual model-session tests remain the separate task 5.3 in
add-harness-managed-studio-mcp and require explicit authorization to start the
additional agent sessions. No registry publication is part of this change.

Final automated validation for the 0.2.0 implementation on 2026-11-09: the
TypeScript/production build passed and all 62 tests across 16 files passed,
including both packed-package browser flows and native configuration checks.
