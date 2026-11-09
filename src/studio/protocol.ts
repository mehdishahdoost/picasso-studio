import { clone, createDocument, type PicasoDocument, type PicasoPage, type PicasoShape } from '../model'

export const PROTOCOL_VERSION = 1
export class StudioError extends Error {
  constructor(public code: string, message: string, public details: Record<string, unknown> = {}) { super(message) }
}
export const fail = (code: string, message: string, details = {}): never => { throw new StudioError(code, message, details) }
const string = { type: 'string' }, number = { type: 'number' }, boolean = { type: 'boolean' }
const strings = { type: 'array', items: string }
export const kinds = ['rect','ellipse','triangle','diamond','hexagon','parallelogram','text','database','frame','arrow','image','button','textInput','textArea','checkbox','radio','combobox','toggle','slider','link','card','navbar','modal','table','form']
const objectSchema = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
export const shapeProperties: Record<string, any> = {
  id: { ...string, minLength: 1 }, kind: { enum: kinds }, x: number, y: number, width: number, height: number,
  rotation: number, text: string, imageData: string, fill: string, stroke: string, strokeWidth: { ...number, minimum: 0 },
  opacity: { ...number, minimum: 0, maximum: 1 }, fontSize: { ...number, minimum: 1 }, textAlign: { enum: ['left','center','right'] },
  from: string, to: string, fromPort: { enum: ['top','right','bottom','left'] }, toPort: { enum: ['top','right','bottom','left'] },
  value: string, placeholder: string, disabled: boolean, checked: boolean, selectedState: boolean, password: boolean, groupName: string,
  options: { type: 'array', items: objectSchema({ label: string, value: string }) }, min: number, max: number, step: { ...number, minimum: Number.MIN_VALUE },
  url: string, visited: boolean, items: strings, activeItem: { type: 'integer', minimum: 0 }, content: string, visible: boolean, columns: strings,
  rows: { type: 'array', items: objectSchema({ cells: strings }) }, fields: { type: 'array', items: objectSchema({ label: string, type: string }) }, variant: { enum: ['primary','secondary','danger'] }
}
export const shapeSchema = objectSchema(shapeProperties, ['id','kind','x','y','width','height'])
export const pageSchema = objectSchema({ id: { ...string, minLength: 1 }, name: string, shapes: { type: 'array', items: shapeSchema } })
export const documentSchema = objectSchema({ schemaVersion: { const: 1 }, documentId: { ...string, minLength: 1 }, activePageId: string, pages: { type: 'array', minItems: 1, items: pageSchema } })
export type Operation =
  | { type: 'add'; pageId: string; shape: PicasoShape; index?: number }
  | { type: 'update'; pageId: string; id: string; patch: Record<string, unknown> }
  | { type: 'move'; pageId: string; id: string; dx: number; dy: number }
  | { type: 'delete'; pageId: string; id: string }
  | { type: 'page.add'; page: PicasoPage; index?: number }
  | { type: 'page.rename'; pageId: string; name: string }
  | { type: 'page.delete'; pageId: string }
  | { type: 'page.reorder'; ids: string[] }
  | { type: 'shape.reorder'; pageId: string; ids: string[] }
