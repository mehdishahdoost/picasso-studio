# Design and implementation loop

The browser and agent share a mutable design draft. Object edits from the agent
appear live; user edits synchronize to the draft but do not become implementation
instructions until the user clicks **Implement** or **Update implementation**.

That button flushes pending inline text and queued operations, then creates an
immutable snapshot. It is blocked during disconnection or unresolved conflicts.
The agent acknowledges the newest pending submission, implements that snapshot,
and reports status with its submission ID and run ID. Changes made after that
snapshot remain a draft, regardless of who authored them.

An active skill checks events before each bounded implementation step and after
checks. A new submission arriving during a tool call is picked up at the next
checkpoint. This does not interrupt a running tool. If several submissions arrive
between checkpoints, the newest becomes the target; skipped submissions are
marked superseded. Completing an older target never completes a newer one.

Use a unique owner ID to attach. Only one implementation owner holds a live lease.
Heartbeats renew it for 30 minutes; renew before/after long checks and reacquire
an expired lease before updating progress. On explicit detachment, release the
lease. An ended harness cannot be revived by Studio: invoke the skill again and
attach to the existing session. Submission IDs and event cursors survive restart.

Never reset unrelated code when adjusting to a new design. Compare the new target
to the previous submission and reconcile implementation work within the bound
repository. The bridge does not edit repository files or execute commands; the
current agent uses its normal coding tools.
