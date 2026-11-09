# Local sessions

Picasso Studio requires Node 22+ and a local Git repository. The installed runtime
serves production assets; Vite and a Picasso account are not required.

```sh
picasso-studio session open --repo /path/to/repo --harness codex
picasso-studio session list --repo /path/to/repo
picasso-studio session attach --repo /path/to/repo --session SESSION_ID
picasso-studio session stop --repo /path/to/repo --session SESSION_ID
```

Use the persistent launcher printed by installation if the executable is not on
PATH: `node "/printed/runtime/dist-runtime/cli.mjs" ...`.
The server starts in the background and chooses an available loopback port.
`--no-open` prints a link without launching a browser; otherwise browser launch
failure leaves a working URL for manual opening. Attach chooses an explicit
session and restarts its server if necessary. List never silently switches designs.

Sessions live under `.picasso-studio/sessions/SESSION_ID/` in the bound repository.
Atomic state includes documents, event cursors, submissions and acknowledgements;
partial temporary files are not used for recovery. Logs are in `server.log`.
Credential files have restrictive permissions. Browser links use one-time secrets;
attach generates a new link. Do not share credentials or commit session data.
The bridge checks repository identity, credentials, Host and Origin. It serves
loopback only and exposes no arbitrary filesystem or shell execution endpoint.

The UI distinguishes connection loss from completion. Reattach the skill if the
agent ended. An active agent checks for updates before implementation steps and
after tests, rather than interrupting an executing tool. During disconnection,
unsent browser edits remain drafts and must synchronize or reconcile before
submission. The server can still accept agent edits with no browser open.

## Browser launch and sandbox diagnostics

Every launch returns a browser URL, `browserLaunch`, and `browserConnected`.
`browserOpened` is true only when an editor has connected to the server; an
accepted desktop-open request or a launcher timeout is not proof that the UI opened.
Always show the returned URL to the user. If automatic launch fails, open it
manually or with the harness browser tool. `session status --repo PATH --session ID`
reports server, editor, and agent connections separately. Do not wait indefinitely
for a design submission when no editor is connected.

A `permission_required` error means the harness sandbox blocked loopback networking
or child processes. Use the harness's normal approval mechanism to retry the
command with the necessary permission; do not repeatedly restart a working server.
A denied startup includes an existing-session attach retry command.

After upgrading the installed runtime, `session attach` upgrades a pre-status
server automatically while preserving its session document, submissions, and
implementation state. It returns a fresh browser link after restarting.

## Shared lifecycle service

The CLI and harness-managed MCP integration use the same side-effect-free session
service. MCP initialization does not open a browser. `open_studio` starts the web
server on demand, reuses the only existing repository session, or asks for a
session ID when several exist. Explicit reattachment preserves the saved design.
Global registrations require the repository from the current skill invocation;
local registrations restrict every tool to their configured repository.

Session opens are serialized across processes, including stale-process recovery.
Results include the runtime version and installation scope alongside server,
browser, and agent status. Cancelled requests release their waiting connection;
they do not acknowledge submissions or reset state. The web session remains
independent of the MCP process and can survive a harness reload.
