import { mkdirSync, openSync, closeSync, fsyncSync, writeFileSync, readFileSync, renameSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { applyBatch, emit, fail, newSession, schemas, validate, validateDocument, type Batch, type Run, type SessionState, type Submission } from '../src/studio/protocol'
import { clone } from '../src/model'

export function repositoryRoot(path: string) {
  try { return realpathSync(execFileSync('git', ['-C', path, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()) }
  catch { return fail('session_mismatch', 'Run inside a Git repository or pass --repo <repository>') }
}
export function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temporary, path)
}
export const LEASE_MS = 30 * 60 * 1000
export class SessionStore {
  state: SessionState
  readonly file: string
  constructor(readonly directory: string, id: string, repository: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.file = join(directory, 'state.json')
    try { this.state = JSON.parse(readFileSync(this.file, 'utf8')) }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; this.state = newSession(id, repository); atomicJson(this.file, this.state) }
    validate(schemas.session, this.state); validateDocument(this.state.document)
    this.state.submissions.forEach(s => validate(schemas.submission, s))
    if (this.state.id !== id || this.state.repository !== repository) fail('session_mismatch', 'Session belongs to another repository')
  }
  transaction<T>(mutate: (state: SessionState) => T): T {
    const next = clone(this.state), result = mutate(next)
    atomicJson(this.file, next)
    this.state = next
    return clone(result)
  }
  apply(batch: Batch) { return this.transaction(state => applyBatch(state, batch)) }
  view() { const { id, repository, protocolVersion, document, revision, submissions, run, events } = this.state; return clone({ id, repository, protocolVersion, document, revision, submissions, run: run ?? null, cursor: events.at(-1)?.sequence ?? 0 }) }
  events(after: number) { if (!Number.isSafeInteger(after) || after < 0) fail('invalid_operation', 'Invalid event cursor'); return clone({ events: this.state.events.filter(e => e.sequence > after), cursor: this.state.events.at(-1)?.sequence ?? 0 }) }
  submit(input: { requestId: string; baseRevision: number }) {
    validate({ type: 'object', required: ['requestId','baseRevision'], properties: { requestId: { type: 'string', minLength: 1 }, baseRevision: { type: 'integer', minimum: 0 } }, additionalProperties: false }, input)
    return this.transaction(state => {
      const existing = state.submissions.find(s => s.id === input.requestId)
      if (existing) { if (existing.documentRevision !== input.baseRevision) fail('invalid_operation', 'Submission ID reused'); return existing }
      if (input.baseRevision !== state.revision) fail('revision_conflict', 'Synchronize the draft before submitting', { currentRevision: state.revision })
      const submission: Submission = { id: input.requestId, sequence: state.submissions.length + 1, documentRevision: state.revision, document: clone(state.document), repository: state.repository, previewReferences: state.document.pages.map(page => ({ pageId: page.id, revision: state.revision, format: 'svg', available: true })), createdAt: new Date().toISOString(), status: 'pending' }
      state.submissions.push(submission); emit(state, 'implementation.submitted', 'user', { sequence: submission.sequence }, submission.id)
      return submission
    })
  }
  attach(ownerId: string, now = Date.now()) {
    if (!ownerId || typeof ownerId !== 'string') fail('invalid_operation', 'ownerId is required')
    return this.transaction(state => {
      if (state.run && state.run.leaseExpiry > now && state.run.ownerId !== ownerId) fail('owner_conflict', 'Another implementation owner is active', { ownerId: state.run.ownerId })
      if (state.run?.ownerId === ownerId && state.run.leaseExpiry > now) { state.run.leaseExpiry = now + LEASE_MS; return state.run }
      const prior = state.run
      const run: Run = { id: randomUUID(), ownerId, leaseExpiry: now + LEASE_MS, status: prior?.status ?? 'waiting', message: 'Attached', ...(prior?.targetSubmissionId ? { targetSubmissionId: prior.targetSubmissionId } : {}) }
      state.run = run; emit(state, 'agent.attached', 'harness', { ownerId, runId: run.id }); return run
    })
  }
  requireOwner(state: SessionState, input: { ownerId: string; runId: string }, now = Date.now()) {
    if (!state.run || state.run.ownerId !== input.ownerId || state.run.id !== input.runId || state.run.leaseExpiry <= now) fail('owner_conflict', 'Attach or reacquire the implementation lease')
    state.run!.leaseExpiry = now + LEASE_MS
    return state.run!
  }
  heartbeat(input: { ownerId: string; runId: string }, now = Date.now()) { return this.transaction(state => this.requireOwner(state, input, now)) }
  detach(input: { ownerId: string; runId: string }) { return this.transaction(state => { const run = this.requireOwner(state, input); run.leaseExpiry = 0; emit(state, 'agent.detached', 'harness', { runId: run.id }); return run }) }
  acknowledge(input: { ownerId: string; runId: string; submissionId?: string }) {
    return this.transaction(state => {
      const run = this.requireOwner(state, input)
      const pending = state.submissions.filter(s => s.status === 'pending')
      const newest = pending.at(-1)
      if (!newest) {
        const existing = state.submissions.find(s => s.id === (input.submissionId ?? run.targetSubmissionId))
        if (!existing) fail('not_found', 'No submission to acknowledge')
        if (existing!.id !== run.targetSubmissionId) fail('invalid_operation', 'Submission is not the current target')
        return { run, submission: existing }
      }
      if (input.submissionId && input.submissionId !== newest.id) fail('revision_conflict', 'A newer submission is pending', { submissionId: newest.id })
      for (const s of pending.slice(0, -1)) s.status = 'superseded'
      const old = state.submissions.find(s => s.id === run.targetSubmissionId)
      if (old?.status === 'in-progress') old.status = 'superseded'
      newest.status = 'in-progress'; run.targetSubmissionId = newest.id; run.status = 'in-progress'; run.message = 'Implementing submitted design'
      emit(state, 'implementation.acknowledged', 'harness', { runId: run.id }, newest.id)
      return { run, submission: newest }
    })
  }
  progress(input: { ownerId: string; runId: string; submissionId: string; status: string; message: string }) {
    validate(schemas.progress, input)
    return this.transaction(state => {
      const run = this.requireOwner(state, input), target = state.submissions.find(s => s.id === input.submissionId)
      if (!target || target.status === 'pending' || target.status === 'superseded') fail('invalid_operation', 'Progress requires an acknowledged active or completed target')
      target!.status = input.status as Submission['status']
      if (run.targetSubmissionId === target!.id) { run.status = input.status; run.message = input.message }
      emit(state, 'implementation.progress', 'harness', { runId: run.id, status: input.status, message: input.message }, target!.id)
      return { run, submission: target }
    })
  }
}
