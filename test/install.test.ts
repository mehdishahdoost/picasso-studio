import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { harnesses, install } from '../runtime/install'
import {readEntry} from '../runtime/config'
const dirs: string[]=[]
afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})))
function fixture() { const root=mkdtempSync(join(tmpdir(),'studio-install-'));dirs.push(root);const cwd=join(root,'repo'),home=join(root,'home');mkdirSync(cwd);mkdirSync(home);execFileSync('git',['init','-q',cwd]);return {root,cwd,home,packageRoot:resolve('.'),environment:{}} }
it('installs all harnesses in both scopes and repeats without overwriting unrelated files',()=>{
  const f=fixture(); for(const harness of Object.keys(harnesses)) for(const local of [true,false]) {
    const result=install({...f,harness,local,global:!local});expect(result.invocation).toBe(harness==='codex'?'$picasso-studio':'/picasso-studio');expect(existsSync(result.runtime)).toBe(true);expect(existsSync(result.mcpRuntime)).toBe(true);expect(existsSync(result.mcpConfig)).toBe(true);const registration=readEntry(readFileSync(result.mcpConfig,'utf8'),{path:result.mcpConfig,format:result.mcpConfig.endsWith('.toml')?'toml':'json',key:result.mcpKey});expect(registration.args.includes('--repo')).toBe(local);expect(registration.args.includes(f.cwd)).toBe(local)
    const skill=readFileSync(result.skill,'utf8');expect(skill).not.toContain('{{');expect(skill).toMatch(/before EACH/i);expect(skill).toContain('"type":"update"');expect(skill).toContain('immutable submission');expect(result.skill).toContain(local?join(f.cwd,harnesses[harness as keyof typeof harnesses].directory):harness==='devin'?join(f.home,'.config','devin'):f.home)
    const unrelated=join(result.skill,'..','unrelated.txt');writeFileSync(unrelated,'keep');expect(install({...f,harness,local,global:!local}).unchanged).toBe(true);expect(readFileSync(unrelated,'utf8')).toBe('keep')
  }
})
it('validates args and scope before writes and rejects unmanaged/edited skills',()=>{
  const f=fixture();for(const input of [{harness:'other',local:true,global:false},{harness:'codex',local:false,global:false},{harness:'codex',local:true,global:true}])expect(()=>install({...f,...input})).toThrow()
  expect(existsSync(join(f.cwd,'.picasso-studio'))).toBe(false);expect(()=>install({...f,cwd:f.home,harness:'codex',local:true,global:false})).toThrow(/Git repository/)
  const skill=join(f.cwd,'.agents','skills','picasso-studio');mkdirSync(skill,{recursive:true});writeFileSync(join(skill,'SKILL.md'),'mine');expect(()=>install({...f,harness:'codex',local:true,global:false})).toThrow(/Unmanaged/);expect(readFileSync(join(skill,'SKILL.md'),'utf8')).toBe('mine')
})
it('keeps a persistent runtime usable after source/cache removal and protects failed updates',()=>{
  const f=fixture(),packageRoot=join(f.root,'temporary cache');mkdirSync(packageRoot);for(const name of ['dist','dist-runtime','package.json'])cpSync(join(f.packageRoot,name),join(packageRoot,name),{recursive:true})
  const input={...f,packageRoot,harness:'codex',local:true,global:false};const first=install(input);rmSync(packageRoot,{recursive:true});expect(JSON.parse(execFileSync(process.execPath,[first.runtime,'bridge','describe'],{encoding:'utf8'})).protocolVersion).toBe(1)
  const broken=join(f.root,'broken');mkdirSync(broken);writeFileSync(join(broken,'package.json'),JSON.stringify({version:'0.2.0'}));expect(()=>install({...input,packageRoot:broken})).toThrow(/missing/);expect(readFileSync(first.skill,'utf8')).toContain(first.runtime)
  writeFileSync(first.skill,'custom edit');expect(()=>install({...input,packageRoot:f.packageRoot})).toThrow(/user edits/)
})
