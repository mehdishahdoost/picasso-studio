# Picasso Studio

Picasso Studio is a local visual design app for coding agents and an embeddable visual editor for web-design wireframes. Create standalone layouts from geometric shapes and web controls, then fine-tune them through a context-sensitive Properties panel.

## Install for a harness

Requires Node 22+ and a local Git repository for local installation and design sessions.

```bash
npx picasso-studio --harness codex --local
npx picasso-studio --harness claude --global
npx picasso-studio --harness devin --local
```

Pass exactly one of `--local` (current repository) or `--global` (current user).
Installation registers both the skill and its harness-managed stdio MCP server.
Reload/discover the MCP registration and approve it using the harness’s normal controls.
Then invoke `$picasso-studio` in Codex or `/picasso-studio` in Claude Code or
Devin CLI. Reload the harness if it has not discovered the skill yet.

The installed skill calls MCP tools to start/reuse the bundled local server and open the production editor in your browser. Every open result includes a URL and verified editor-connection status. Design,
then press **Implement**. User edits stay drafts until **Update implementation**;
agent edits to design objects appear live. The active agent checks for submitted
updates between implementation steps and after checks. Studio runs entirely on
your machine; no hosted Picasso service, account, source checkout, or Vite server
is needed after installation. The runtime remains available after npx cache cleanup.

See [sessions](docs/sessions.md), [the implementation loop](docs/implementation.md),
[the object protocol](docs/protocol.md), [MCP tools](docs/mcp.md), and [harness compatibility](docs/compatibility.md).

Local installs register a repository skill and keep the runtime in
`.picasso-studio/runtime/<version>/`. Global installs keep the runtime in
`~/.picasso-studio/runtime/<version>/`. Installation prints the actual skill and
launcher paths. Re-run installation with a new version to update a managed skill;
user-authored or modified skills are preserved with a conflict error.

To review a package before publication, run `npm pack` and install the resulting
tarball using `npx --package ./picasso-studio-0.2.0.tgz picasso-studio --harness codex --local`.
The npm registry name and publication rights must be verified before release.

## Features

- Geometric shapes: rectangle, circle, triangle, diamond, hexagon, and parallelogram
- Web controls: buttons, text inputs, text areas, checkboxes, radio buttons, comboboxes, toggles, sliders, links, cards, navigation bars, modals, tables, and forms
- Context-sensitive Properties panel with position, size, rotation, opacity, typography, fill, stroke, and control-specific values
- Native color pickers for fill and stroke
- Structured editors for combobox options, navigation items, table rows, and form fields
- Drag-and-drop creation, selection, resizing, rotation, inline text editing, and deletion
- Undo and redo history
- Expandable canvas with a bird's-eye minimap for navigation
- React component and custom-element integration

## Development

```bash
pnpm install
pnpm dev
```

Create a production build with:

```bash
pnpm run build
```

Build first, then run the test suite (including local-server and packed-package browser checks):

```bash
pnpm run build
pnpm test
```

The browser test uses Google Chrome at `/usr/bin/google-chrome`; set `STUDIO_CHROME`
to another Chromium executable if needed. `npm run test:unit` runs pure protocol,
store, controller, and preview tests. Browser and server tests require loopback access.

## React usage

```tsx
import { PicasoEditor } from './Editor'

export function DesignApp() {
  return <PicasoEditor onChange={document => console.log(document)} />
}
```

The editor exposes an API through `onReady`:

```tsx
<PicasoEditor
  onReady={api => {
    api.getDocument()
    api.loadDocument(document)
    api.execute({ type: 'delete', id: 'shape-id' })
    api.exportSvg()
  }}
/>
```

## Custom element usage

The custom element is registered by importing the application entry point:

```ts
import './main'
```

```html
<picasso-editor></picasso-editor>
```

The element exposes the current document through `value` and emits two events:

```js
const editor = document.querySelector('picasso-editor')

editor.addEventListener('picasso-change', event => {
  console.log(event.detail) // PicasoDocument
})

editor.addEventListener('picasso-ready', event => {
  const api = event.detail
  console.log(api.getDocument())
})
```

## Document model

Documents use the `PicasoDocument` model:

```ts
type PicasoDocument = {
  schemaVersion: 1
  documentId: string
  pages: PicasoPage[]
}
```

Each page contains an ordered list of `PicasoShape` objects. Persist the object received from `picasso-change` and supply it again through the React `initialDocument` prop or the custom-element `value` property.
