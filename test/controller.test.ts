import { expect, it } from 'vitest'
import { MemoryController, StudioController, type Transport } from '../src/studio/controller'
import { applyBatch, newSession } from '../src/studio/protocol'
import { activatePage } from '../src/model'
function fixture() {
  const state = newSession('test','/repo'); state.document.pages = [{id:'home',name:'Home',shapes:[{id:'button',kind:'button',x:0,y:0,width:100,height:40,text:'Submit'}]},{id:'other',name:'Other',shapes:[]}]; state.document.activePageId='home'
  const submitted: any[] = []; const transport: Transport = { read: async () => structuredClone(state), apply: async batch => applyBatch(state, batch), post: async (action, input) => { submitted.push({ action, input }); return {} } }
  const controller = new StudioController(transport); controller.receive(structuredClone(state)); return {state,transport,controller,submitted}
}
it('keeps standalone load and history in memory', () => { const {state} = fixture(); const c = new MemoryController(state.document); const next = structuredClone(c.snapshot.document); next.pages[0].shapes[0].text='User'; c.change(next); c.undo(); expect(c.snapshot.document.pages[0].shapes[0].text).toBe('Submit'); c.redo(); expect(c.snapshot.document.pages[0].shapes[0].text).toBe('User') })
it('sends user changes, receives remote changes without echo and keeps view state local', async () => {
  const {controller:c,state,submitted} = fixture(); c.viewPage('other'); expect(state.revision).toBe(0); expect(state.document.pages[0].id).toBe('home'); expect(activatePage(state.document,'other').pages[0].id).toBe('home')
  const next=structuredClone(c.snapshot.document); next.pages[1].name='Details'; c.change(next); await c.flush(); expect(state.revision).toBe(1)
  applyBatch(state,{requestId:'remote',actorId:'agent',origin:'harness',baseRevision:1,operations:[{type:'update',pageId:'home',id:'button',patch:{text:'Agent'}}]}); c.receive(structuredClone(state)); expect(c.snapshot.document.pages[0].shapes[0].text).toBe('Agent'); expect(c.snapshot.document.activePageId).toBe('other'); expect(state.revision).toBe(2); expect(submitted).toHaveLength(0)
})
it('preserves conflict intent and explicitly reapplies only pending properties', async () => {
  const {controller:c,state} = fixture(); c.disconnected(); const next=structuredClone(c.snapshot.document); next.pages[0].shapes[0].text='User'; c.change(next)
  applyBatch(state,{requestId:'remote',actorId:'agent',origin:'harness',baseRevision:0,operations:[{type:'update',pageId:'home',id:'button',patch:{fill:'#123456',text:'Agent'}}]}); await c.reconnect(); expect(c.snapshot.conflict).toBeTruthy(); expect(c.snapshot.document.pages[0].shapes[0].text).toBe('User'); await expect(c.submit()).rejects.toThrow(/Synchronize/)
  await c.reconcile(true); expect(state.document.pages[0].shapes[0]).toMatchObject({text:'User',fill:'#123456'}); expect(c.snapshot.pending).toBe(0)
})
it('discards pending intent only explicitly and never undoes newer remote work', async () => {
  const {controller:c,state} = fixture(); const next=structuredClone(c.snapshot.document); next.pages[0].shapes[0].text='User'; c.change(next); await c.flush(); applyBatch(state,{requestId:'remote',actorId:'agent',origin:'harness',baseRevision:1,operations:[{type:'update',pageId:'home',id:'button',patch:{text:'Agent'}}]}); c.receive(structuredClone(state)); c.undo(); expect(c.snapshot.conflict).toContain('Undo'); expect(state.document.pages[0].shapes[0].text).toBe('Agent'); await c.reconcile(false); expect(c.snapshot.conflict).toBeNull()
})
it('flushes pending text before submission', async () => { const {controller:c,submitted}=fixture(); const next=structuredClone(c.snapshot.document);next.pages[0].shapes[0].text='Finished';c.change(next); await c.submit(); expect(submitted[0]).toMatchObject({action:'submit',input:{baseRevision:1}}) })

it('normalizes legacy document viewing context and reports invalid edits without crashing the UI',()=>{ const {state,controller:c}=fixture();const legacy={...state.document};delete (legacy as any).activePageId;expect(new MemoryController(legacy).snapshot.document.activePageId).toBe('home');const next=structuredClone(c.snapshot.document);next.pages[0].shapes[0].width=0;expect(()=>c.change(next)).not.toThrow();expect(c.snapshot.conflict).toContain('positive') })
