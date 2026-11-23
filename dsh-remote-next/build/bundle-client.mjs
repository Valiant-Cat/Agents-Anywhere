/** Concatenate the deferred official workspace factory with this plugin's module. */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(root, '..')
const official = await readFile(join(packageRoot, 'official-workspace-fn.js'), 'utf8')
const ours = await readFile(join(packageRoot, 'client.js'), 'utf8')
const probe = `fetch('/agents-anywhere/diag',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'bundle-fetched',at:new Date().toISOString()})}).catch(()=>{});\n`
const poller = `;(() => {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return
  let last = null
  setInterval(async () => {
    try {
      const response = await fetch('/agents-anywhere/reload-signal', { cache: 'no-store' })
      const value = (await response.text()).trim()
      if (last === null) last = value
      else if (value !== last) window.location.reload()
    } catch {}
  }, 2000)
})();\n`
await writeFile(join(packageRoot, 'aa-client.js'), probe + official + '\n' + poller + probe + ours)
console.log('bundled aa-client.js')
console.log('bundled client-bundle.js')
