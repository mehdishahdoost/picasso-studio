import { afterEach, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bindRepository, call, listSessions, openStudio, sessionStatus } from '../runtime/sessions'
const roots:string[]=[],sessions:{repository:string;sessionId:string}[]=[]
function repo(){const root=mkdtempSync(join(tmpdir(),'studio-shared-'));roots.push(root);execFileSync('git',['init','-q',root]);return root}
async function open(repository:string,reuse=true){const result=await openStudio({repository,noOpen:true,reuse,scope:'global'});sessions.push({repository,sessionId:result.sessionId});return result}
afterEach(async()=>{for(const s of sessions.splice(0)){try{await call(s.repository,s.sessionId,'stop',{})}catch{}}roots.splice(0).forEach(root=>rmSync(root,{recursive:true,force:true}))})
it('imports shared lifecycle without executing the CLI',async()=>{const write=vi.spyOn(process.stdout,'write');await import('../runtime/sessions');expect(write).not.toHaveBeenCalled();write.mockRestore()})
it('serializes simultaneous opens and reuses only an unambiguous session',async()=>{const repository=repo();const [a,b]=await Promise.all([open(repository),open(repository)]);expect(a.sessionId).toBe(b.sessionId);expect((await listSessions(repository)).sessions).toHaveLength(1);await open(repository,false);await expect(openStudio({repository,noOpen:true})).rejects.toMatchObject({code:'session_selection_required'})})
it('binds local installations but allows explicit global repository sessions',async()=>{const a=repo(),b=repo();expect(()=>bindRepository(b,a)).toThrow(/restricted/);expect(()=>bindRepository('relative')).toThrow(/absolute/);const first=await open(a),second=await open(b);expect(first.sessionId).not.toBe(second.sessionId);expect(await sessionStatus(a,first.sessionId,'global')).toMatchObject({serverReady:true,browserConnected:false,installationScope:'global'});await expect(call(b,first.sessionId,'document')).rejects.toMatchObject({code:'not_found'})})
it('restarts stale descriptors and cancels waiting HTTP requests',async()=>{const repository=repo(),opened=await open(repository);await call(repository,opened.sessionId,'stop',{});await new Promise(resolve=>setTimeout(resolve,30));const restored=await open(repository);expect(restored.sessionId).toBe(opened.sessionId);const abort=new AbortController();const wait=call(repository,opened.sessionId,'events',undefined,'?after=0&wait=25',abort.signal);setTimeout(()=>abort.abort(),30);await expect(wait).rejects.toMatchObject({code:'cancelled'});expect((await call(repository,opened.sessionId,'document')).revision).toBe(0)})
