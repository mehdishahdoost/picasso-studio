#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, readdirSync, openSync, closeSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { repositoryRoot, atomicJson } from './store'
import { startServer, runtimeRoot } from './server'
import { contract, fail, StudioError } from '../src/studio/protocol'
import { install, harnesses } from './install'
import { call, listSessions, sessionStatus, openStudio, safeId, sessionDirectory } from './sessions'
import { runtimeError, isPermissionError } from './errors'

export function parseArgs(args: string[]) {
  const options: Record<string, string | boolean> = {}, positional: string[] = []
  const flags = new Set(['local','global','json','no-open','help'])
  const valued = new Set(['harness','repo','session','input','after','wait','page','revision','format','owner','directory','id'])
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positional.push(args[i]); continue }
    const key = args[i].slice(2)
    if (Object.hasOwn(options, key)) fail('invalid_operation', `Duplicate --${key}`)
    if (flags.has(key)) options[key] = true
    else if (valued.has(key)) { if (!args[i + 1] || args[i + 1].startsWith('--')) fail('invalid_operation', `Missing value for --${key}`); options[key] = args[++i] }
    else fail('invalid_operation', `Unknown option --${key}`)
  }
  return { options, positional }
}
async function inputFile(path?: string | boolean) {
  const text = typeof path === 'string' && path !== '-' ? readFileSync(resolve(path), 'utf8') : await new Promise<string>((resolve, reject) => { let text = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', data => { text += data; if (text.length > 16 * 1024 * 1024) reject(new StudioError('invalid_operation', 'Input too large')) }); process.stdin.on('end', () => resolve(text)); process.stdin.on('error', reject) })
  try { return JSON.parse(text) } catch { return fail('invalid_operation', 'Input must be valid JSON') }
}
export async function main(args = process.argv.slice(2)) {
  const { options: o, positional } = parseArgs(args)
  if (o.help || (!positional.length && !o.harness)) return { name: 'Picasso Studio', usage: ['npx picasso-studio --harness codex|claude|devin --local|--global', 'picasso-studio session open --repo PATH --harness NAME', 'picasso-studio session list|attach|status|stop --repo PATH [--session ID]', 'picasso-studio bridge describe', 'picasso-studio bridge document|selection|submissions|events|preview --repo PATH --session ID', 'picasso-studio bridge apply|attach|heartbeat|detach|acknowledge|progress --repo PATH --session ID --input FILE'], harnesses, note: 'Reload the harness if the new skill is not yet discovered. Local and global installations follow harness precedence.' }
  if (!positional.length) return install({ harness: String(o.harness), local: !!o.local, global: !!o.global, cwd: process.cwd(), home: homedir(), packageRoot: runtimeRoot })
  const [group, action] = positional
  if (group === 'bridge' && action === 'describe') return contract
  const repo = repositoryRoot(String(o.repo ?? process.cwd()))
  if (group === 'serve') {
    const server = await startServer({ directory: sessionDirectory(repo, String(o.session)), id: safeId(String(o.session)), repository: repo })
    process.on('SIGTERM', () => { void server.close().then(() => process.exit(0)) })
    process.on('SIGINT', () => { void server.close().then(() => process.exit(0)) })
    return undefined
  }
  if (group === 'session') {
    if (action === 'list') return listSessions(repo)
    const id = o.session ? safeId(String(o.session)) : undefined
    if (action === 'stop') return call(repo, id ?? fail('invalid_operation', '--session ID is required'), 'stop', {})
    if (action === 'status') return sessionStatus(repo, id ?? fail('invalid_operation', '--session ID is required'))
    if (action === 'attach') { if (!id) fail('invalid_operation', '--session ID is required; use session list'); return openStudio({ repository:repo,sessionId:id,noOpen:!!o['no-open'],harness:String(o.harness??'codex') }) }
    if (action !== 'open') fail('invalid_operation', 'Unknown session operation')
    if (id && existsSync(join(sessionDirectory(repo,id),'state.json'))) fail('owner_conflict','Session already exists; use session attach')
    const harness=String(o.harness??'codex');if(!Object.hasOwn(harnesses,harness))fail('invalid_operation','Unknown harness')
    return openStudio({repository:repo,noOpen:!!o['no-open'],harness,reuse:false})
  }
  if (group === 'bridge') {
    const id = o.session ? safeId(String(o.session)) : fail('invalid_operation', '--session ID is required')
    if (['document','selection','submissions','events','preview'].includes(action)) {
      const query = new URLSearchParams()
      for (const key of ['after','wait','page','revision','format']) if (o[key] !== undefined) query.set(key, String(o[key]))
      return call(repo, id, action, undefined, `?${query}`)
    }
    if (!['apply','attach','heartbeat','detach','acknowledge','progress'].includes(action)) fail('invalid_operation', 'Unknown bridge operation')
    return call(repo, id, action, await inputFile(o.input))
  }
  return fail('invalid_operation', 'Unknown command; use --help')
}
main().then(result => { if (result !== undefined) process.stdout.write(JSON.stringify(result) + '\n') }).catch(cause => { const error = runtimeError(cause); process.stderr.write(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details } }) + '\n'); process.exitCode = 1 })
