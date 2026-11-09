import { expect, it } from 'vitest'
import { renderPageSvg } from '../src/studio/preview'
import { newSession } from '../src/studio/protocol'
it('renders immutable and inactive pages independently of editor state', () => {
  const state = newSession('s','/repo'); state.document.pages.push({ id:'other',name:'Other',shapes:[{id:'button',kind:'button',x:0,y:0,width:160,height:40,text:'Original'}] })
  const snapshot=structuredClone(state.document);state.document.pages[1].shapes[0].text='Draft'
  expect(renderPageSvg(snapshot,'other')).toContain('Original'); expect(renderPageSvg(snapshot,'other')).not.toContain('Draft'); expect(renderPageSvg(state.document,'other')).toContain('Draft');expect(() => renderPageSvg(snapshot,'missing')).toThrow()
})

it('renders advertised geometry and appearance properties',()=>{const s=newSession('s','/repo');const page=s.document.pages[0];page.shapes.push({id:'rotated',kind:'triangle',x:0,y:0,width:100,height:40,rotation:45,opacity:0.5,strokeWidth:3});const svg=renderPageSvg(s.document,page.id);expect(svg).toContain('rotate(45 50 20)');expect(svg).toContain('opacity="0.5"');expect(svg).toContain('stroke-width="3"')})
