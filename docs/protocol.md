# Picasso Studio protocol v1

Run `picasso-studio bridge describe` to retrieve the machine-readable contract.
All bridge results are JSON. Failures have `error.code`, `error.message`, and
`error.details` and exit nonzero. `invalid_operation` identifies invalid input;
`not_found` identifies a missing target; `revision_conflict` returns the current
revision; `unauthorized` and `session_mismatch` reject unauthorized connections.

Read `bridge document --session ID` first. Address objects by their page and object
IDs, independently of the page the user is viewing. Supply the read revision as
`baseRevision`, a unique `requestId`, your `actorId`, and `origin: "harness"`.
Pass JSON through `--input FILE` or stdin, never interpolate design text into shell
commands. See [update-button.json](examples/update-button.json). Replace its sample
IDs and revision with values from the actual document before using it.

Operations: `add` (shape and optional index), `update` (property patch), `move`
(dx/dy), `delete`, `page.add` (page and optional index), `page.rename`,
`page.delete`, `page.reorder` (all page IDs), and `shape.reorder` (all object IDs
on a page). Patch `null` removes an optional property; required fields cannot be
removed. IDs are unique within a document. Connections must reference existing
objects on the same page. Images use embedded raster data URLs.

Batches are atomic. A retry of the same request ID and payload returns the original
receipt. Reusing an ID for different input fails. Stale batches fail without
changing anything: reread and deliberately reconcile; do not blindly rebase.
Undo uses inverse operations and revision checks, never whole-document restoration.

A live draft is visible to both participants. Only the user's Implement/Update
implementation button creates an immutable implementation target. Draft events
are not permission to implement unsent design changes. Harness object edits appear
live but never submit the draft. Consume ordered events using a cursor before
each bounded implementation step and after tests. Report the submission and run
IDs with progress so completing an older target cannot complete a newer one.
