import { existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync } from 'node:fs'
import { dirname,join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicJson } from './store'
import { fingerprint,readEntry,readText,writeEntry,type McpTarget } from './config'
import { fail } from '../src/studio/protocol'
export function atomicText(path:string,text:string){const temporary=`${path}.${randomUUID()}.tmp`;writeFileSync(temporary,text,{mode:0o600});renameSync(temporary,path)}
function restoreFile(path:string,previous:string|null){if(previous===null)rmSync(path,{force:true});else atomicText(path,previous)}
export function recoverRegistration(skillDir:string,target:McpTarget){
 const journalFile=join(skillDir,'picasso-install-journal.json');if(!existsSync(journalFile))return
 const journal=JSON.parse(readFileSync(journalFile,'utf8'))
 if(journal.target.path!==target.path||journal.target.format!==target.format)fail('recovery_required','Finish the interrupted registration at its original config location')
 if(journal.phase==='committed'){rmSync(journalFile);return}
 const config=readText(target.path),current=readEntry(config,target)
 if(fingerprint(current)!==fingerprint(journal.afterEntry)&&fingerprint(current)!==fingerprint(journal.beforeEntry))fail('recovery_required','The managed MCP entry changed during installation; preserve it and resolve the saved installation journal')
 const skill=readText(join(skillDir,'SKILL.md'))
 if(skill!==journal.afterSkill&&skill!==(journal.beforeSkill??''))fail('recovery_required','The skill changed during installation; resolve the saved installation journal')
 atomicText(target.path,writeEntry(config,target,journal.beforeEntry))
 restoreFile(join(skillDir,'SKILL.md'),journal.beforeSkill)
 restoreFile(join(skillDir,'picasso-managed.json'),journal.beforeManifest)
 rmSync(journalFile)
}
export function registerIntegration(input:{skillDir:string;target:McpTarget;originalConfig:string;entry:any;skill:string;manifest:any;checkpoint?:(phase:string)=>void}){
 const {skillDir,target}=input
 if(readText(target.path)!==input.originalConfig)fail('config_changed','Harness config changed while staging; retry installation')
 const skillFile=join(skillDir,'SKILL.md'),manifestFile=join(skillDir,'picasso-managed.json'),journalFile=join(skillDir,'picasso-install-journal.json')
 mkdirSync(skillDir,{recursive:true});mkdirSync(dirname(target.path),{recursive:true})
 const journal={phase:'pending',target,beforeEntry:readEntry(input.originalConfig,target),afterEntry:input.entry,beforeSkill:existsSync(skillFile)?readText(skillFile):null,afterSkill:input.skill,beforeManifest:existsSync(manifestFile)?readText(manifestFile):null}
 atomicJson(journalFile,journal)
 try{
  atomicText(target.path,writeEntry(input.originalConfig,target,input.entry));input.checkpoint?.('config')
  atomicText(skillFile,input.skill);input.checkpoint?.('skill')
  atomicJson(manifestFile,input.manifest);input.checkpoint?.('manifest')
  // Concurrent unrelated changes are allowed; the managed entry must still match.
  if(fingerprint(readEntry(readText(target.path),target))!==fingerprint(input.entry)||readText(skillFile)!==input.skill)fail('config_changed','Managed registration changed before commit')
  atomicJson(journalFile,{...journal,phase:'committed'});rmSync(journalFile)
 }catch(error){recoverRegistration(skillDir,target);throw error}
}
