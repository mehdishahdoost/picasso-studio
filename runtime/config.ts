import { readFileSync,existsSync } from 'node:fs'
import { join,resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parseForESLint,getStaticTOMLValue } from 'toml-eslint-parser'
import { parse as parseJson,parseTree,modify,applyEdits,type ParseError } from 'jsonc-parser'
import { fail } from '../src/studio/protocol'
const parseToml=(text:string):any=>getStaticTOMLValue(parseForESLint(text).ast)
export type McpTarget={path:string;format:'toml'|'json';key:string}
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const readText=(path:string)=>existsSync(path)?readFileSync(path,'utf8'):''
export function configTarget(harness:string,local:boolean,root:string,home:string,env:NodeJS.ProcessEnv=process.env):McpTarget{
 if(harness==='codex')return {path:local?join(root,'.codex','config.toml'):join(env.CODEX_HOME??join(home,'.codex'),'config.toml'),format:'toml',key:'mcp_servers.picasso-studio'}
 if(harness==='claude')return {path:local?join(root,'.mcp.json'):env.CLAUDE_CONFIG_DIR?join(resolve(env.CLAUDE_CONFIG_DIR),'.claude.json'):join(home,'.claude.json'),format:'json',key:'mcpServers.picasso-studio'}
 const directory=process.platform==='win32'?join(env.APPDATA??join(home,'AppData','Roaming'),'devin'):join(env.XDG_CONFIG_HOME??join(home,'.config'),'devin')
 return {path:local?join(root,'.devin','mcp_config.json'):join(directory,'mcp_config.json'),format:'json',key:'mcpServers.picasso-studio'}
}
function jsonDocument(text:string):any{
 const errors:ParseError[]=[],value=parseJson(text||'{}',errors,{allowTrailingComma:true,disallowComments:false})
 if(errors.length||!value||typeof value!=='object'||Array.isArray(value))fail('invalid_config','MCP configuration must be a valid object')
 const tree=parseTree(text||'{}')
 function duplicates(node:any){if(!node)return;if(node.type==='object'){const keys=new Set();for(const property of node.children??[]){const name=property.children[0].value;if(keys.has(name))fail('invalid_config','Duplicate configuration key');keys.add(name)}}for(const child of node.children??[])duplicates(child)}duplicates(tree)
 return value
}
export function readEntry(text:string,target:McpTarget):any{
 try{const doc=target.format==='toml'?parseToml(text):jsonDocument(text),group=doc[target.format==='toml'?'mcp_servers':'mcpServers'];if(group!==undefined&&(!group||typeof group!=='object'||Array.isArray(group)))fail('invalid_config','MCP server collection must be an object');return group?.['picasso-studio']??null}
 catch(error:any){if(error.code==='invalid_config')throw error;return fail('invalid_config','Cannot parse the harness MCP configuration')}
}
const starts=(path:any[],prefix:string[])=>prefix.every((value,index)=>path[index]===value)
const inline=(value:any):string=>Array.isArray(value)?`[${value.map(inline).join(', ')}]`:value&&typeof value==='object'?`{${Object.entries(value).map(([key,value])=>`${JSON.stringify(key)} = ${inline(value)}`).join(', ')}}`:JSON.stringify(value)
export function writeEntry(text:string,target:McpTarget,entry:any):string{
 readEntry(text,target)
 if(target.format==='json')return applyEdits(text||'{}',modify(text||'{}',['mcpServers','picasso-studio'],entry??undefined,{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}))+'\n'
 const ast=parseForESLint(text).ast,desired=['mcp_servers','picasso-studio'],deletions:[number,number][]=[]
 for(const node of ast.body[0].body){
  const base=node.type==='TOMLTable'?node.resolvedKey:[]
  if(node.type==='TOMLTable'&&starts(base,desired)){deletions.push(node.range);continue}
  const pairs=node.type==='TOMLTable'?node.body:[node]
  for(const pair of pairs){
   const path=[...base,...pair.key.keys.map((key:any)=>key.name??key.value)]
   if(path.length===1&&path[0]==='mcp_servers'&&pair.value.type==='TOMLInlineTable'){
    const children=pair.value.body,existing=children.find((child:any)=>child.key.keys.length===1&&(child.key.keys[0].name??child.key.keys[0].value)==='picasso-studio')
    if(existing){
     if(entry!==null)return text.slice(0,existing.value.range[0])+inline(entry)+text.slice(existing.value.range[1])
     const index=children.indexOf(existing),start=index?children[index-1].range[1]:existing.range[0],end=index===0&&children.length>1?children[1].range[0]:existing.range[1]
     return text.slice(0,start)+text.slice(end)
    }
    if(entry===null)return text
    const at=pair.value.range[1]-1
    return text.slice(0,at)+(children.length?', ':'')+`"picasso-studio" = ${inline(entry)}`+text.slice(at)
   }
   if(path.length===desired.length&&starts(path,desired)&&entry!==null)return text.slice(0,pair.value.range[0])+inline(entry)+text.slice(pair.value.range[1])
   if(starts(path,desired))deletions.push(pair.range)
  }
 }
 let next=text
 for(const [start,end] of deletions.sort((a,b)=>b[0]-a[0]))next=next.slice(0,start)+next.slice(end)
 if(entry!==null)next+='\n[mcp_servers.\"picasso-studio\"]\n'+Object.entries(entry).map(([key,value])=>`${JSON.stringify(key)} = ${inline(value)}`).join('\n')+'\n'
 // Verify that unusual valid TOML layouts did not change the intended meaning.
 const parsed=readEntry(next,target)
 if(fingerprint(parsed)!==fingerprint(entry))fail('invalid_config','Cannot safely update this TOML server entry')
 return next
}
