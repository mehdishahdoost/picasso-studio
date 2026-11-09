import { openSync, readFileSync, rmSync, writeFileSync, closeSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fail } from '../src/studio/protocol'
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (error: any) { return error.code !== 'ESRCH' } }
export function tryLock(path: string): (() => void) | null {
  const token = randomUUID()
  try {
    const fd = openSync(path, 'wx', 0o600)
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, token })); } finally { closeSync(fd) }
    return () => { try { if (JSON.parse(readFileSync(path, 'utf8')).token === token) rmSync(path) } catch {} }
  } catch (error: any) {
    if (error.code !== 'EEXIST') throw error
    try { const owner = JSON.parse(readFileSync(path, 'utf8')); if (Number.isSafeInteger(owner.pid) && !alive(owner.pid)) rmSync(path) }
    catch { try { if (Date.now() - statSync(path).mtimeMs > 30000) rmSync(path) } catch {} }
    return null
  }
}
export async function withLock<T>(path: string, action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const deadline = Date.now() + 15000
  while (true) {
    signal?.throwIfAborted()
    const release = tryLock(path)
    if (release) { try { return await action() } finally { release() } }
    if (Date.now() > deadline) fail('owner_conflict', 'Another operation is holding the session lock; retry after it finishes')
    await new Promise(resolve => setTimeout(resolve, 30))
  }
}