export type Batch = { requestId: string; actorId: string; origin: 'user'|'harness'; baseRevision: number; operations: Operation[] }
export type StudioEvent = { sequence: number; type: string; origin: string; documentRevision: number; payload: any; submissionId?: string }
export type Submission = { id: string; sequence: number; documentRevision: number; document: PicasoDocument; repository: string; previewReferences: { pageId: string; revision: number; format: string; available: boolean }[]; createdAt: string; status: 'pending'|'in-progress'|'complete'|'failed'|'superseded' }
export type Run = { id: string; ownerId: string; leaseExpiry: number; targetSubmissionId?: string; status: string; message: string }
export type SessionState = { protocolVersion: 1; id: string; repository: string; document: PicasoDocument; revision: number; events: StudioEvent[]; submissions: Submission[]; receipts: Record<string, { fingerprint: string; result: BatchResult }>; run?: Run }
export type BatchResult = { revision: number; document: PicasoDocument; inverse: Operation[]; requestId: string }
const idSchema = { ...string, minLength: 1 }
const indexSchema = { type: 'integer', minimum: 0 }
const operationSchemas = [
  objectSchema({ type: { const: 'add' }, pageId: idSchema, shape: shapeSchema, index: indexSchema }, ['type','pageId','shape']),
  objectSchema({ type: { const: 'update' }, pageId: idSchema, id: idSchema, patch: { type: 'object' } }),
  objectSchema({ type: { const: 'move' }, pageId: idSchema, id: idSchema, dx: number, dy: number }),
  objectSchema({ type: { const: 'delete' }, pageId: idSchema, id: idSchema }),
  objectSchema({ type: { const: 'page.add' }, page: pageSchema, index: indexSchema }, ['type','page']),
  objectSchema({ type: { const: 'page.rename' }, pageId: idSchema, name: string }),
  objectSchema({ type: { const: 'page.delete' }, pageId: idSchema }),
  objectSchema({ type: { const: 'page.reorder' }, ids: strings }),
  objectSchema({ type: { const: 'shape.reorder' }, pageId: idSchema, ids: strings })
]
export const schemas = {
  document: documentSchema,
  operation: { oneOf: operationSchemas },
  batch: objectSchema({ requestId: idSchema, actorId: idSchema, origin: { enum: ['user','harness'] }, baseRevision: { type: 'integer', minimum: 0 }, operations: { type: 'array', minItems: 1, items: { oneOf: operationSchemas } } }),
  event: objectSchema({ sequence: indexSchema, type: string, origin: string, documentRevision: indexSchema, payload: {}, submissionId: string }, ['sequence','type','origin','documentRevision','payload']),
  progress: objectSchema({ ownerId: idSchema, runId: idSchema, submissionId: idSchema, status: { enum: ['in-progress','complete','failed'] }, message: string }),
  submission: objectSchema({ id: idSchema, sequence: indexSchema, documentRevision: indexSchema, document: documentSchema, repository: string, previewReferences: { type: 'array', items: objectSchema({ pageId: string, revision: indexSchema, format: string, available: boolean }) }, createdAt: string, status: { enum: ['pending','in-progress','complete','failed','superseded'] } }),
  session: objectSchema({ protocolVersion: { const: 1 }, id: idSchema, repository: string, document: documentSchema, revision: indexSchema, events: { type: 'array' }, submissions: { type: 'array' }, receipts: { type: 'object' }, run: { type: 'object' } }, ['protocolVersion','id','repository','document','revision','events','submissions','receipts'])
}
export function validate(schema: any, value: any, path = '$'): void {
  const invalid = (message: string) => fail('invalid_operation', `${path}: ${message}`)
  if (schema.oneOf) {
    const match = schema.oneOf.find((s: any) => s.properties.type.const === value?.type)
    if (!match) invalid('unknown operation type')
    return validate(match, value, path)
  }
  if ('const' in schema && value !== schema.const) invalid(`expected ${schema.const}`)
  if (schema.enum && !schema.enum.includes(value)) invalid('unsupported value')
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected object')
    for (const key of schema.required ?? []) if (!(key in value)) invalid(`missing ${key}`)
    for (const key of Object.keys(value)) {
      if (['__proto__','constructor','prototype'].includes(key)) invalid('unsafe property')
      if (schema.properties?.[key]) validate(schema.properties[key], value[key], `${path}.${key}`)
      else if (schema.additionalProperties === false) invalid(`unknown property ${key}`)
    }
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) invalid('expected array')
    if (value.length < (schema.minItems ?? 0)) invalid('too few items')
    if (schema.items) value.forEach((v: any, i: number) => validate(schema.items, v, `${path}[${i}]`))
  }
  if (schema.type === 'string' && (typeof value !== 'string' || value.length < (schema.minLength ?? 0))) invalid('expected string')
  if (schema.type === 'boolean' && typeof value !== 'boolean') invalid('expected boolean')
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) invalid('expected finite number')
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) invalid('number out of range')
  }
}
export function validateDocument(document: PicasoDocument) {
  validate(documentSchema, document)
  const ids = new Set<string>()
  for (const page of document.pages) {
    for (const value of [page, ...page.shapes]) {
      if (ids.has(value.id)) fail('invalid_operation', `Duplicate ID: ${value.id}`)
      ids.add(value.id)
    }
    const shapeIds = new Set(page.shapes.map(s => s.id))
    for (const shape of page.shapes) {
      if (shape.kind !== 'arrow' && (shape.width <= 0 || shape.height <= 0)) fail('invalid_operation', 'Object dimensions must be positive')
      for (const key of ['from','to'] as const) if (shape[key] && !shapeIds.has(shape[key]!)) fail('invalid_operation', `Dangling ${key} reference`)
      if (shape.imageData && !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(shape.imageData)) fail('invalid_operation', 'Images must be embedded raster data URLs')
    }
  }
  if (!document.pages.some(p => p.id === document.activePageId)) fail('invalid_operation', 'Active page is missing')
}
export const newSession = (id: string, repository: string): SessionState => ({ protocolVersion: 1, id, repository, document: createDocument(), revision: 0, events: [], submissions: [], receipts: {} })
export function emit(state: SessionState, type: string, origin: string, payload: any, submissionId?: string) {
  const event: StudioEvent = { sequence: (state.events.at(-1)?.sequence ?? 0) + 1, type, origin, documentRevision: state.revision, payload }
  if (submissionId) event.submissionId = submissionId
  state.events.push(event)
  return event
}
export function applyOperations(document: PicasoDocument, operations: Operation[]): PicasoDocument {
  const next = clone(document)
  operations.forEach((op, operationIndex) => {
    try {
      validate(schemas.operation, op)
      if (op.type === 'page.add') { next.pages.splice(op.index ?? next.pages.length, 0, clone(op.page)); return }
      if (op.type === 'page.reorder') { next.pages = reorder(next.pages, op.ids); return }
      const page = next.pages.find(p => p.id === op.pageId)
      if (!page) fail('not_found', `Page not found: ${op.pageId}`)
      const target = page!
      if (op.type === 'page.rename') { target.name = op.name; return }
      if (op.type === 'page.delete') {
        if (next.pages.length === 1) fail('invalid_operation', 'Cannot delete the last page')
        next.pages = next.pages.filter(p => p.id !== op.pageId)
        if (next.activePageId === op.pageId) next.activePageId = next.pages[0].id
        return
      }
      if (op.type === 'shape.reorder') { target.shapes = reorder(target.shapes, op.ids); return }
      if (op.type === 'add') { target.shapes.splice(op.index ?? target.shapes.length, 0, clone(op.shape)); return }
      const shape = target.shapes.find(s => s.id === op.id)
      if (!shape) fail('not_found', `Object not found: ${op.id}`)
      if (op.type === 'delete') target.shapes = target.shapes.filter(s => s.id !== op.id)
      if (op.type === 'move') { shape!.x += op.dx; shape!.y += op.dy }
      if (op.type === 'update') for (const [key, value] of Object.entries(op.patch)) {
        if (key === 'id' || !(key in shapeProperties)) fail('invalid_operation', `Cannot patch ${key}`)
        if (value === null) delete (shape as any)[key]
        else { validate(shapeProperties[key], value, `patch.${key}`); (shape as any)[key] = clone(value) }
      }
    } catch (error) {
      if (error instanceof StudioError) error.details.operationIndex = operationIndex
      throw error
    }
  })
  validateDocument(next)
  return next
}
function reorder<T extends { id: string }>(items: T[], ids: string[]): T[] {
  if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some(id => !items.some(i => i.id === id))) fail('invalid_operation', 'Order must contain every ID exactly once')
  return ids.map(id => items.find(i => i.id === id)!)
}
export function diffDocuments(before: PicasoDocument, after: PicasoDocument): Operation[] {
  const result: Operation[] = []
  for (const page of after.pages) {
    const old = before.pages.find(p => p.id === page.id)
    if (!old) { result.push({ type: 'page.add', page }); continue }
    if (old.name !== page.name) result.push({ type: 'page.rename', pageId: page.id, name: page.name })
    for (const shape of old.shapes) if (!page.shapes.some(s => s.id === shape.id)) result.push({ type: 'delete', pageId: page.id, id: shape.id })
    for (const shape of page.shapes) {
      const previous = old.shapes.find(s => s.id === shape.id)
      if (!previous) result.push({ type: 'add', pageId: page.id, shape })
      else {
        const patch: Record<string, unknown> = {}
        for (const key of new Set([...Object.keys(previous), ...Object.keys(shape)])) if (key !== 'id' && JSON.stringify((previous as any)[key]) !== JSON.stringify((shape as any)[key])) patch[key] = (shape as any)[key] ?? null
        if (Object.keys(patch).length) result.push({ type: 'update', pageId: page.id, id: shape.id, patch })
      }
    }
    const interim = [...old.shapes.filter(s => page.shapes.some(n => n.id === s.id)), ...page.shapes.filter(s => !old.shapes.some(n => n.id === s.id))]
    if (interim.map(s => s.id).join() !== page.shapes.map(s => s.id).join()) result.push({ type: 'shape.reorder', pageId: page.id, ids: page.shapes.map(s => s.id) })
  }
  for (const page of before.pages) if (!after.pages.some(p => p.id === page.id)) result.push({ type: 'page.delete', pageId: page.id })
  const interim = [...before.pages.filter(p => after.pages.some(n => n.id === p.id)), ...after.pages.filter(p => !before.pages.some(n => n.id === p.id))]
  if (interim.map(p => p.id).join() !== after.pages.map(p => p.id).join()) result.push({ type: 'page.reorder', ids: after.pages.map(p => p.id) })
  return clone(result)
}
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
export function applyBatch(state: SessionState, batch: Batch): BatchResult {
  validate(schemas.batch, batch)
  const fingerprint = JSON.stringify(canonical(batch)), receipt = Object.hasOwn(state.receipts, batch.requestId) ? state.receipts[batch.requestId] : undefined
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) fail('invalid_operation', 'Request ID was already used for different input')
    return clone(receipt.result)
  }
  if (batch.baseRevision !== state.revision) fail('revision_conflict', 'Read the latest document and reconcile before retrying', { currentRevision: state.revision })
  const previous = state.document, document = applyOperations(previous, batch.operations)
  const inverse = diffDocuments(document, previous)
  state.document = document
  state.revision++
  const result = { revision: state.revision, document: clone(document), inverse, requestId: batch.requestId }
  Object.defineProperty(state.receipts, batch.requestId, { value: { fingerprint, result }, enumerable: true, configurable: true, writable: true })
  emit(state, 'document.changed', batch.origin, { actorId: batch.actorId, requestId: batch.requestId, operations: batch.operations })
  return clone(result)
}
export const contract = { protocolVersion: PROTOCOL_VERSION, schemas, operations: operationSchemas, errors: ['invalid_operation','not_found','revision_conflict','unauthorized','session_mismatch','owner_conflict','preview_unavailable'], commands: ['describe','document','selection','apply','preview','events','acknowledge','progress','attach','heartbeat','detach','submissions'], semantics: { patchNull: 'Remove an optional property', submission: 'Only the user Implement button submits implementation instructions', polling: 'Check events before each implementation step and after checks' } }
