import { copyFileSync, chmodSync } from 'node:fs'
copyFileSync('runtime/SKILL.md', 'dist-runtime/SKILL.md')
chmodSync('dist-runtime/cli.mjs', 0o755)

chmodSync('dist-runtime/mcp.mjs', 0o755)
