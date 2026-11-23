/**
 * Build the vendored DSH workspace browser (with the devices group) as a
 * client module. Every `@deepseek-ai/*` package stays external and is resolved
 * by DSH's ModuleLoader at runtime, exactly as DSH's own client modules do.
 */
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(root, '..')
const output = join(packageRoot, 'official-workspace-fn.js')
const moduleId = '@agents-anywhere/aa-workspace-official'

const sheets = []

function cssModules() {
  return {
    name: 'css-modules',
    setup(b) {
      b.onLoad({ filter: /\.module\.css$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const suffix = createHash('sha256').update(args.path).digest('hex').slice(0, 6)
        const names = {}
        const css = source.replace(/(?<![\w-])\.([A-Za-z_][\w-]*)/g, (_match, name) => {
          names[name] ??= `aa${suffix}_${name}`
          return `.${names[name]}`
        })
        sheets.push(css)
        return {
          loader: 'js',
          contents: `export default ${JSON.stringify(names)}`,
        }
      })
    },
  }
}

await build({
  entryPoints: [join(root, 'workspace-entry.ts')],
  outfile: join(root, '.workspace-bundle.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  legalComments: 'none',
  sourcemap: false,
  nodePaths: [join(root, 'node_modules')],
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives', 'react'],
  loader: { '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.png': 'empty', '.svg': 'empty' },
  plugins: [
    cssModules(),
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

const bundle = await readFile(join(root, '.workspace-bundle.js'), 'utf8')
const css = sheets.join('\n')
const header = `globalThis.__AA_OFFICIAL_WORKSPACE__ = function (require) {\nvar module = { exports: {} }; var exports = module.exports;\nif (typeof document !== 'undefined' && document.querySelector('style[data-aa-official="1"]') === null) { const tag = document.createElement('style'); tag.dataset.aaOfficial = '1'; tag.textContent = ${JSON.stringify(css)}; document.head.appendChild(tag) }\n`
const footer = `\nreturn module.exports.default || module.exports; };\n`
await mkdir(dirname(output), { recursive: true })
await writeFile(output, header + bundle + footer)
console.log(`built official-workspace-fn.js (${(header.length + bundle.length + footer.length) / 1024 | 0} KB, css ${(css.length / 1024) | 0} KB)`)
