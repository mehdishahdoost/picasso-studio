import {afterEach,expect,it} from 'vitest'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {chromium,type Browser} from 'playwright-core'
import {mcpClient,stopSession} from './mcp-fixture'
let browser:Browser|undefined
const cleanup:(()=>any)[]=[]
afterEach(async()=>{await browser?.close();browser=undefined;for(const fn of cleanup.splice(0).reverse())await fn()})
it('uses a packed MCP installation for browser collaboration, updates, images and reconnect',async()=>{
 const root=mkdtempSync(join(tmpdir(),'studio-mcp-browser-'));cleanup.push(()=>rmSync(root,{recursive:true,force:true}));const pack=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--pack-destination',root,'--cache',join(root,'cache'),'--json'],{encoding:'utf8'}))[0]
 const extracted=join(root,'extracted');mkdirSync(extracted);execFileSync('tar',['-xzf',join(root,pack.filename),'-C',extracted]);const repo=join(root,'repo with spaces');mkdirSync(repo);execFileSync('git',['init','-q',repo])
 const installed=JSON.parse(execFileSync(process.execPath,[join(extracted,'package','dist-runtime','cli.mjs'),'--harness','codex','--local'],{cwd:repo,encoding:'utf8'}));rmSync(extracted,{recursive:true,force:true})
 const m=await mcpClient({repo,executable:installed.mcpRuntime});cleanup.push(()=>m.close());const pid=m.transport.pid;expect((await m.client.listTools()).tools).toHaveLength(14)
 const opened=await m.data('open_studio',{repository:repo}),binding={repository:repo,sessionId:opened.sessionId};cleanup.push(()=>stopSession(repo,opened.sessionId));expect(opened.browserConnected).toBe(false)
 browser=await chromium.launch({executablePath:process.env.STUDIO_CHROME??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(opened.url);await page.getByRole('button',{name:'Implement',exact:true}).waitFor();await expect.poll(async()=>(await m.data('get_studio_status',binding)).browserConnected).toBe(true)
 await page.getByRole('button',{name:'Add Button',exact:true}).click();const label=page.getByLabel('Label',{exact:true});await label.fill('User MCP draft');await expect.poll(async()=>(await m.data('get_design',binding)).document.pages[0].shapes[0].text).toBe('User MCP draft');expect((await m.data('get_submissions',binding)).submissions).toEqual([])
 await page.getByRole('button',{name:'Implement',exact:true}).click();await expect.poll(async()=>(await m.data('get_submissions',binding)).submissions.length).toBe(1)
 const run=await m.data('attach_implementation',binding),owner={...binding,ownerId:run.ownerId,runId:run.id},a=(await m.data('acknowledge_submission',owner)).submission;const document=await m.data('get_design',binding),pageId=document.document.pages[0].id,id=document.document.pages[0].shapes[0].id
 await m.data('apply_operations',{...binding,batch:{requestId:'mcp-live',actorId:run.ownerId,origin:'harness',baseRevision:document.revision,operations:[{type:'update',pageId,id,patch:{text:'MCP harness edit'}}]}});await expect.poll(()=>label.inputValue()).toBe('MCP harness edit');expect((await m.data('get_submissions',binding)).submissions).toHaveLength(1)
 const svg=await m.data('get_preview',{...binding,pageId,revision:a.documentRevision});expect(svg.data).toContain('User MCP draft');const png=await m.invoke('get_preview',{...binding,pageId,revision:a.documentRevision,format:'png'});expect(png.content.some(block=>block.type==='image'&&block.mimeType==='image/png')).toBe(true)
 await label.fill('Next submitted target');await page.getByRole('button',{name:'Update implementation'}).click();await expect.poll(async()=>(await m.data('get_submissions',binding)).submissions.length).toBe(2);const waiting=await m.data('wait_for_submission',{...binding,after:(await m.data('get_design',binding)).cursor,timeoutMs:0});expect(waiting.submissions[0].sequence).toBe(2)
 await m.data('report_progress',{...owner,submissionId:a.id,status:'complete',message:'Older target finished'});expect((await m.data('get_submissions',binding)).submissions[1].status).toBe('pending');await m.data('acknowledge_submission',owner)
 expect(m.transport.pid).toBe(pid);await m.close();const next=await mcpClient({repo,executable:installed.mcpRuntime});cleanup.push(()=>next.close());expect((await next.data('open_studio',binding)).sessionId).toBe(opened.sessionId);expect((await next.data('get_submissions',binding)).submissions[1].status).toBe('in-progress');await page.reload();await page.getByRole('button',{name:'Update implementation'}).waitFor()
 const other=join(root,'other');mkdirSync(other);execFileSync('git',['init','-q',other]);expect(await next.data('get_design',{repository:other,sessionId:opened.sessionId})).toMatchObject({error:{code:'session_mismatch'}})
 await page.screenshot({path:'/tmp/picasso-studio-mcp-browser.png',fullPage:true});expect(errors).toEqual([])
},30000)
