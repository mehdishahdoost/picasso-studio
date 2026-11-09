# Harness adapters

Registration locations were checked against official documentation on 2026-11-09:

| Harness | Local | Global (Linux/macOS) | Invocation | Installed CLI observed |
| --- | --- | --- | --- | --- |
| [Codex](https://developers.openai.com/codex/skills) | `.agents/skills/` | `~/.agents/skills/` | `$picasso-studio` | 0.167.0 |
| [Claude Code](https://code.claude.com/docs/en/skills) | `.claude/skills/` | `~/.claude/skills/` | `/picasso-studio` | 2.1.319 |
| [Devin CLI](https://docs.devin.ai/cli/extensibility/skills/creating-skills) | `.devin/skills/` | `~/.config/devin/skills/` | `/picasso-studio` | 3000.12.32 |

Devin's global path uses `XDG_CONFIG_HOME` when set and `%APPDATA%/devin/skills/`
on Windows. Claude's global configuration directory honors `CLAUDE_CONFIG_DIR`.
Codex uses the Agent Skills user directory, not a hard-coded Codex cache path.

Reload the harness if it has not discovered a newly installed skill. A local
skill with the same name normally shadows the global skill; confirm the loaded
path/version in the harness when both exist. The installer prints its selected
scope, persistent launcher, and invocation command. These integrations target the
local CLI harnesses, not hosted coding agents.

Observed executable versions are not a claim that the complete interactive loop
has been verified. Automated protocol/template/installer tests run without an LLM.
Record actual interactive discovery and implementation results separately before
advertising a supported version. Native hooks, MCP, forced mid-turn interruption,
and automatic revival of ended sessions are not part of this adapter contract.

## MCP registration

The installer now registers the skill and a persistent stdio executable together.
Picasso --local means repository scope, mapping to each harness's project config:
Codex `.codex/config.toml`, Claude Code `.mcp.json`, and Devin
`.devin/mcp_config.json`. Global defaults are `~/.codex/config.toml`,
`~/.claude.json`, and `~/.config/devin/mcp_config.json` respectively.
The stable entry is `picasso-studio`; Codex uses `mcp_servers`, others use
`mcpServers`. Paths in installer output are authoritative when configuration-home
or platform overrides apply. Globals contain no install-time repository argument.

Existing 0.1.x skill-only installations can upgrade; session files are retained.
Unmanaged names and user-edited entries produce conflicts. Installation stages
both registrations and rolls back owned changes if a write fails, preserving
unrelated config and comments. Restart/reload the harness to rediscover the MCP
entry and use its ordinary trust/approval prompt where required. The installer
does not grant trust or weaken tool approvals.

A successful parser/config-discovery check is distinct from running the skill's
full implementation loop in that harness. Keep the recorded verification level
explicit; a working SDK client is not proof that a host schedules model turns
from notifications or keeps a skill turn running indefinitely.
