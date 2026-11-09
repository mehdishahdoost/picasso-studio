import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const cli = resolve('dist-runtime/cli.mjs'), roots: string[] = [], sessions: { repo: string; id: string }[] = []
function run(args: string[], cwd?: string) { return JSON.parse(execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 15000 })) }
function repo() { const root = mkdtempSync(join(tmpdir(), 'studio cli space ')); roots.push(root); execFileSync('git', ['init','-q', root]); return root }
afterEach(() => { for (const s of sessions.splice(0)) { try { run(['session','stop','--repo',s.repo,'--session',s.id]) } catch {} } roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
it('opens, lists, attaches, restarts, targets and stops a production session', () => {
  const root = repo(), opened = run(['session','open','--repo',root,'--harness','claude','--no-open']); sessions.push({ repo: root, id: opened.sessionId })
  expect(opened.browserOpened).toBe(false); expect(opened.browserConnected).toBe(false); expect(opened.browserLaunch.status).toBe('skipped'); expect(opened.url).toContain('#bootstrap=')
  expect(run(['session','list','--repo',root]).sessions[0].connected).toBe(true)
  const writeInput=(value:any)=>{const file=join(root,'ownership.json');writeFileSync(file,JSON.stringify(value));return file}
  const base = ['--repo',root,'--session',opened.sessionId]
  expect(run(['session','status',...base])).toMatchObject({serverReady:true,browserConnected:false,connectedEditors:0})
  expect(run(['session','attach',...base,'--no-open']).sessionId).toBe(opened.sessionId)
  const doc = run(['bridge','document',...base]); const input = join(root, 'operations file.json')
  writeFileSync(input, JSON.stringify({ requestId:'edit', actorId:'agent', origin:'harness', baseRevision:0, operations:[{type:'page.rename',pageId:doc.document.pages[0].id,name:'Changed'}] }))
  expect(run(['bridge','apply',...base,'--input',input]).revision).toBe(1)
  expect(run(['bridge','selection',...base]).ids).toEqual([])
  const ownership=run(['bridge','attach',...base,'--input',writeInput({ownerId:'cli-test'})]);const owner={ownerId:'cli-test',runId:ownership.id};expect(run(['bridge','heartbeat',...base,'--input',writeInput(owner)]).ownerId).toBe('cli-test');expect(run(['bridge','detach',...base,'--input',writeInput(owner)]).leaseExpiry).toBe(0)
  expect(run(['bridge','events',...base,'--after','0']).events[0].type).toBe('document.changed')
  expect(run(['bridge','preview',...base]).available).toBe(true)
  run(['session','stop',...base]); expect(run(['session','list','--repo',root]).sessions[0].connected).toBe(false)
  expect(run(['session','attach',...base,'--no-open']).sessionId).toBe(opened.sessionId)
  expect(run(['bridge','document',...base]).revision).toBe(1)
  expect(() => run(['session','attach','--repo',root])).toThrow()
  expect(() => run(['bridge','document','--repo',repo(),'--session',opened.sessionId])).toThrow()
}, 20000)
it('describes all operations without a repository or session', () => { expect(run(['bridge','describe'], tmpdir()).operations.length).toBe(9); expect(run(['--help']).name).toBe('Picasso Studio') })
