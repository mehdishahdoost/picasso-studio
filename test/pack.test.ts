import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {mcpClient} from './mcp-fixture'
it('installs the packed CLI globally into isolated user homes for all adapters',async()=>{
  const root=mkdtempSync(join(tmpdir(),'studio-pack-'))
  try {
    const pack=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--pack-destination',root,'--cache',join(root,'cache'),'--json'],{encoding:'utf8'}))[0]
    const extracted=join(root,'extracted');mkdirSync(extracted);execFileSync('tar',['-xzf',join(root,pack.filename),'-C',extracted])
    const cli=join(extracted,'package','dist-runtime','cli.mjs'),bootstrap=join(root,'isolate-home.mjs')
    // Override only the test process's OS home lookup; never write real user skills.
    writeFileSync(bootstrap,"import os from 'node:os'; import {syncBuiltinESMExports} from 'node:module'; os.homedir=()=>process.env.PICASSO_TEST_HOME; syncBuiltinESMExports();")
    for(const harness of ['codex','claude','devin']) {
      const home=join(root,harness);mkdirSync(home)
      const env={...process.env,PICASSO_TEST_HOME:home};delete env.CLAUDE_CONFIG_DIR;delete env.XDG_CONFIG_HOME;delete env.CODEX_HOME
      const installed=JSON.parse(execFileSync(process.execPath,['--import',bootstrap,cli,'--harness',harness,'--global'],{env,encoding:'utf8'}))
      expect(installed.scope).toBe('global');expect(installed.skill.startsWith(home)).toBe(true);expect(readFileSync(installed.skill,'utf8')).toContain('picasso-studio')
      expect(JSON.parse(execFileSync(process.execPath,[installed.runtime,'bridge','describe'],{encoding:'utf8'})).protocolVersion).toBe(1);const mcp=await mcpClient({executable:installed.mcpRuntime});expect((await mcp.client.listTools()).tools).toHaveLength(14);await mcp.close()
    }
  } finally {rmSync(root,{recursive:true,force:true})}
},15000)
