import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { execFileSync } from 'node:child_process'
import { mkdtempSync,rmSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { call } from '../runtime/sessions'
export function testRepo(){const root=mkdtempSync(join(tmpdir(),'studio-mcp-'));execFileSync('git',['init','-q',root]);return root}
export async function mcpClient(options:{repo?:string;executable?:string;env?:Record<string,string>;roots?:string[]}={}){
 const transport=new StdioClientTransport({command:process.execPath,args:[options.executable??resolve('dist-runtime/mcp.mjs'),'--scope',options.repo?'local':'global',...(options.repo?['--repo',options.repo]:[])],env:{...process.env as Record<string,string>,DISPLAY:'',WAYLAND_DISPLAY:'',...options.env},stderr:'pipe'})
 const errors:string[]=[];transport.stderr?.on('data',chunk=>errors.push(chunk.toString()));const client=new Client({name:'studio-test',version:'1.0'},{capabilities:options.roots?{roots:{}}:{}})
 if(options.roots)client.setRequestHandler(ListRootsRequestSchema,async()=>({roots:options.roots!.map(path=>({uri:pathToFileURL(path).href}))}))
 const messages:any[]=[];try{await client.connect(transport)}catch(error){throw new Error(errors.join('')||String(error))};const onMessage=transport.onmessage;transport.onmessage=message=>{messages.push(message);onMessage?.(message)}
 const invoke=async(name:string,args:Record<string,unknown>,signal?:AbortSignal)=>client.callTool({name,arguments:args},undefined,{signal})
 const data=async(name:string,args:Record<string,unknown>)=>(await invoke(name,args)).structuredContent as any
 return {client,transport,invoke,data,errors,messages,close:()=>client.close()}
}
export async function browserSession(url:string){const origin=new URL(url).origin,secret=new URLSearchParams(new URL(url).hash.slice(1)).get('bootstrap');const response=await fetch(origin+'/api/bootstrap',{method:'POST',headers:{origin},body:JSON.stringify({secret})});const cookie=response.headers.get('set-cookie')!.split(';')[0];return {origin,cookie,submit:async(id:string,revision:number)=>fetch(origin+'/api/submit',{method:'POST',headers:{origin,cookie},body:JSON.stringify({requestId:id,baseRevision:revision})}).then(r=>r.json())}}
export async function stopSession(repository:string,sessionId:string){try{await call(repository,sessionId,'stop',{})}catch{}}
export {rmSync}
