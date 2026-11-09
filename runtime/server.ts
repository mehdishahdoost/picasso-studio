import { createServer, type ServerResponse, type IncomingMessage } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionStore, atomicJson } from './store'
import { contract, fail, StudioError } from '../src/studio/protocol'
import { renderPageSvg } from '../src/studio/preview'

export const runtimeRoot = (() => {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 5; depth++) {
    const metadata = join(directory, 'package.json')
    if (existsSync(metadata) && JSON.parse(readFileSync(metadata, 'utf8')).name === 'picasso-studio') return directory
    directory = dirname(directory)
  }
  throw new Error('Cannot locate the Picasso Studio runtime package')
})()
const equal = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const json = (response: ServerResponse, status: number, body: unknown) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)) }
async function body(request: IncomingMessage) {
  const chunks: Buffer[] = []; let length = 0
  for await (const chunk of request) { length += chunk.length; if (length > 16 * 1024 * 1024) fail('invalid_operation', 'Request too large'); chunks.push(chunk) }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { return fail('invalid_operation', 'Invalid JSON body') }
}
export async function startServer(options: { directory: string; id: string; repository: string; assets?: string; token?: string }) {
  const store = new SessionStore(options.directory, options.id, options.repository)
  const serverVersion = JSON.parse(readFileSync(join(runtimeRoot, 'package.json'), 'utf8')).version
  const credentialsPath = join(options.directory, 'credentials.json')
  const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) : { token: options.token ?? randomBytes(32).toString('hex') }
  atomicJson(credentialsPath, credentials)
  let bootstrap = randomBytes(32).toString('hex'), origin = ''
  const cookies = new Set<string>(), cookieName = `picasso_${options.id.replace(/[^a-zA-Z0-9]/g, '')}`
  const streams = new Set<ServerResponse>(), selection = { pageId: store.state.document.activePageId, ids: [] as string[] }
  const waiting = new Set<() => void>()
  const previews = new Map<string, { resolve: (value: any) => void; revision: number; pageId: string }>()
  function broadcast() { for (const response of streams) response.write(`event: state\ndata: ${JSON.stringify(store.view())}\n\n`); for (const wake of waiting) wake() }
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host
      if (origin && host !== new URL(origin).host) fail('unauthorized', 'Invalid local Host')
      const url = new URL(request.url ?? '/', origin || 'http://127.0.0.1')
      const browserOrigin = request.headers.origin
      if (browserOrigin && browserOrigin !== origin) fail('unauthorized', 'Invalid browser Origin')
      if (!url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET') fail('not_found', 'Not found')
        const rawPath = decodeURIComponent((request.url ?? '/').split('?')[0])
        if (rawPath.includes('..') || rawPath.includes('\\') || rawPath.includes('\0')) fail('unauthorized', 'Invalid asset path')
        const assets = resolve(options.assets ?? join(runtimeRoot, 'dist'))
        const path = resolve(assets, `.${url.pathname === '/' ? '/index.html' : url.pathname}`)
        if (!path.startsWith(assets + sep) || !existsSync(path)) fail('not_found', 'Asset not found')
        if (!realpathSync(path).startsWith(realpathSync(assets) + sep)) fail('unauthorized', 'Asset escapes application root')
        const types: Record<string,string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' }
        response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' }); response.end(readFileSync(path)); return
      }
      if (url.pathname === '/api/bootstrap' && request.method === 'POST') {
        if (browserOrigin !== origin) fail('unauthorized', 'Browser bootstrap requires same origin')
        const input = await body(request)
        if (!bootstrap || typeof input.secret !== 'string' || !equal(input.secret, bootstrap)) fail('unauthorized', 'Invalid or consumed browser link; reattach to get another')
        bootstrap = ''; const cookie = randomBytes(32).toString('hex'); cookies.add(cookie)
        response.setHeader('set-cookie', `${cookieName}=${cookie}; HttpOnly; SameSite=Strict; Path=/`)
        json(response, 200, { sessionId: options.id }); return
      }
      const authorization = request.headers.authorization ?? ''
      const isCli = authorization.startsWith('Bearer ') && equal(authorization.slice(7), credentials.token)
      const cookie = request.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
      const isBrowser = !!cookie && cookies.has(cookie)
      if (!isCli && !isBrowser) fail('unauthorized', 'Session credentials are required')
      if (isCli && request.headers['x-picasso-repository'] !== options.repository) fail('session_mismatch', 'Session belongs to a different repository')
      if (!isCli && request.method !== 'GET' && browserOrigin !== origin) fail('unauthorized', 'Browser mutations require same origin')
      const action = url.pathname.slice('/api/'.length)
      if (request.method === 'GET') {
        if (action === 'status') { json(response, 200, { sessionId: options.id, serverVersion, serverReady: true, browserConnected: streams.size > 0, connectedEditors: streams.size, agentConnected: !!store.state.run && store.state.run.leaseExpiry > Date.now() }); return }
        if (action === 'document') { json(response, 200, store.view()); return }
        if (action === 'describe') { json(response, 200, contract); return }
        if (action === 'selection') { json(response, 200, selection); return }
        if (action === 'submissions') { json(response, 200, { submissions: store.state.submissions }); return }
        if (action === 'events') {
          const after = Number(url.searchParams.get('after') ?? 0), wait = Math.min(30, Math.max(0, Number(url.searchParams.get('wait') ?? 0)))
          if (!Number.isFinite(wait)) fail('invalid_operation', 'Invalid wait duration')
          if (!store.events(after).events.length && wait) await new Promise<void>(resolve => {
            const timer = setTimeout(finish, wait * 1000)
            function finish() { clearTimeout(timer); waiting.delete(finish); resolve() }
            waiting.add(finish); response.on('close', finish)
          })
          json(response, 200, store.events(after)); return
        }
        if (action === 'stream') {
          if (!isBrowser) fail('unauthorized', 'Browser stream requires a browser session')
          response.writeHead(200, { 'content-type':'text/event-stream', 'cache-control':'no-store', connection:'keep-alive' })
          streams.add(response); response.write(`event: state\ndata: ${JSON.stringify(store.view())}\n\n`)
          const timer = setInterval(() => response.write(': heartbeat\n\n'), 15000)
          response.on('close', () => { clearInterval(timer); streams.delete(response) }); return
        }
        if (action === 'preview') {
          const revision = Number(url.searchParams.get('revision') ?? store.state.revision), pageId = url.searchParams.get('page') ?? store.state.document.activePageId, format = url.searchParams.get('format') ?? 'svg'
          const document = revision === store.state.revision ? store.state.document : store.state.submissions.find(s => s.documentRevision === revision)?.document
          if (!document) { json(response, 200, { available: false, revision, pageId, reason: 'Requested revision is unavailable' }); return }
          const svg = renderPageSvg(document, pageId)
          if (format === 'svg') { json(response, 200, { available: true, revision, pageId, format, data: svg }); return }
          if (format !== 'png') fail('invalid_operation', 'Unsupported preview format')
          if (!streams.size) { json(response, 200, { available: false, revision, pageId, format, reason: 'No connected browser renderer' }); return }
          const requestId = randomUUID()
          const result = await new Promise(resolve => {
            const timer = setTimeout(() => { previews.delete(requestId); resolve({ available: false, reason: 'Browser render timeout' }) }, 5000)
            previews.set(requestId, { revision, pageId, resolve: result => { clearTimeout(timer); previews.delete(requestId); resolve(result) } })
            for (const stream of streams) stream.write(`event: preview\ndata: ${JSON.stringify({ requestId, svg, revision, pageId })}\n\n`)
          })
          json(response, 200, { revision, pageId, format, ...result as any }); return
        }
        fail('not_found', 'Unknown bridge operation')
      }
      if (request.method !== 'POST') fail('not_found', 'Unknown method')
      const input = await body(request)
      let result: unknown
      switch (action) {
        case 'apply': result = store.apply(input); break
        case 'submit': if (!isBrowser) fail('unauthorized', 'Only the browser Implement action submits a design'); result = store.submit(input); break
        case 'selection':
          if (!isBrowser) fail('unauthorized', 'Only the editor sets selection')
          if (!store.state.document.pages.some(p => p.id === input.pageId) || !Array.isArray(input.ids) || input.ids.some((id: any) => !store.state.document.pages.find(p => p.id === input.pageId)!.shapes.some(s => s.id === id))) fail('invalid_operation', 'Invalid selection')
          selection.pageId = input.pageId; selection.ids = input.ids; result = selection; break
        case 'attach': if (!isCli) fail('unauthorized', 'Agent operation'); result = store.attach(input.ownerId); break
        case 'heartbeat': if (!isCli) fail('unauthorized', 'Agent operation'); result = store.heartbeat(input); break
        case 'detach': if (!isCli) fail('unauthorized', 'Agent operation'); result = store.detach(input); break
        case 'acknowledge': if (!isCli) fail('unauthorized', 'Agent operation'); result = store.acknowledge(input); break
        case 'progress': if (!isCli) fail('unauthorized', 'Agent operation'); result = store.progress(input); break
        case 'browser': if (!isCli) fail('unauthorized', 'Agent operation'); bootstrap = randomBytes(32).toString('hex'); result = { url: `${origin}/#bootstrap=${bootstrap}` }; break
        case 'preview-result': {
          if (!isBrowser) fail('unauthorized', 'Browser renderer required')
          const pending = previews.get(input.requestId)
          if (!pending) fail('not_found', 'Preview request expired')
          if (input.data && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.data)) fail('invalid_operation', 'Invalid PNG')
          pending!.resolve(input.data ? { available: true, data: input.data } : { available: false, reason: 'Browser could not render PNG' }); result = { ok: true }; break
        }
        case 'stop': if (!isCli) fail('unauthorized', 'Agent operation'); json(response, 200, { stopped: true }); setImmediate(() => { for (const stream of streams) stream.end(); server.close(); server.closeAllConnections() }); return
        default: fail('not_found', 'Unknown bridge operation')
      }
      broadcast(); json(response, 200, result)
    } catch (error) {
      if (response.headersSent) { response.end(); return }
      const known = error instanceof StudioError
      json(response, known && ['unauthorized','session_mismatch'].includes(error.code) ? 403 : known && ['revision_conflict','owner_conflict'].includes(error.code) ? 409 : known && error.code === 'not_found' ? 404 : known ? 400 : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Local server error', details: known ? error.details : {} } })
    }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${(server.address() as any).port}`
  const descriptor = { protocolVersion: 1, serverVersion, sessionId: options.id, repository: options.repository, origin, pid: process.pid, credentialsPath }
  atomicJson(join(options.directory, 'connection.json'), descriptor)
  const close = async () => { for (const wake of waiting) wake(); for (const response of streams) response.end(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  return { server, store, descriptor, token: credentials.token as string, url: `${origin}/#bootstrap=${bootstrap}`, close, broadcast }
}
