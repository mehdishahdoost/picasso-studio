import { readFileSync, existsSync, mkdirSync, readdirSync, openSync, closeSync, realpathSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { repositoryRoot } from './store'
import { runtimeRoot } from './server'
import { fail, StudioError } from '../src/studio/protocol'
import { openBrowser } from './browser'
import { runtimeError, isPermissionError } from './errors'
import { withLock } from './locks'
export const runtimeVersion: string = JSON.parse(readFileSync(join(runtimeRoot, 'package.json'), 'utf8')).version
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export async function browserResult(repo: string, id: string, noOpen: boolean) {
  const browser = await call(repo, id, 'browser', {})
  const browserLaunch = noOpen ? { status: 'skipped', message: 'Automatic browser launch was disabled.' } : await openBrowser(browser.url)
  let status = await call(repo, id, 'status')
  if (!noOpen && ['requested','unconfirmed'].includes(browserLaunch.status)) {
    const deadline = Date.now() + 2000
    while (!status.browserConnected && Date.now() < deadline) { await sleep(100); status = await call(repo, id, 'status') }
  }
  return { ...connection(repo, id).descriptor, url: browser.url, browserLaunch, serverReady: true, runtimeVersion, browserConnected: status.browserConnected, browserOpened: status.browserConnected, connectedEditors: status.connectedEditors, message: status.browserConnected ? 'The browser editor is connected. Open the URL to view it.' : 'Server ready; the browser editor is not connected. Open the URL before waiting for a design submission.' }
}
export function safeId(id: string) { if (!/^[a-zA-Z0-9-]+$/.test(id)) fail('invalid_operation', 'Invalid session ID'); return id }
export function sessionDirectory(repo: string, id: string) { return join(repo, '.picasso-studio', 'sessions', safeId(id)) }
export function connection(repo: string, id: string) {
  const directory = sessionDirectory(repo, id)
  if (!existsSync(join(directory, 'connection.json'))) fail('not_found', 'Session not found; use session list/open')
  const descriptor = JSON.parse(readFileSync(join(directory, 'connection.json'), 'utf8'))
  if (descriptor.repository !== repo || descriptor.sessionId !== id || descriptor.protocolVersion !== 1) fail('session_mismatch', 'Invalid session binding')
  const endpoint = new URL(descriptor.origin)
  if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'http:') fail('unauthorized', 'Session endpoint must be loopback HTTP')
  const { token } = JSON.parse(readFileSync(join(directory, 'credentials.json'), 'utf8'))
  return { descriptor, token, directory }
}
export async function call(repo: string, id: string, action: string, input?: unknown, query = '', signal?: AbortSignal) {
  const { descriptor, token } = connection(repo, id)
  let response: Response
  try { response = await fetch(`${descriptor.origin}/api/${action}${query}`, { method: input === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'x-picasso-repository': repo, 'content-type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000) }) }
  catch (error) { if (signal?.aborted) throw new StudioError('cancelled', 'Request cancelled'); if (isPermissionError(error)) throw runtimeError(error); return fail('disconnected', 'Local Studio server is unavailable; use session attach to restart it') }
  const result = await response.json() as any
  if (!response.ok) throw new StudioError(result.error?.code ?? 'server_error', result.error?.message ?? 'Bridge request failed', result.error?.details ?? {})
  return result
}
async function launch(repo: string, id: string, noOpen: boolean, harness: string) {
  const directory = sessionDirectory(repo, id)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return withLock(join(directory, 'server.lock'), async () => {
    const log = openSync(join(directory, 'server.log'), 'a', 0o600)
    const child = spawn(process.execPath, [join(runtimeRoot, 'dist-runtime', 'cli.mjs'), 'serve', '--repo', repo, '--session', id], { detached: true, stdio: ['ignore', log, log] })
    closeSync(log); child.unref()
    let spawnedError: Error | undefined
    child.on('error', error => { spawnedError = error })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnedError) throw spawnedError
      if (existsSync(join(directory, 'connection.json'))) {
        try { await call(repo, id, 'document'); ready = true; break } catch {}
      }
      if (child.exitCode !== null) {
        const logPath = join(directory, 'server.log')
        const lastLine = readFileSync(logPath, 'utf8').trim().split('\n').at(-1) ?? ''
        let reported: any
        try { reported = JSON.parse(lastLine).error } catch {}
        if (reported?.code === 'permission_required' || isPermissionError(reported)) throw new StudioError('permission_required', 'The harness sandbox blocked the local Studio server. Retry session attach with loopback networking and child-process permission.', { sessionId: id, logPath, retryCommand: ['session','attach','--repo',repo,'--session',id] })
        fail('disconnected', `Studio failed to start; inspect ${logPath}`, { sessionId: id, logPath })
      }
      await sleep(50)
    }
    if (!ready) fail('disconnected', `Studio did not become ready; inspect ${join(directory, 'server.log')}`)
    return { ...await browserResult(repo, id, noOpen), harness }
  })
}

export async function listSessions(repo: string) {
  const root = join(repo, '.picasso-studio', 'sessions')
  return { sessions: existsSync(root) ? await Promise.all(readdirSync(root).filter(id => /^[a-zA-Z0-9-]+$/.test(id) && existsSync(join(root,id,'state.json'))).map(async id => {
    try { const current = await call(repo, id, 'document'); return { sessionId: id, connected: true, revision: current.revision } }
    catch (error) { if (error instanceof StudioError && error.code === 'permission_required') throw error; return { sessionId: id, connected: false } }
  })) : [] }
}
export async function sessionStatus(repo: string, id: string, scope = 'diagnostic') {
  try { return { ...await call(repo,id,'status'), runtimeVersion, installationScope: scope } }
  catch (error) { if (error instanceof StudioError && error.code === 'not_found') fail('upgrade_required', 'Attach to this session to upgrade its server without losing the design'); throw error }
}
export async function attachSession(repo: string, id: string, noOpen = false, harness = 'codex') {
  if (!existsSync(join(sessionDirectory(repo,id),'state.json'))) fail('not_found', 'Session not found')
  try {
    await call(repo,id,'document')
    try {
      const status=await call(repo,id,'status')
      if(status.serverVersion!==runtimeVersion){
        if(status.serverVersion){
          const serverParts=String(status.serverVersion).split('.').map(Number),clientParts=runtimeVersion.split('.').map(Number)
          if(serverParts.some(value=>!Number.isFinite(value)))fail('upgrade_required','Cannot determine the running server version; inspect it before upgrading')
          const newer=serverParts.findIndex((value,index)=>value!==clientParts[index])
          if(newer>=0&&serverParts[newer]>clientParts[newer])fail('upgrade_required','This session uses a newer runtime; update the MCP installation before reconnecting')
        }
        throw new StudioError('not_found','An older server needs the current session runtime')
      }
    } catch (error) {
      if (!(error instanceof StudioError) || error.code !== 'not_found') throw error
      await call(repo,id,'stop',{})
      let stopped = false
      for (let attempt=0;attempt<50;attempt++) {
        try { await call(repo,id,'document') } catch (error) { if (error instanceof StudioError && error.code === 'disconnected') { stopped=true;break }; throw error }
        await sleep(50)
      }
      if (!stopped) fail('disconnected','The older server did not stop; retry opening this session')
      return { ...await launch(repo,id,noOpen,harness), serverUpgraded:true }
    }
    return browserResult(repo,id,noOpen)
  } catch (error) { if (!(error instanceof StudioError) || error.code !== 'disconnected') throw error }
  return launch(repo,id,noOpen,harness)
}
const repositoryBindings = new Map<string,string>()
function canonicalRepository(path:string) { const canonical=realpathSync(path);let root=repositoryBindings.get(canonical);if(!root){root=repositoryRoot(canonical);repositoryBindings.set(canonical,root)}return root }
export function bindRepository(path: string, restrictedRepo?: string) {
  if (!isAbsolute(path)) fail('session_mismatch','Repository path must be absolute')
  const repo=canonicalRepository(path)
  if (restrictedRepo && repo!==canonicalRepository(restrictedRepo)) fail('session_mismatch','This MCP installation is restricted to another repository')
  return repo
}
export async function openStudio(input: { repository:string;sessionId?:string;noOpen?:boolean;harness?:string;scope?:string;restrictedRepo?:string;reuse?:boolean }, signal?:AbortSignal) {
  const repo=bindRepository(input.repository,input.restrictedRepo)
  const directory=join(repo,'.picasso-studio');mkdirSync(directory,{recursive:true,mode:0o700})
  return withLock(join(directory,'open.lock'),async()=>{
    signal?.throwIfAborted()
    const sessions=await listSessions(repo)
    let id=input.sessionId
    if (!id && input.reuse!==false) {
      if (sessions.sessions.length>1) fail('session_selection_required','Select a session explicitly',{sessions:sessions.sessions})
      id=sessions.sessions[0]?.sessionId
    }
    const result=id ? await attachSession(repo,safeId(id),!!input.noOpen,input.harness) : await launch(repo,randomUUID(),!!input.noOpen,input.harness??'codex')
    return {...result,installationScope:input.scope??'diagnostic',runtimeVersion}
  },signal)
}
