import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Shape } from '../Editor'
import type { PicasoDocument, PicasoPage } from '../model'
import { fail } from './protocol'
const noop = () => {}
export const pageSize = (page: PicasoPage) => ({ width: Math.max(1000, ...page.shapes.map(s => s.x + Math.abs(s.width) + 120)), height: Math.max(650, ...page.shapes.map(s => s.y + Math.abs(s.height) + 120)) })
export function renderPageSvg(document: PicasoDocument, pageId: string): string {
  const page = document.pages.find(p => p.id === pageId)
  if (!page) fail('not_found', 'Preview page not found')
  const { width, height } = pageSize(page!)
  return renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <style>{'.connector{fill:none;stroke:#475569;stroke-width:2}.control-placeholder{fill:#64748b}text{font-family:system-ui,sans-serif;fill:#172033}'}</style>
    <rect width={width} height={height} fill="#fff" />
    {page!.shapes.filter(s => s.visible !== false).map(shape => <g key={shape.id}><Shape shape={shape} selected={false} onSelect={noop} onDoubleClick={noop} onContextMenu={noop} onConnectStart={noop} onMove={noop} onResize={noop} onRotate={noop}/></g>)}
  </svg>)
}
export async function svgToPng(svg: string): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image(); image.src = url
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Preview rendering failed')) })
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable')
    context.drawImage(image, 0, 0)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}
