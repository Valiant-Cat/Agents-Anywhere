import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { apply } from '../index.js'

/** Collect the tool definitions the plugin registers on its context. */
function fakeContext(account, dshIdentity = {
  accessToken: 'dsh-access-token',
  expiresAt: Date.now() + 3_600_000,
  email: 'tester@example.com',
  displayName: 'Tester',
}) {
  const tools = new Map()
  const ctx = {
    effect: (callback) => callback(),
    tools: {
      register: (definition) => {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    credentials: {
      readRecord: async (key) => {
        if (key === 'vvicat-authorization/default') {
          return dshIdentity ? { kind: 'grant', payload: dshIdentity } : undefined
        }
        return account ? { kind: 'grant', payload: account } : undefined
      },
      modifyRecord: async () => undefined,
      deleteRecord: async () => undefined,
    },
  }
  return { ctx, tools }
}

/** Minimal Agents Anywhere Server doubles for the client paths under test. */
function stubServer() {
  const requests = []
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    requests.push(`${request.method} ${url.pathname}${url.search}`)
    const send = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/health') return send(200, { status: 'ok' })
    if (request.method === 'GET' && url.pathname === '/api/v2/auth/me') {
      return send(200, { userId: 'u1', displayName: 'Tester', email: 'tester@example.com' })
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/connectors') {
      return send(200, {
        connectors: [{
          id: 'conn1', name: 'Studio Mac', status: 'online', connectorKind: 'desktop',
          deviceOs: 'macos', lastSeenAt: '2026-11-19T10:00:00Z', userId: 'u1',
          createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-19T10:00:00Z',
        }],
      })
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/sessions') {
      return send(200, {
        sessions: [
          {
            id: 's1', connectorId: 'conn1', runtime: 'dsh', title: 'Fix the login test',
            status: 'running', cwd: '/work/app', updatedAt: '2026-11-19T10:05:00Z',
          },
          {
            id: 's2', connectorId: 'conn2', runtime: 'codex', title: 'Ship release',
            status: 'idle', cwd: '/work/lib', updatedAt: '2026-11-19T09:00:00Z',
          },
        ],
        hasMore: false,
        nextCursor: null,
        serverTime: '2026-11-19T10:06:00Z',
      })
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/sessions/s1/meta') {
      return send(200, {
        session: {
          id: 's1', connectorId: 'conn1', runtime: 'dsh', title: 'Fix the login test',
          status: 'running', cwd: '/work/app',
        },
        serverTime: '2026-11-19T10:06:00Z',
      })
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/sessions/s1/timeline') {
      return send(200, {
        sessionId: 's1',
        items: [
          {
            id: 'i1', sessionId: 's1', type: 'message', role: 'user', status: 'done',
            orderSeq: 1, content: { text: 'please fix the test' }, source: { runtime: 'dsh' },
          },
          {
            id: 'i2', sessionId: 's1', type: 'message', role: 'assistant', status: 'done',
            orderSeq: 2, content: { text: 'on it' }, source: { runtime: 'dsh' },
          },
        ],
        nextSeq: 2,
        hasMore: false,
        serverTime: '2026-11-19T10:06:00Z',
      })
    }
    if (request.method === 'POST' && url.pathname === '/api/v2/sessions/s1/runtime/messages') {
      return send(200, { ok: true, result: { accepted: true } })
    }
    if (request.method === 'GET' && url.pathname === '/api/v2/sessions/s1/runtime/state') {
      return send(200, { state: { sessionId: 's1', runtime: 'dsh', status: 'running', updatedSeq: 3 } })
    }
    return send(404, { detail: 'not found' })
  })
  return { server, requests }
}

let origin
let stub
let tools

