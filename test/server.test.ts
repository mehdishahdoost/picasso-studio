import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { startServer } from '../runtime/server'
const cleanup: (() => any)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'studio-server-')); cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  const assets = join(directory, 'assets'); mkdirSync(assets); writeFileSync(join(assets, 'index.html'), 'Studio')
  const server = await startServer({ directory, id: 'test', repository: '/repo', assets }); cleanup.push(() => server.close())
  const headers = { authorization: `Bearer ${server.token}`, 'x-picasso-repository': '/repo' }
  const request = (path: string, options: RequestInit = {}) => fetch(server.descriptor.origin + '/api/' + path, { ...options, headers: { ...headers, ...options.headers } })
  return { ...server, headers, request }
}
it('authenticates, isolates repositories and protects origin/host/asset traversal', async () => {
  const s = await fixture(); const url = s.descriptor.origin
  expect((await fetch(url + '/api/document')).status).toBe(403)
  expect((await s.request('document', { headers: { origin: 'https://evil.example' } })).status).toBe(403)
  expect(await new Promise(resolve => { const req = httpRequest(url + '/api/document', { headers: { ...s.headers, host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode) }); req.end() })).toBe(403)
  expect((await s.request('document', { headers: { 'x-picasso-repository': '/other' } })).status).toBe(403)
  expect((await fetch(url + '/%2e%2e%2fstate.json')).status).toBe(403)
  expect((await s.request('document')).status).toBe(200)
  expect((await s.request('submit', { method: 'POST', body: JSON.stringify({ requestId: 'A', baseRevision: 0 }) })).status).toBe(403)
})
it('bootstraps once, permits browser submission and rejects stale submissions', async () => {
  const s = await fixture(); const secret = new URLSearchParams(new URL(s.url).hash.slice(1)).get('bootstrap')
  const boot = () => fetch(s.descriptor.origin + '/api/bootstrap', { method: 'POST', headers: { origin: s.descriptor.origin }, body: JSON.stringify({ secret }) })
  const response = await boot(), cookie = response.headers.get('set-cookie')!.split(';')[0]
  expect(response.status).toBe(200); expect((await boot()).status).toBe(403)
  const submit = await fetch(s.descriptor.origin + '/api/submit', { method: 'POST', headers: { origin: s.descriptor.origin, cookie }, body: JSON.stringify({ requestId: 'A', baseRevision: 0 }) }); expect(submit.status).toBe(200)
  expect((await s.request('submissions').then(r => r.json())).submissions[0].id).toBe('A')
})
it('long polls and replays durable events with timeout and transaction-before-delivery', async () => {
  const s = await fixture(); const wait = s.request('events?after=0&wait=1').then(r => r.json())
  const pageId = s.store.state.document.pages[0].id
  await s.request('apply', { method: 'POST', body: JSON.stringify({ requestId: 'edit', actorId: 'agent', origin: 'harness', baseRevision: 0, operations: [{ type: 'page.rename', pageId, name: 'Updated' }] }) })
  const result = await wait; expect(result.events[0].type).toBe('document.changed'); expect(s.store.state.revision).toBe(1)
  expect(await s.request('events?after=1&wait=0.01').then(r => r.json())).toEqual({ events: [], cursor: 1 })
})
it('labels exact revision previews and reports unavailable PNG', async () => { const s = await fixture(); const preview = await s.request('preview').then(r => r.json()); expect(preview).toMatchObject({ available: true, revision: 0, format: 'svg' }); expect(preview.data).toContain('<svg'); expect(await s.request('preview?format=png').then(r => r.json())).toMatchObject({ available: false, revision: 0 }); expect(await s.request('preview?revision=99').then(r => r.json())).toMatchObject({ available: false, revision: 99 }) })
