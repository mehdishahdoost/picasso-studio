import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, readdirSync, lstatSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fail } from '../src/studio/protocol'
import { repositoryRoot } from './store'
import { configTarget, fingerprint, readEntry, readText } from './config'
import { recoverRegistration, registerIntegration } from './registration'
import { tryLock } from './locks'
export const harnesses = {
  codex: { directory: '.agents', command: '$picasso-studio', source: 'https://developers.openai.com/codex/skills', observedVersion: '0.167.0', verifiedVersion: null },
  claude: { directory: '.claude', command: '/picasso-studio', source: 'https://code.claude.com/docs/en/skills', observedVersion: '2.1.319', verifiedVersion: null },
  devin: { directory: '.devin', command: '/picasso-studio', source: 'https://docs.devin.ai/cli/extensibility/skills/creating-skills', observedVersion: '3000.12.32', verifiedVersion: null }
}
function digest(path: string): string { const hash = createHash('sha256'); function walk(dir: string, prefix = '') { for (const entry of readdirSync(dir).sort()) { const full = join(dir, entry); if (lstatSync(full).isSymbolicLink()) fail('invalid_operation', 'Runtime payload cannot contain symlinks'); hash.update(prefix + entry); if (lstatSync(full).isDirectory()) walk(full, prefix + entry + '/'); else hash.update(readFileSync(full)) } } walk(path); return hash.digest('hex') }
export function install(input: { harness: string; local: boolean; global: boolean; cwd: string; home: string; packageRoot: string; checkpoint?: (phase:string)=>void; environment?:NodeJS.ProcessEnv }) {
  if (!Object.hasOwn(harnesses, input.harness)) fail('invalid_operation', 'Choose --harness codex, claude, or devin')
  if (input.local === input.global) fail('invalid_operation', 'Pass exactly one of --local or --global')
  const environment=input.environment??process.env
  const harness = harnesses[input.harness as keyof typeof harnesses]
  const root = input.local ? repositoryRoot(input.cwd) : resolve(input.home)
  const metadata = JSON.parse(readFileSync(join(input.packageRoot, 'package.json'), 'utf8'))
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$/.test(metadata.version)) fail('invalid_operation', 'Invalid package version')
  if (!existsSync(join(input.packageRoot, 'dist', 'index.html')) || (!existsSync(join(input.packageRoot, 'dist-runtime', 'cli.mjs')) || !existsSync(join(input.packageRoot, 'dist-runtime', 'mcp.mjs')))) fail('not_found', 'Production runtime is missing; build the package first')
  const homeOverride = !input.local && input.harness === 'claude' ? environment.CLAUDE_CONFIG_DIR : undefined
  const devinHome = process.platform === 'win32' ? join(environment.APPDATA ?? join(root, 'AppData', 'Roaming'), 'devin') : join(environment.XDG_CONFIG_HOME ?? join(root, '.config'), 'devin')
  const skillDir = homeOverride ? join(resolve(homeOverride), 'skills', 'picasso-studio') : !input.local && input.harness === 'devin' ? join(devinHome, 'skills', 'picasso-studio') : join(root, harness.directory, 'skills', 'picasso-studio')
  const skillFile = join(skillDir, 'SKILL.md'), manifestFile = join(skillDir, 'picasso-managed.json')
  const target = configTarget(input.harness,input.local,root,input.home,environment)
  // Preflight parsing precedes any generated files. Acquire both locks before recovery/staging.
  readEntry(readText(target.path),target)
  mkdirSync(dirname(target.path),{recursive:true});mkdirSync(join(root,'.picasso-studio'),{recursive:true})
  const releases:(()=>void)[]=[]
  try {
    for(const path of [join(root,'.picasso-studio','install.lock'),`${target.path}.picasso-studio.lock`].sort()){
      const release=tryLock(path);if(!release)fail('owner_conflict','Another installation is using this configuration; retry after it finishes');releases.push(release!)
    }
    recoverRegistration(skillDir,target)
    let previous:any
    if(existsSync(manifestFile)){
      previous=JSON.parse(readFileSync(manifestFile,'utf8'))
      if(previous.managedBy!=='picasso-studio'||previous.harness!==input.harness)fail('owner_conflict','Skill is not managed by this installer')
      if(existsSync(skillFile)&&createHash('sha256').update(readFileSync(skillFile)).digest('hex')!==previous.skillChecksum)fail('owner_conflict','Managed skill has user edits; preserve them before reinstalling')
    }else if(existsSync(skillDir)&&readdirSync(skillDir).length)fail('owner_conflict',`Unmanaged skill exists at ${skillDir}; move it before installing`)
    const originalConfig=readText(target.path),existing=readEntry(originalConfig,target)
    if(previous?.mcp&&previous.mcp.path!==target.path)fail('owner_conflict','Managed MCP configuration location changed; resolve the previous registration first')
    if(existing!==null&&(!previous?.mcp||fingerprint(existing)!==previous.mcp.fingerprint))fail('owner_conflict','The Picasso MCP entry is unmanaged or has user edits; preserve it before reinstalling')
  const runtimeBase = join(root, '.picasso-studio', 'runtime'), payload = join(runtimeBase, metadata.version)
  const stage = `${payload}.stage-${randomUUID()}`
  mkdirSync(runtimeBase, { recursive: true }); const ignoreFile = join(root, '.picasso-studio', '.gitignore'); if (!existsSync(ignoreFile)) writeFileSync(ignoreFile, 'runtime/\nsessions/\n')
  mkdirSync(stage)
  try {
    for (const path of ['dist','dist-runtime','package.json']) cpSync(join(input.packageRoot, path), join(stage, path), { recursive: true, dereference: false })
    const checksum = digest(stage)
    if (existsSync(payload)) { if (digest(payload) !== checksum) fail('owner_conflict', 'Installed version differs from this payload; use a new package version'); rmSync(stage, { recursive: true }) }
    else renameSync(stage, payload)
    const launcher = join(payload, 'dist-runtime', 'cli.mjs')
    const template = readFileSync(join(payload, 'dist-runtime', 'SKILL.md'), 'utf8')
    const skill = template.replaceAll('{{LAUNCHER}}', "'" + launcher.replaceAll("'", "'\\''") + "'").replaceAll('{{HARNESS}}', input.harness).replaceAll('{{INVOCATION}}', harness.command)
    const skillChecksum = createHash('sha256').update(skill).digest('hex')
    const mcpLauncher=join(payload,'dist-runtime','mcp.mjs'),scope=input.local?'local':'global'
    const entry={command:process.execPath,args:[mcpLauncher,'--scope',scope,'--harness',input.harness,...(input.local?['--repo',root]:[])]}
    const mcp={...target,fingerprint:fingerprint(entry),entry}
    const result={installed:true,harness:input.harness,scope,skill:skillFile,runtime:launcher,mcpRuntime:mcpLauncher,mcpConfig:target.path,mcpKey:target.key,invocation:harness.command,message:`Invoke ${harness.command}. Reload the harness and approve its MCP registration if required; workspace trust and approval policies are unchanged.`}
    if(previous?.version===metadata.version&&previous?.checksum===checksum&&previous?.skillChecksum===skillChecksum&&fingerprint(existing)===mcp.fingerprint)return {...result,unchanged:true}
    const manifest={managedBy:'picasso-studio',version:metadata.version,harness:input.harness,scope,checksum,skillChecksum,launcher,mcp,previous:previous??null}
    registerIntegration({skillDir,target,originalConfig,entry,skill,manifest,checkpoint:input.checkpoint})
    return result
  } finally { if (existsSync(stage)) rmSync(stage, { recursive: true, force: true }) }
  } finally { for(const release of releases.reverse())release() }
}
