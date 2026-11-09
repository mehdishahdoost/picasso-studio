import { createRoot, type Root } from 'react-dom/client'
import { PicasoEditor, type EditorApi } from './Editor'
import { createDocument, type PicasoDocument } from './model'
class PicassoElement extends HTMLElement {
  root?: Root
  api?: EditorApi
  documentValue: PicasoDocument = createDocument()
  connectedCallback() {
    this.root = createRoot(this)
    this.root.render(<PicasoEditor initialDocument={this.documentValue}
      onChange={document => { this.documentValue = document; this.dispatchEvent(new CustomEvent('picasso-change', { detail: document })) }}
      onReady={api => { this.api = api; this.dispatchEvent(new CustomEvent('picasso-ready', { detail: api })) }} />)
  }
  disconnectedCallback() { this.root?.unmount(); this.root = undefined; this.api = undefined }
  set value(document: PicasoDocument) { this.documentValue = document; this.api?.loadDocument(document) }
  get value() { return this.api?.getDocument() ?? this.documentValue }
}
customElements.define('picasso-editor', PicassoElement)
