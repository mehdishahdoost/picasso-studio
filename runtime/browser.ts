import { spawn } from 'node:child_process'
export type BrowserLaunch = { status: 'requested' | 'failed' | 'unavailable' | 'unconfirmed' | 'skipped'; message: string; exitCode?: number | null; diagnostic?: string }
export async function openBrowser(url: string, timeoutMs = 3000): Promise<BrowserLaunch> {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return { status: 'unavailable', message: 'No graphical desktop is available. Open the Studio URL manually or with the harness browser tool.' }
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open'
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  return new Promise(resolve => {
    let diagnostic = '', finished = false
    const child = spawn(command, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const finish = (result: BrowserLaunch) => {
      if (finished) return
      finished = true; clearTimeout(timer); child.stderr?.destroy(); child.unref()
      resolve({ ...result, ...(diagnostic.trim() ? { diagnostic: diagnostic.trim().replaceAll(url, '[Studio URL]') } : {}) })
    }
    const timer = setTimeout(() => finish({ status: 'unconfirmed', message: 'The browser launcher did not confirm completion. Open the Studio URL manually.' }), timeoutMs)
    child.stderr?.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000) })
    child.on('error', error => finish({ status: 'failed', message: `Could not run ${command}: ${error.message}` }))
    child.on('exit', code => finish({ status: code === 0 ? 'requested' : 'failed', exitCode: code, message: code === 0 ? 'The desktop accepted the browser request; editor connection still needs verification.' : `${command} failed. Open the Studio URL manually.` }))
  })
}
