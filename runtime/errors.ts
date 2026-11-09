import { StudioError } from '../src/studio/protocol'
export function isPermissionError(error: any): boolean {
  if (!error) return false
  if (['EPERM', 'EACCES'].includes(error.code) || /\b(?:EPERM|EACCES)\b|operation not permitted/i.test(error.message ?? '')) return true
  return isPermissionError(error.cause) || (Array.isArray(error.errors) && error.errors.some(isPermissionError))
}
export function runtimeError(error: any): StudioError {
  if (error instanceof StudioError) return error
  if (isPermissionError(error)) return new StudioError('permission_required', error.syscall && /open|mkdir|rename|unlink/.test(error.syscall) ? 'Access to a required local file was denied. Check filesystem permissions or use the harness normal permission controls.' : 'The harness sandbox blocked local server or browser access. Retry this command with permission for loopback networking and child processes.', { retrySameCommand: true, osError: error.code ?? error.cause?.code })
  return new StudioError('internal_error', error?.message ?? String(error))
}
