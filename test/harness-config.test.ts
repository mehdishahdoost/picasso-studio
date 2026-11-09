import {afterEach,expect,it} from 'vitest'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {install} from '../runtime/install'
import {readEntry,readText} from '../runtime/config'
const roots:string[]=[]
afterEach(()=>roots.splice(0).forEach(root=>rmSync(root,{recursive:true,force:true})))
it('validates generated entries using native Codex, Claude and Devin configuration commands without starting model sessions',()=>{
 const root=mkdtempSync(join(tmpdir(),'studio-harness-config-'));roots.push(root);const cwd=join(root,'repo'),home=join(root,'home');mkdirSync(cwd);mkdirSync(home);execFileSync('git',['init','-q',cwd])
 for(const harness of ['codex','claude','devin']){
  const result=install({harness,local:true,global:false,cwd,home,packageRoot:resolve('.'),environment:{}})
  let output:string
  if(harness==='codex'){
   const entry=readEntry(readText(result.mcpConfig),{path:result.mcpConfig,format:'toml',key:result.mcpKey})
   // Project config requires user trust. Validate the generated entry through an explicit,
   // read-only config override rather than granting that trust in a test.
   const inline=`{command=${JSON.stringify(entry.command)},args=[${entry.args.map((arg:string)=>JSON.stringify(arg)).join(',')}]}`
   output=execFileSync('codex',['--cd',cwd,'--config',`mcp_servers.picasso-studio=${inline}`,'mcp','get','picasso-studio','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000})
  }else output=execFileSync(harness,['mcp','get','picasso-studio'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000})
  expect(output).toContain(result.mcpRuntime)
 }
},20000)