before(async () => {
  stub = stubServer()
  await new Promise((resolve) => stub.server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${stub.server.address().port}`
  const account = {
    origin, accessToken: 'access-token', via: 'dsh-sso', expiresAt: Date.now() + 3_600_000,
    userId: 'u1', displayName: 'Tester', email: 'tester@example.com',
  }
  const built = fakeContext(account)
  apply(built.ctx, { serverUrl: origin })
  tools = built.tools
})

after(() => new Promise((resolve) => stub.server.close(resolve)))

const call = (name, args = {}) => tools.get(name).execute(args, { signal: new AbortController().signal })

test('registers remote tools including explicit session control', () => {
  assert.deepEqual([...tools.keys()], ['aa_session_control', 'aa_login', 'aa_account', 'aa_devices', 'aa_sessions', 'aa_timeline', 'aa_send'])
})

test('aa_account reports the stored account as authorized', async () => {
  const value = await call('aa_account')
  assert.equal(value.signedIn, true)
  assert.equal(value.authorized, true)
  assert.equal(value.server, origin)
  assert.equal(value.displayName, 'Tester')
})

test('aa_devices counts active sessions per device', async () => {
  const value = await call('aa_devices')
  assert.equal(value.devices.length, 1)
  assert.deepEqual(value.devices[0], {
    id: 'conn1', name: 'Studio Mac', status: 'online', connectorKind: 'desktop',
    deviceOs: 'macos', lastSeenAt: '2026-11-19T10:00:00Z', activeSessions: 1,
  })
})

test('aa_sessions filters by device and resolves device names', async () => {
  const value = await call('aa_sessions', { deviceId: 'conn1', limit: 10 })
  assert.equal(value.sessions.length, 1)
  assert.equal(value.sessions[0].id, 's1')
  assert.equal(value.sessions[0].device, 'Studio Mac')
  assert.equal(value.matched, 1)
})

test('aa_sessions matches the query against the title', async () => {
  const value = await call('aa_sessions', { query: 'release' })
  assert.deepEqual(value.sessions.map((session) => session.id), ['s2'])
  assert.equal(value.sessions[0].device, null)
})

test('aa_timeline returns ordered, bounded text entries', async () => {
  const value = await call('aa_timeline', { sessionId: 's1', limit: 20 })
  assert.equal(value.title, 'Fix the login test')
  assert.deepEqual(value.items.map((item) => [item.seq, item.role, item.text]), [
    [1, 'user', 'please fix the test'],
    [2, 'assistant', 'on it'],
  ])
})

test('aa_send posts the message and returns the remote status', async () => {
  const value = await call('aa_send', { sessionId: 's1', message: 'continue', waitSeconds: 0 })
  assert.equal(value.accepted, true)
  assert.equal(value.status, 'running')
  assert.deepEqual(value.events, [])
})

test('a token issued by another server is not reused', async () => {
  const built = fakeContext({
    origin: 'https://elsewhere.example.com', accessToken: 'other', via: 'dsh-sso', expiresAt: Date.now() + 3_600_000,
    userId: 'u1', displayName: 'Tester', email: null,
  })
  apply(built.ctx, { serverUrl: origin })
  const sessions = built.tools.get('aa_sessions')
  await assert.rejects(
    () => sessions.execute({}, { signal: new AbortController().signal }),
    /会话已失效/,
  )
})

test('a missing DSH identity clears the derived session', async () => {
  const built = fakeContext({
    origin, accessToken: 'derived', via: 'dsh-sso', expiresAt: Date.now() + 3_600_000,
    userId: 'u1', displayName: 'Tester', email: 'tester@example.com',
  }, null)
  apply(built.ctx, { serverUrl: origin })
  await assert.rejects(
    () => built.tools.get('aa_devices').execute({}, { signal: new AbortController().signal }),
    /会话已失效/,
  )
})

test('an unauthenticated request surfaces a sign-in hint', async () => {
  const built = fakeContext(null)
  apply(built.ctx, { serverUrl: origin })
  const devices = built.tools.get('aa_devices')
  await assert.rejects(
    () => devices.execute({}, { signal: new AbortController().signal }),
    /会话已失效/,
  )
})


test('aa_binding validates the target and isolates conversations', async () => {
  const built = fakeContext({ origin, accessToken: 'access-token', via: 'dsh-sso', expiresAt: Date.now() + 3_600_000, userId: 'u1' })
  const tables = { bindings: {} }
  const unit = {
    loadAll: async () => ({ tables }),
    putRecord: async (table, key, value) => { tables[table][key] = value },
    deleteRecord: async (table, key) => { delete tables[table][key] },
    close: async () => {},
  }
  built.ctx.get = name => name === 'storage' ? { backend: { get: () => ({ kv: { open: async () => unit } }) } } : undefined
  await apply(built.ctx, { serverUrl: origin })
  const binding = built.tools.get('aa_binding')
  assert.ok(binding)
  const run = (id, args) => binding.execute(args, { agent: { id }, signal: new AbortController().signal })
  assert.equal((await run('local-a', { action: 'set', sessionId: 's1' })).target.deviceId, 'conn1')
  assert.equal((await run('local-b', { action: 'get' })).bound, false)
  assert.equal((await run('local-a', { action: 'get' })).target.sessionId, 's1')
  assert.equal((await run('local-a', { action: 'clear' })).bound, false)
  assert.equal((await run('local-a', { action: 'get' })).bound, false)
})
