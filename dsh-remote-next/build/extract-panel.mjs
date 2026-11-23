/**
 * Derive the buildable panel module from the maintained client.js source.
 * client.js stays the readable source of truth (and the file the headless test
 * loads); the bundle imports the extracted module.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const source = await readFile(join(root, '..', 'client.js'), 'utf8')

const startMarker = '  factory(require) {\n'
const start = source.indexOf(startMarker) + startMarker.length
const endMarker = '\n  },\n})\n'
const end = source.lastIndexOf(endMarker)
let body = source.slice(start, end)
body = body.replace("    const React = require('react')\n", '')
body = body.replace('    const { useCallback, useEffect, useRef, useState } = React\n', '')

const headMarker = "    return {\n      inject: ['slots', 'locale'],\n      apply(ctx) {"
const head = body.indexOf(headMarker)
const core = `${body.slice(0, head).trimEnd()}\n`
const inner = body.slice(head + headMarker.length, body.lastIndexOf('      },\n    }')).trimEnd()
const out = `import React, { useCallback, useEffect, useRef, useState } from 'react'
import { hostBridge } from '../../vendor/workspace-browser/src/client/host-bridge.ts'

${core}

export function apply(ctx) {${inner.replace(
  "        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agents-anywhere-remote.locale')",
  "        hostBridge.selectPanel = () => { ctx.layout.selectPanel('agents-anywhere') }\n        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agents-anywhere-remote.locale')",
)}
}

export const inject = ['slots', 'locale']
`
await writeFile(join(root, 'client-src', 'panel.js'), out)
console.log('extracted build/client-src/panel.js')
