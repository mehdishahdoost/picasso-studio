import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema, type Tool, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { fileURLToPath } from 'node:url'
import { relative, isAbsolute,sep } from 'node:path'
import {realpathSync} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { bindRepository, call, listSessions, openStudio, runtimeVersion, sessionStatus } from './sessions'
import { schemas, validate, fail, StudioError } from '../src/studio/protocol'
import { runtimeError } from './errors'
const textSchema = { type:'string',minLength:1 }, integerSchema={type:'integer',minimum:0}
const binding = { repository: textSchema, sessionId: textSchema }
const owner = { ownerId:textSchema,runId:textSchema }
const object = (properties:Record<string,any>,required=Object.keys(properties)) => ({type:'object' as const,properties,required,additionalProperties:false})
function tool(name:string,description:string,inputSchema:any,readOnly=true):Tool {return {name,description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:false}}}
export const tools:Tool[]=[
  tool('open_studio','Start/reuse local Picasso Studio and open its editor. Always show its URL; check browserConnected before waiting.',object({repository:textSchema,sessionId:textSchema},['repository']),false),
  tool('list_studio_sessions','List persistent sessions in the current repository.',object({repository:textSchema})),
  tool('get_studio_status','Read server/editor/agent connection state and runtime/scope.',object(binding)),
  tool('get_design','Read the shared draft with revision and stable page/object IDs. Draft visibility is not an implementation submission.',object(binding)),
  tool('get_selection','Read the current browser selection.',object(binding)),
  tool('apply_operations','Edit design objects live using an atomic page-qualified batch. Does not submit for implementation. Reconcile revision_conflict before retrying.',object({...binding,batch:schemas.batch}),false),
  tool('get_preview','Read a visual reference for an exact page/revision. PNG needs a connected browser renderer.',object({...binding,pageId:textSchema,revision:integerSchema,format:{enum:['svg','png']}},['repository','sessionId','pageId','revision'])),
  tool('get_submissions','List submission metadata, or read an immutable implementation snapshot by submissionId.',object({...binding,submissionId:textSchema},['repository','sessionId'])),
  tool('attach_implementation','Acquire a single-owner implementation lease for this MCP connection.',object({...binding,ownerId:textSchema},['repository','sessionId']),false),
  tool('heartbeat_implementation','Renew this connection\'s implementation lease.',object({...binding,...owner}),false),
  tool('acknowledge_submission','Acknowledge the newest pending submission and supersede older pending targets.',object({...binding,...owner,submissionId:textSchema},['repository','sessionId','ownerId','runId']),false),
  tool('report_progress','Report in-progress, complete or failed for the exact acknowledged submission/run.',object({...binding,...schemas.progress.properties}),false),
  tool('detach_implementation','Release only the implementation lease held by this MCP connection.',object({...binding,...owner}),false),
  tool('wait_for_submission','Wait up to 25 seconds for submitted instructions. Resume using cursor; never implement draft events. Returns immediately when editor disconnected and nothing pending.',object({...binding,after:integerSchema,timeoutMs:{type:'integer',minimum:0,maximum:25000},ownerId:textSchema,runId:textSchema},['repository','sessionId']),false)
]
export function createStudioMcp(options:{scope:'local'|'global';repository?:string;harness?:string}) {
  if(options.scope==='local'&&!options.repository)fail('invalid_operation','Local MCP registration requires --repo')
  const server=new Server({name:'picasso-studio',version:runtimeVersion},{capabilities:{tools:{}},instructions:'Use open_studio to open the editor. Always show its URL. Implement immutable submissions only; harness object edits are live draft changes. Check pending submissions before each implementation step and after checks.'})
  const owned=new Map<string,{repository:string;sessionId:string;ownerId:string;runId:string}>(),connectionOwner=`mcp-${randomUUID()}`,shutdown=new AbortController()
  const key=(args:any)=>`${args.repository}\0${args.sessionId}`
  const requireOwned=(args:any)=>{const held=owned.get(key(args));if(!held||held.ownerId!==args.ownerId||held.runId!==args.runId)fail('owner_conflict','Attach implementation ownership on this MCP connection first')}
  const asResult=(result:any,content?:CallToolResult['content']):CallToolResult=>({content:content??[{type:'text',text:JSON.stringify(result)}],structuredContent:result})
  async function invoke(name:string,args:any,signal:AbortSignal):Promise<CallToolResult> {
    const repo=bindRepository(args.repository,options.repository)
    args={...args,repository:repo}
    if(server.getClientCapabilities()?.roots){
      const {roots}=await server.listRoots()
      const contained=roots.some(root=>{try{const path=realpathSync(fileURLToPath(root.uri)),rel=relative(path,repo);return !rel||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))}catch{return false}})
      if(!contained)fail('session_mismatch','Repository is outside the workspace roots advertised by this harness')
    }
    if(name==='open_studio')return asResult(await openStudio({...args,restrictedRepo:options.repository,scope:options.scope,harness:options.harness},signal))
    if(name==='list_studio_sessions')return asResult(await listSessions(repo))
    const request=(action:string,input?:unknown,query='')=>call(repo,args.sessionId,action,input,query,signal)
    if(name==='get_studio_status')return asResult(await sessionStatus(repo,args.sessionId,options.scope))
    if(name==='get_design')return asResult(await request('document'))
    if(name==='get_selection')return asResult(await request('selection'))
    if(name==='apply_operations')return asResult(await request('apply',args.batch))
    if(name==='get_preview'){
      const query=new URLSearchParams({page:args.pageId,revision:String(args.revision),format:args.format??'svg'})
      const result=await request('preview',undefined,`?${query}`)
      return result.available&&result.format==='png' ? asResult({...result,data:undefined},[{type:'image',mimeType:'image/png',data:result.data.split(',')[1]},{type:'text',text:JSON.stringify({pageId:result.pageId,revision:result.revision,format:'png'})}]) : asResult(result)
    }
    if(name==='get_submissions'){
      const result=await request('submissions')
      if(args.submissionId){const submission=result.submissions.find((s:any)=>s.id===args.submissionId);if(!submission)fail('not_found','Submission not found');return asResult({submission})}
      return asResult({submissions:result.submissions.map(({document,...metadata}:any)=>metadata)})
    }
    if(name==='attach_implementation'){
      const before=await request('document'),ownerId=args.ownerId??connectionOwner
      if(before.run?.leaseExpiry>Date.now()&&!owned.has(key(args)))fail('owner_conflict','Another connection already owns implementation',{ownerId:before.run.ownerId})
      const run=await request('attach',{ownerId});owned.set(key(args),{repository:repo,sessionId:args.sessionId,ownerId,runId:run.id});return asResult(run)
    }
    if(name==='wait_for_submission'){
      if(args.ownerId||args.runId){requireOwned(args);await request('heartbeat',{ownerId:args.ownerId,runId:args.runId})}
      let cursor=args.after??0
      const deadline=Date.now()+(args.timeoutMs??20000)
      while(true){
        signal.throwIfAborted()
        const [submissions,status]=await Promise.all([request('submissions'),request('status')])
        const pending=submissions.submissions.filter((s:any)=>s.status==='pending').map(({document,...metadata}:any)=>metadata)
        const events=await request('events',undefined,`?after=${cursor}&wait=0`);cursor=events.cursor
        const submitted=events.events.filter((event:any)=>event.type==='implementation.submitted')
        if(pending.length||submitted.length||!status.browserConnected||Date.now()>=deadline)return asResult({events:submitted,submissions:pending,cursor,editorConnected:status.browserConnected,reason:pending.length?'pending':!status.browserConnected?'editor_disconnected':'timeout'})
        const remaining=Math.max(0,(deadline-Date.now())/1000)
        const next=await request('events',undefined,`?after=${cursor}&wait=${Math.min(1,remaining)}`)
        // Keep new events visible on the next pass; only advance past already inspected events.
        if(!next.events.length)cursor=next.cursor
      }
    }
    requireOwned(args)
    const input={...args};delete input.repository;delete input.sessionId
    const actions:Record<string,string>={heartbeat_implementation:'heartbeat',acknowledge_submission:'acknowledge',report_progress:'progress',detach_implementation:'detach'}
    const result=await request(actions[name],input)
    if(name==='detach_implementation')owned.delete(key(args))
    return asResult(result)
  }
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}))
  server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
    try{
      const definition=tools.find(tool=>tool.name===request.params.name)
      if(!definition)fail('not_found','Unknown Studio tool')
      const args=request.params.arguments??{};validate(definition!.inputSchema,args)
      return await invoke(request.params.name,args,AbortSignal.any([extra.signal,shutdown.signal]))
    }catch(cause){const error=(extra.signal.aborted||shutdown.signal.aborted)?new StudioError('cancelled','Tool call cancelled'):runtimeError(cause);return {isError:true,content:[{type:'text',text:JSON.stringify({error:{code:error.code,message:error.message,details:error.details}})}],structuredContent:{error:{code:error.code,message:error.message,details:error.details}}}}
  })
  let closing:Promise<void>|undefined
  const cleanup=()=>closing??=(async()=>{shutdown.abort();await Promise.allSettled([...owned.values()].map(lease=>call(lease.repository,lease.sessionId,'detach',{ownerId:lease.ownerId,runId:lease.runId})));owned.clear()})()
  return {server,cleanup}
}
