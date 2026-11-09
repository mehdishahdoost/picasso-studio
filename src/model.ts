export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'hexagon' | 'parallelogram' | 'text' | 'database' | 'frame' | 'arrow' | 'image' | 'button' | 'textInput' | 'textArea' | 'checkbox' | 'radio' | 'combobox' | 'toggle' | 'slider' | 'link' | 'card' | 'navbar' | 'modal' | 'table' | 'form'
export type Port = 'top'|'right'|'bottom'|'left'
export type WebOption = { label: string; value: string }
export type WebRow = { cells: string[] }
export type WebField = { label: string; type: string }
export type PicasoShape = { id: string; kind: ShapeKind; x: number; y: number; width: number; height: number; rotation?: number; text?: string; imageData?: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; fontSize?: number; textAlign?: 'left'|'center'|'right'; from?: string; to?: string; fromPort?: Port; toPort?: Port; value?: string; placeholder?: string; disabled?: boolean; checked?: boolean; selectedState?: boolean; password?: boolean; groupName?: string; options?: WebOption[]; min?: number; max?: number; step?: number; url?: string; visited?: boolean; items?: string[]; activeItem?: number; content?: string; visible?: boolean; columns?: string[]; rows?: WebRow[]; fields?: WebField[]; variant?: 'primary'|'secondary'|'danger' }
export type PicasoPage = { id: string; name: string; shapes: PicasoShape[] }
export type PicasoDocument = { schemaVersion: 1; documentId: string; activePageId: string; pages: PicasoPage[] }
export type PicasoCommand = { type: 'add'|'delete'|'move'|'update'; shape?: PicasoShape; id?: string; dx?: number; dy?: number; patch?: Partial<PicasoShape> }
export const createDocument = (): PicasoDocument => { const page = { id: crypto.randomUUID(), name: 'Home', shapes: [] }; return { schemaVersion: 1, documentId: crypto.randomUUID(), activePageId: page.id, pages: [page] } }
export const activatePage = (document: PicasoDocument, pageId: string): PicasoDocument => { const index = document.pages.findIndex(page => page.id === pageId); if (index < 0) return document; const next = clone(document); next.activePageId = pageId; return next }
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
export function applyCommand(document: PicasoDocument, command: PicasoCommand): PicasoDocument {
  const next = clone(document), page = next.pages.find(candidate => candidate.id === next.activePageId) ?? next.pages[0]
  if (command.type === 'add' && command.shape) page.shapes.push(clone(command.shape))
  if (command.type === 'delete' && command.id) page.shapes = page.shapes.filter(s => s.id !== command.id)
  const shape = page.shapes.find(s => s.id === command.id)
  if (shape && command.type === 'move') { shape.x += command.dx ?? 0; shape.y += command.dy ?? 0 }
  if (shape && command.type === 'update') Object.assign(shape, command.patch)
  return next
}
