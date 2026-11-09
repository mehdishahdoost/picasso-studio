import { clone, createDocument, type PicasoDocument } from '../model'
import { applyOperations, diffDocuments, StudioError, type Batch, type BatchResult, type Operation } from './protocol'
export type ControllerSnapshot = { document: PicasoDocument; revision: number; connected: boolean; pending: number; conflict: string | null; session: any | null }
type HistoryEntry = { forward: Operation[]; inverse: Operation[]; revision: number }
export interface EditorController {
  snapshot: ControllerSnapshot
  subscribe: (listener: () => void) => () => void
  change(next: PicasoDocument): void
  viewPage(id: string): void
  undo(): void
  redo(): void
  selection?(pageId: string, ids: string[]): void
}
export class MemoryController implements EditorController {
  snapshot: ControllerSnapshot
  protected listeners = new Set<() => void>()
  protected undoStack: HistoryEntry[] = []
  protected redoStack: HistoryEntry[] = []
  constructor(document = createDocument()) { const normalized = document.pages?.length ? { ...document, activePageId: document.pages.some(p => p.id === document.activePageId) ? document.activePageId : document.pages[0].id } : createDocument(); this.snapshot = { document: clone(normalized), revision: 0, connected: true, pending: 0, conflict: null, session: null } }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  protected notify(patch: Partial<ControllerSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()) }
  change(next: PicasoDocument) {
    const previous = this.snapshot.document, forward = diffDocuments(previous, next)
    if (!forward.length && previous.documentId === next.documentId) { this.viewPage(next.activePageId); return }
    this.undoStack.push({ forward, inverse: diffDocuments(next, previous), revision: this.snapshot.revision + 1 }); this.redoStack = []
    this.notify({ document: clone(next), revision: this.snapshot.revision + 1 })
  }
  viewPage(id: string) { if (this.snapshot.document.pages.some(p => p.id === id)) this.notify({ document: { ...this.snapshot.document, activePageId: id } }) }
  undo() { const entry = this.undoStack.pop(); if (entry) { const document = applyOperations(this.snapshot.document, entry.inverse); this.redoStack.push(entry); this.notify({ document, revision: this.snapshot.revision + 1 }) } }
  redo() { const entry = this.redoStack.pop(); if (entry) { const document = applyOperations(this.snapshot.document, entry.forward); this.undoStack.push(entry); this.notify({ document, revision: this.snapshot.revision + 1 }) } }
}
export type Transport = { read(): Promise<any>; apply(batch: Batch): Promise<BatchResult>; post(action: string, input: any): Promise<any> }
export class StudioController extends MemoryController {
  private authoritative: any
  private queue: { batch: Batch; inverse: Operation[]; history: boolean }[] = []
  private draining: Promise<void> | null = null
  private sequence = 0
  readonly actorId = crypto.randomUUID()
  constructor(private transport: Transport) { super(); this.notify({ connected: false }) }
  receive(session: any) {
    if (!this.authoritative || session.revision >= this.authoritative.revision) this.authoritative = session
    const active = this.snapshot.document.activePageId
    const document = clone(this.authoritative.document)
    if (document.pages.some((p: any) => p.id === active)) document.activePageId = active
    this.notify({ session: this.authoritative, connected: true, ...(!this.queue.length ? { document, revision: this.authoritative.revision } : {}) })
    if (this.queue.length && !this.snapshot.conflict) void this.drain()
  }
  disconnected() { this.notify({ connected: false }) }
  async reconnect() { try { this.receive(await this.transport.read()); if (this.queue.length && !this.snapshot.conflict) await this.drain() } catch (error: any) { this.notify({ connected: false, conflict: error.message }) } }
  override change(next: PicasoDocument) {
    if (this.snapshot.conflict) return
    const operations = diffDocuments(this.snapshot.document, next)
    if (!operations.length) { this.viewPage(next.activePageId); return }
    try { this.enqueue(operations, true, next.activePageId) } catch (error: any) { this.notify({ conflict: error.message }) }
  }
  private enqueue(operations: Operation[], history: boolean, activePageId?: string) {
    const document = applyOperations(this.snapshot.document, operations), inverse = diffDocuments(document, this.snapshot.document)
    if (activePageId && document.pages.some(p => p.id === activePageId)) document.activePageId = activePageId
    const batch: Batch = { requestId: `${this.actorId}-${++this.sequence}`, actorId: this.actorId, origin: 'user', baseRevision: this.snapshot.revision + this.queue.length, operations: clone(operations) }
    this.queue.push({ batch, inverse, history })
    if (history) this.redoStack = []
    this.notify({ document, pending: this.queue.length })
    void this.drain()
  }
  private drain(): Promise<void> {
    if (this.draining) return this.draining
    this.draining = (async () => {
      while (this.queue.length && this.snapshot.connected && !this.snapshot.conflict) {
        const entry = this.queue[0]
        try {
          const result = await this.transport.apply(entry.batch)
          this.queue.shift()
          if (entry.history) this.undoStack.push({ forward: entry.batch.operations, inverse: result.inverse, revision: result.revision })
          // SSE can already have delivered a newer revision. Never replace it with an older receipt.
          if (!this.authoritative || result.revision > this.authoritative.revision) this.authoritative = { ...this.authoritative, document: result.document, revision: result.revision }
          const active = this.snapshot.document.activePageId
          const document = clone(this.authoritative.document)
          if (document.pages.some((p: any) => p.id === active)) document.activePageId = active
          this.notify({ revision: result.revision, pending: this.queue.length, ...(!this.queue.length ? { document, revision: this.authoritative.revision } : {}) })
        } catch (error: any) {
          this.notify({ conflict: error.message, connected: error.code === 'disconnected' ? false : this.snapshot.connected }); break
        }
      }
    })().finally(() => { this.draining = null })
    return this.draining
  }
  async flush() { await this.drain(); if (this.queue.length || this.snapshot.conflict || !this.snapshot.connected) throw new StudioError('revision_conflict', 'Synchronize or reconcile unsent edits before submitting') }
  async submit() { await this.flush(); const result = await this.transport.post('submit', { requestId: crypto.randomUUID(), baseRevision: this.snapshot.revision }); this.receive(await this.transport.read()); return result }
  async reconcile(retry: boolean) {
    const preserved = [...this.queue]
    try {
      const session = await this.transport.read(), pending = [...this.queue]
      this.queue = []; this.notify({ conflict: null, pending: 0 }); this.receive(session)
      if (retry && pending.length) {
        // Preserve the original property-level intent; do not diff a stale whole document over remote work.
        const operations = pending.flatMap(entry => entry.batch.operations)
        this.enqueue(operations, true)
        await this.flush()
      }
    } catch (error: any) { if (!this.queue.length && retry && preserved.length) { this.queue = preserved; this.notify({ pending: preserved.length }) }; this.notify({ conflict: error.message }) }
  }
  override undo() {
    const entry = this.undoStack.at(-1)
    if (!entry || this.queue.length || this.snapshot.conflict) return
    if (entry.revision !== this.snapshot.revision) { this.notify({ conflict: 'Undo conflicts with newer edits. Review the current design before discarding this undo.' }); return }
    this.undoStack.pop(); this.redoStack.push({ ...entry, revision: this.snapshot.revision + 1 }); this.enqueue(entry.inverse, false)
  }
  override redo() {
    const entry = this.redoStack.at(-1)
    if (!entry || this.queue.length || this.snapshot.conflict) return
    if (entry.revision !== this.snapshot.revision) { this.notify({ conflict: 'Redo conflicts with newer edits.' }); return }
    this.redoStack.pop(); this.undoStack.push({ ...entry, revision: this.snapshot.revision + 1 }); this.enqueue(entry.forward, false)
  }
  selection(pageId: string, ids: string[]) { if (this.snapshot.connected) void this.transport.post('selection', { pageId, ids }).catch(() => {}) }
}
export function browserTransport(): Transport {
  const request = async (action: string, input?: unknown) => {
    let response: Response
    try { response = await fetch(`/api/${action}`, { method: input === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) }) }
    catch { throw new StudioError('disconnected', 'Connection lost; reconnect to keep editing') }
    const result = await response.json()
    if (!response.ok) throw new StudioError(result.error?.code ?? 'server_error', result.error?.message ?? 'Studio request failed', result.error?.details)
    return result
  }
  return { read: () => request('document'), apply: batch => request('apply', batch), post: request }
}
