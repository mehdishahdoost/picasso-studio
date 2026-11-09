#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createStudioMcp } from './mcp'
import { runtimeError } from './errors'
async function main(){
  const args=process.argv.slice(2),options:Record<string,string>={}
  for(let i=0;i<args.length;i+=2){if(!['--scope','--repo','--harness'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Use mcp.mjs --scope local|global [--repo PATH] [--harness NAME]');options[args[i].slice(2)]=args[i+1]}
  if(options.scope&&!['local','global'].includes(options.scope))throw new Error('Invalid MCP installation scope')
  const {server,cleanup}=createStudioMcp({scope:(options.scope??'global') as 'local'|'global',repository:options.repo,harness:options.harness})
  let closing=false
  const stop=()=>{if(closing)return;closing=true;void cleanup().finally(()=>server.close()).finally(()=>process.exit(0))}
  server.onclose=stop;process.stdin.once('end',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop)
  await server.connect(new StdioServerTransport())
}
main().catch(cause=>{const error=runtimeError(cause);process.stderr.write(JSON.stringify({error:{code:error.code,message:error.message}})+'\n');process.exitCode=1})
