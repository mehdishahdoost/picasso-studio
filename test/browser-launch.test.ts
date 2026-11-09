import { afterEach, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { tmpdir } from 'node:os'
import { openBrowser } from '../runtime/browser'
import { isPermissionError, runtimeError } from '../runtime/errors'
const roots: string[]=[]
afterEach(()=>{vi.unstubAllEnvs();roots.splice(0).forEach(root=>rmSync(root,{recursive:true,force:true}))})
function opener(script:string) {const root=mkdtempSync(join(tmpdir(),'studio-opener-'));roots.push(root);const file=join(root,'xdg-open');writeFileSync(file,'#!/bin/sh\n'+script);chmodSync(file,0o755);vi.stubEnv('PATH',root+delimiter+process.env.PATH);vi.stubEnv('DISPLAY',':test');vi.stubEnv('WAYLAND_DISPLAY','')}
it('does not call a successful desktop opener a connected editor',async()=>{opener('exit 0\n');expect(await openBrowser('http://127.0.0.1:1234')).toMatchObject({status:'requested',exitCode:0})})
it('reports timeout as unconfirmed, never success',async()=>{opener('sleep 1\n');expect(await openBrowser('http://127.0.0.1:1234',20)).toMatchObject({status:'unconfirmed'})})
it('preserves useful launch diagnostics while redacting the browser link',async()=>{opener('echo "cannot open $1" >&2\nexit 4\n');const result=await openBrowser('http://127.0.0.1:1234/#bootstrap=secret');expect(result).toMatchObject({status:'failed',exitCode:4});expect(result.diagnostic).toBe('cannot open [Studio URL]')})
it('reports a missing graphical desktop without claiming launch',async()=>{vi.stubEnv('DISPLAY','');vi.stubEnv('WAYLAND_DISPLAY','');expect(await openBrowser('http://127.0.0.1:1234')).toMatchObject({status:'unavailable'})})
it('distinguishes sandbox denial from server death, including nested fetch failures',()=>{const cause=new Error('fetch failed',{cause:Object.assign(new Error('connect EPERM 127.0.0.1'),{code:'EPERM'})});expect(isPermissionError(cause)).toBe(true);expect(runtimeError(cause)).toMatchObject({code:'permission_required',details:{retrySameCommand:true}});expect(isPermissionError(new Error('ECONNREFUSED'))).toBe(false)})
