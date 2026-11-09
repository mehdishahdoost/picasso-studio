import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LEASE_MS, SessionStore } from '../runtime/store'
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
function fixture(id = 'session', repo = '/repo') { const dir = mkdtempSync(join(tmpdir(), 'studio-store-')); dirs.push(dir); return new SessionStore(dir, id, repo) }
it('persists before returning, recovers state and ignores interrupted temp writes', () => {
  const s = fixture(); const sub = s.submit({ requestId: 'A', baseRevision: 0 }); const run = s.attach('agent'); s.acknowledge({ ownerId: run.ownerId, runId: run.id });
  writeFileSync(join(s.directory, 'state.json.interrupted.tmp'), '{')
  const restored = new SessionStore(s.directory, 'session', '/repo')
  expect(restored.state.submissions[0]).toMatchObject({ id: sub.id, status: 'in-progress' }); expect(JSON.parse(readFileSync(s.file, 'utf8'))).toEqual(s.state)
  expect(() => new SessionStore(s.directory, 'session', '/other')).toThrow(/another repository/)
  expect(fixture('other', '/other').state.submissions).toEqual([])
})
it('keeps submissions immutable, deduplicates, and protects revisions', () => { const s = fixture(), pageId = s.state.document.pages[0].id; s.submit({ requestId: 'A', baseRevision: 0 }); s.apply({ requestId: 'edit', actorId: 'agent', origin: 'harness', baseRevision: 0, operations: [{ type: 'page.rename', pageId, name: 'Changed' }] }); expect(s.state.submissions[0].document.pages[0].name).toBe('Home'); expect(s.submit({ requestId: 'A', baseRevision: 0 }).id).toBe('A'); expect(() => s.submit({ requestId: 'B', baseRevision: 0 })).toThrow(/Synchronize/) })
it('supports ownership expiry, supersession, replay and old completion races', () => {
  const s = fixture(), run = s.attach('agent'); const owner = { ownerId: 'agent', runId: run.id }
  expect(() => s.attach('other')).toThrow(/active/)
  s.submit({ requestId: 'A', baseRevision: 0 }); s.acknowledge(owner); s.submit({ requestId: 'B', baseRevision: 0 })
  s.progress({ ...owner, submissionId: 'A', status: 'complete', message: 'Finished A' }); expect(s.state.submissions[1].status).toBe('pending')
  s.submit({ requestId: 'C', baseRevision: 0 }); expect(s.acknowledge(owner).submission!.id).toBe('C'); expect(s.state.submissions[1].status).toBe('superseded')
  expect(s.acknowledge({ ...owner, submissionId: 'C' }).submission!.id).toBe('C')
  const replacement = s.attach('other', Date.now() + LEASE_MS + 1); expect(replacement.targetSubmissionId).toBe('C'); expect(() => s.heartbeat(owner)).toThrow(/reacquire/)
})
it('replays ordered events with a stable cursor', () => { const s = fixture(); s.submit({ requestId: 'A', baseRevision: 0 }); const first = s.events(0); expect(first.events[0].type).toBe('implementation.submitted'); expect(s.events(first.cursor)).toEqual({ events: [], cursor: first.cursor }); expect(() => s.events(-1)).toThrow() })
it('a scripted consumer implements only snapshots and preserves unrelated work when switching targets', () => {
  const s=fixture(),pageId=s.state.document.pages[0].id,unrelated=join(s.directory,'user-code.txt'),output=join(s.directory,'implementation.txt');writeFileSync(unrelated,'user work')
  const run=s.attach('scripted'),owner={ownerId:run.ownerId,runId:run.id}
  s.submit({requestId:'A',baseRevision:0});const a=s.acknowledge(owner).submission!;writeFileSync(output,a.document.pages[0].name)
  s.apply({requestId:'draft',actorId:'user',origin:'user',baseRevision:0,operations:[{type:'page.rename',pageId,name:'Draft B'}]})
  expect(s.events(0).events.filter(e=>e.type==='implementation.submitted')).toHaveLength(1);expect(readFileSync(output,'utf8')).toBe('Home')
  s.submit({requestId:'B',baseRevision:1});const b=s.acknowledge(owner).submission!;writeFileSync(output,b.document.pages[0].name)
  s.detach(owner);const restored=new SessionStore(s.directory,s.state.id,s.state.repository);const resumed=restored.attach('resumed');expect(resumed.targetSubmissionId).toBe('B');expect(readFileSync(output,'utf8')).toBe('Draft B');expect(readFileSync(unrelated,'utf8')).toBe('user work')
})
