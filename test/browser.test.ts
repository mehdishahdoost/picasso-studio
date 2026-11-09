import { afterEach, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
let browser: Browser | undefined
const cleanup: (() => void)[]=[]
afterEach(async()=>{await browser?.close();browser=undefined;for(const fn of cleanup.splice(0).reverse())fn()})
it('runs a packed installation through bidirectional editing and update handoff in a real browser',async()=>{
  const root=mkdtempSync(join(tmpdir(),'studio-browser-'));cleanup.push(()=>rmSync(root,{recursive:true,force:true}))
  const pack=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--pack-destination',root,'--cache',join(root,'npm-cache'),'--json'],{encoding:'utf8'}))[0]
  const extracted=join(root,'extracted');mkdirSync(extracted);execFileSync('tar',['-xzf',join(root,pack.filename),'-C',extracted]);const packageRoot=join(extracted,'package')
  expect(existsSync(join(packageRoot,'src'))).toBe(false);expect(JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8')).dependencies).toBeUndefined()
  const repo=join(root,'repository with spaces');mkdirSync(repo);execFileSync('git',['init','-q',repo])
  const original=join(packageRoot,'dist-runtime','cli.mjs')
  const installed=JSON.parse(execFileSync(process.execPath,[original,'--harness','codex','--local'],{cwd:repo,encoding:'utf8'}))
  rmSync(extracted,{recursive:true,force:true})
  const run=(args:string[])=>JSON.parse(execFileSync(process.execPath,[installed.runtime,...args],{cwd:repo,encoding:'utf8',timeout:15000}))
  const opened=run(['session','open','--repo',repo,'--no-open']);const base=['--repo',repo,'--session',opened.sessionId]
  cleanup.push(()=>{try{run(['session','stop',...base])}catch{}})
  const bridge=(action:string,input?:any,extra:string[]=[])=>{const args=['bridge',action,...base,...extra];if(input){const file=join(root,'bridge input.json');writeFileSync(file,JSON.stringify(input));args.push('--input',file)}return run(args)}
  const other=join(root,'other-repository');mkdirSync(other);execFileSync('git',['init','-q',other]);const otherSession=run(['session','open','--repo',other,'--no-open']);cleanup.push(()=>{try{run(['session','stop','--repo',other,'--session',otherSession.sessionId])}catch{}})
  browser=await chromium.launch({executablePath:process.env.STUDIO_CHROME??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto(opened.url);await page.getByRole('button',{name:'Implement',exact:true}).waitFor();await expect.poll(()=>run(['session','status',...base]).browserConnected).toBe(true);await page.getByRole('button',{name:'Add Button',exact:true}).click()
  await expect.poll(()=>bridge('document').document.pages[0].shapes.length).toBe(1)
  const label=page.getByLabel('Label',{exact:true});await label.fill('User draft');await expect.poll(()=>bridge('document').document.pages[0].shapes[0].text).toBe('User draft')
  expect(bridge('submissions').submissions).toEqual([])
  await page.getByRole('button',{name:'Implement',exact:true}).click();await expect.poll(()=>bridge('submissions').submissions.length).toBe(1)
  const a=bridge('submissions').submissions[0],runInfo=bridge('attach',{ownerId:'browser-test'}),owner={ownerId:'browser-test',runId:runInfo.id};bridge('acknowledge',owner)
  const doc=bridge('document'),shape=doc.document.pages[0].shapes[0],pageId=doc.document.pages[0].id
  bridge('apply',{requestId:'live-agent',actorId:'browser-test',origin:'harness',baseRevision:doc.revision,operations:[{type:'update',pageId,id:shape.id,patch:{text:'Harness live'}}]})
  await expect.poll(()=>label.inputValue()).toBe('Harness live');expect(bridge('submissions').submissions.length).toBe(1)
  expect(bridge('preview',undefined,['--page',pageId,'--revision',String(a.documentRevision)]).data).toContain('User draft')
  expect(bridge('preview',undefined,['--page',pageId,'--revision',String(a.documentRevision),'--format','png'])).toMatchObject({available:true,format:'png',revision:a.documentRevision})
  await label.fill('Second submission');await page.getByRole('button',{name:'Update implementation'}).click();await expect.poll(()=>bridge('submissions').submissions.length).toBe(2)
  bridge('progress',{...owner,submissionId:a.id,status:'complete',message:'Finished first'})
  expect(bridge('submissions').submissions[1].status).toBe('pending');await expect.poll(()=>page.locator('.studio-toolbar').innerText()).toContain('1 pending submission')
  const b=bridge('acknowledge',owner).submission;expect(b.sequence).toBe(2)
  await context.setOffline(true)
  await expect.poll(()=>page.locator('.studio-toolbar').innerText(),{timeout:6000}).toContain('Disconnected')
  await page.getByRole('button',{name:'Add Rectangle',exact:true}).click()
  const remote=bridge('document');bridge('apply',{requestId:'offline-remote',actorId:'browser-test',origin:'harness',baseRevision:remote.revision,operations:[{type:'update',pageId,id:shape.id,patch:{text:'Remote during disconnect'}}]})
  await context.setOffline(false)
  await expect.poll(()=>page.locator('.studio-conflict').count(),{timeout:10000}).toBe(1)
  await page.getByRole('button',{name:'Retry preserved edits'}).click()
  await expect.poll(()=>bridge('document').document.pages[0].shapes.length).toBe(2)
  expect(bridge('document').document.pages[0].shapes.find((s:any)=>s.id===shape.id).text).toBe('Remote during disconnect')
  await expect.poll(()=>page.locator('.studio-conflict').count()).toBe(0)
  const png=await page.screenshot({path:'/tmp/picasso-studio-browser.png',fullPage:true});expect(png.length).toBeGreaterThan(1000)
  expect(run(['bridge','document','--repo',other,'--session',otherSession.sessionId]).document.pages[0].shapes).toEqual([])
  await page.reload();await page.getByRole('button',{name:'Update implementation'}).waitFor();expect(bridge('document').revision).toBeGreaterThan(0)
  const embedded=await page.evaluate(async()=>{
    const element=document.createElement('picasso-editor') as any
    const doc={schemaVersion:1,documentId:'embedded-document',activePageId:'embedded-page',pages:[{id:'embedded-page',name:'Embedded',shapes:[]}]}
    element.value=doc
    const api=await new Promise<any>(resolve=>{element.addEventListener('picasso-ready',(event:any)=>resolve(event.detail),{once:true});document.body.append(element)})
    api.execute({type:'add',shape:{id:'embedded-button',kind:'button',x:0,y:0,width:100,height:40,text:'Embed'}})
    await new Promise(resolve=>requestAnimationFrame(resolve))
    const count=api.getDocument().pages[0].shapes.length, svg=api.exportSvg()
    element.value={...doc,documentId:'loaded-document'}
    const loaded=api.getDocument().documentId, value=element.value.documentId
    element.remove()
    return {count,svg,loaded,value}
  })
  expect(embedded).toMatchObject({count:1,loaded:'loaded-document',value:'loaded-document'});expect(embedded.svg).toContain('Embed')
  expect(errors).toEqual([])
},45000)
