/**
 * Build the browser half of this plugin.
 *
 * The sidebar workspace region is a vendored copy of DSH's own
 * `@deepseek-ai/dsh-client-ui-workspace` (see vendor/workspace-browser). It needs
 * the same client packages DSH builds against, so they are installed under
 * `build/` and bundled here; only React stays external and comes from DSH's
 * module table at runtime.
 */
import { build } from 'esbuild'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(root, '..')
const target = process.argv[2] ?? 'panel'
const output = target === 'fork' || target === 'dropin'
  ? join(packageRoot, 'fork', 'client.js')
  : join(packageRoot, 'client-dist', 'client.js')
const moduleId = target === 'fork'
  ? '@agents-anywhere/dsh-workspace-fork'
  : target === 'dropin'
    ? '@deepseek-ai/dsh-client-ui-workspace'
    : '@agents-anywhere/dsh-remote'

/** CSS modules are inlined: identity class names plus one injected stylesheet. */
function cssModulesPlugin() {
  const sheets = []
  return {
    name: 'css-modules',
    setup(b) {
      b.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        const css = await readFile(args.path, 'utf8')
        sheets.push(css)
        const names = new Set()
        for (const match of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) names.add(match[1])
        const object = [...names].map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(name)},`).join('\n')
        return {
          loader: 'js',
          contents: `const classes = {\n${object}\n}\nexport default classes\n`,
        }
      })
      b.onEnd((result) => {
        if (result.errors.length > 0) return
        result.outputFiles ??=[]
        // Append the CSS through the same banner file is handled below.
        globalThis.__aaSheets = sheets
      })
    },
  }
}

await build({
  entryPoints: [join(root, target === 'fork' || target === 'dropin' ? 'fork-entry.ts' : 'client-src/index.ts')],
  outfile: output,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  loader: { '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.eot': 'empty', '.png': 'empty', '.svg': 'empty' },
  sourcemap: false,
  legalComments: 'none',
  nodePaths: [join(root, 'node_modules')],
  external: ['react', 'react-dom'],
  plugins: [
    cssModulesPlugin(),
    {
      name: 'jsx-runtime-shim',
      setup(b) {
        b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx-runtime', namespace: 'shim' }))
        b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
          loader: 'js',
          contents: `const React = require('react')
const jsx = (type, props, key) => (key === undefined ? React.createElement(type, props) : React.createElement(type, { ...props, key }))
module.exports = { Fragment: React.Fragment, jsx, jsxs: jsx, jsxDEV: jsx }`,
        }))
      },
    },
  ],
})

const bundle = await readFile(output, 'utf8')
const sheets = globalThis.__aaSheets ?? []
const css = sheets.join('\n')
const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(moduleId)}, factory(require) {\nvar module = { exports: {} }; var exports = module.exports;\nif (typeof document !== 'undefined') { const tag = document.createElement('style'); tag.dataset.plugin = ${JSON.stringify(moduleId)}; tag.textContent = ${JSON.stringify(css)}; document.head.appendChild(tag) }\n`
const footer = `\nreturn module.exports.default || module.exports; } });\n`
await mkdir(dirname(output), { recursive: true })
const { writeFile } = await import('node:fs/promises')
await writeFile(output, banner + bundle + footer)
console.log(`built ${relative(packageRoot, output)} (${(banner.length + bundle.length + footer.length) / 1024 | 0} KB)`)
