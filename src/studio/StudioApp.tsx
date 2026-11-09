import { useEffect, useState, useSyncExternalStore } from 'react'
import { PicasoEditor } from '../Editor'
import { browserTransport, StudioController } from './controller'
import { svgToPng } from './preview'

export function StudioRoot() {
  const [controller, setController] = useState<StudioController>(), [standalone, setStandalone] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const transport = browserTransport()
        const secret = new URLSearchParams(location.hash.slice(1)).get('bootstrap')
        if (secret) { await transport.post('bootstrap', { secret }); history.replaceState(null, '', location.pathname) }
        const response = await fetch('/api/document')
        if (!response.headers.get('content-type')?.includes('application/json')) { if (!cancelled) setStandalone(true); return }
        const session = await response.json()
        if (!response.ok) throw new Error(session.error?.message ?? 'Could not connect to Studio')
        const next = new StudioController(transport); next.receive(session)
        if (!cancelled) setController(next)
      } catch (error: any) { if (!cancelled) setError(error.message) }
    })()
    return () => { cancelled = true }
  }, [])
  if (standalone) return <PicasoEditor />
  if (error) return <div className="studio-loading"><h1>Picasso Studio</h1><p role="alert">{error}</p><p>Use the skill or session attach command to generate a fresh browser link.</p><button onClick={() => location.reload()}>Retry connection</button></div>
  if (!controller) return <div className="studio-loading">Opening Picasso Studio...</div>
  return <ConnectedStudio controller={controller} />
}
function ConnectedStudio({ controller }: { controller: StudioController }) {
  const state = useSyncExternalStore(controller.subscribe, () => controller.snapshot)
  const [error, setError] = useState(''), [submitting, setSubmitting] = useState(false), [now, setNow] = useState(Date.now())
  useEffect(() => {
    const transport = browserTransport(), stream = new EventSource('/api/stream')
    stream.addEventListener('state', event => { if (navigator.onLine) controller.receive(JSON.parse((event as MessageEvent).data)) })
    stream.addEventListener('preview', event => {
      const request = JSON.parse((event as MessageEvent).data)
      void svgToPng(request.svg).then(data => transport.post('preview-result', { requestId: request.requestId, data })).catch(() => transport.post('preview-result', { requestId: request.requestId }))
    })
    stream.onerror = () => controller.disconnected()
    const offline = () => controller.disconnected(), online = () => { void controller.reconnect() }
    window.addEventListener('offline', offline); window.addEventListener('online', online)
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => { clearInterval(timer); stream.close(); window.removeEventListener('offline', offline); window.removeEventListener('online', online) }
  }, [controller])
  const session = state.session, run = session?.run, submissions = session?.submissions ?? []
  const target = submissions.find((s: any) => s.id === run?.targetSubmissionId), pending = submissions.filter((s: any) => s.status === 'pending')
  const latest = submissions.at(-1), dirty = !latest || state.revision !== latest.documentRevision || state.pending > 0
  const ownerConnected = run && run.leaseExpiry > now
  const submit = async () => {
    // Blurring commits an in-progress inline text edit before the queue is flushed.
    ;(document.activeElement as HTMLElement | null)?.blur()
    setSubmitting(true); setError('')
    try { await controller.submit() } catch (error: any) { setError(error.message) } finally { setSubmitting(false) }
  }
  return <div className="studio-shell">
    <div className="studio-toolbar" aria-label="Studio collaboration">
      <span className={state.connected ? 'connection online' : 'connection offline'}>{state.connected ? 'Connected' : 'Disconnected'}</span>
      <span>{ownerConnected ? 'Agent connected' : 'Agent disconnected'}</span>
      <span>Draft r{state.revision}{dirty ? ' · Unsubmitted changes' : ' · Submitted'}{state.pending ? ` · ${state.pending} unsynchronized` : ''}</span>
      {target && <span>Submission {target.sequence}: {target.status} (r{target.documentRevision})</span>}
      {!!pending.length && <span>{pending.length} pending submission{pending.length === 1 ? '' : 's'}</span>}
      {run?.message && <span className="studio-progress">{run.message}</span>}
      <button className="implement-button" onMouseDown={event => event.preventDefault()} onClick={() => void submit()} disabled={!state.connected || !!state.conflict || submitting}>{submitting ? 'Submitting...' : submissions.length ? 'Update implementation' : 'Implement'}</button>
      {!state.connected && <button onClick={() => void controller.reconnect()}>Reconnect</button>}
    </div>
    {(state.conflict || error) && <div className="studio-conflict" role="alert">
      <span>{state.conflict ?? error}</span>
      {state.conflict && <><button onClick={() => void controller.reconcile(true)}>Retry preserved edits</button><button onClick={() => void controller.reconcile(false)}>Discard unsent edits</button><details><summary>Inspect latest and unsent changes</summary><pre>{JSON.stringify({ latest: state.session?.document, preserved: state.document }, null, 2)}</pre></details></>}
    </div>}
    <PicasoEditor controller={controller} />
  </div>
}
