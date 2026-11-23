import assert from 'node:assert/strict'
import { test } from 'node:test'

/** Minimal React surface: enough to render the panel once and inspect the tree. */
const React = {
  Fragment: Symbol('Fragment'),
  Component: class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }

    setState(next) {
      this.state = { ...this.state, ...next }
    }
  },
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useCallback(callback) {
    return callback
  },
  useRef(value) {
    return { current: value }
  },
}

function flatten(node, out = []) {
  if (node == null || node === false) return out
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out)
    return out
  }
  if (typeof node === 'object') {
    out.push(node)
    for (const child of node.children ?? []) flatten(child, out)
    return out
  }
  out.push(node)
  return out
}

function texts(node) {
  return flatten(node).filter((item) => typeof item === 'string')
}

test('client module registers the sidebar entry and the main panel', async () => {
  let loaded
  const requireModule = (name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  }
  globalThis.window = {
    __ModuleLoader__: {
      load({ id, factory }) {
        loaded = { id, module: factory(requireModule) }
      },
    },
  }
  await import('../client.js')

  assert.equal(loaded.id, '@vvicat/dsh-agents-anywhere')
  const registrations = []
  const ctx = {
    effect: (callback) => callback(),
    locale: {
      register() { return () => {} },
      bind: () => (key) => key,
    },
    slots: {
      inject: (_name, callback) => callback(),
      register: (options, component) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  loaded.module.apply(ctx)

  const sidebar = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
  const main = registrations.find((entry) => entry.options.name === 'main')
  assert.ok(sidebar, 'sidebar.panellist registration')
  assert.equal(sidebar.options.id, 'agents-anywhere')
  assert.ok(main, 'main panel registration')
  assert.equal(main.options.key, 'agents-anywhere')

  const tree = main.component({ t: (key) => key })
  const body = texts(tree)
  assert.ok(body.includes('Agents Anywhere'), 'panel title')
  // The group header appears after sign-in; the first render is the sign-in card.
  // The first render waits for /status instead of flashing the signed-out card.
  assert.ok(body.some((text) => text.includes('正在同步')), 'loading state')
})
