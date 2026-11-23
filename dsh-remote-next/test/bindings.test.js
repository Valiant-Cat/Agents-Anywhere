import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RemoteBindings, localSessionId, bindingContext } from '../bindings.js'

function unit() {
  const tables = { bindings: {} }
  return {
    loadAll: async () => ({ tables }),
    putRecord: async (table, key, value) => { tables[table][key] = value },
    deleteRecord: async (table, key) => { delete tables[table][key] },
  }
}

test('bindings are isolated and restored by local session id', async () => {
  const disk = unit()
  const first = new RemoteBindings(disk)
  await first.load()
  await first.set('local-a', { origin: 'https://aa.example', userId: 'u1', sessionId: 'remote-a', deviceId: 'dev-a', runtime: 'codex' })
  assert.equal(first.get('local-b'), null)
  const restored = new RemoteBindings(disk)
  await restored.load()
  assert.equal(restored.get('local-a').sessionId, 'remote-a')
  assert.match(bindingContext(restored, { id: 'local-a' }), /remote-a/)
  assert.doesNotMatch(bindingContext(restored, { id: 'local-b' }), /remote-a/)
  await restored.clear('local-a')
  const third = new RemoteBindings(disk)
  await third.load()
  assert.equal(third.get('local-a'), null)
})

test('binding tools require an owning local agent', () => {
  assert.throws(() => localSessionId({}), /需要当前 DSH 会话/)
  assert.equal(localSessionId({ agent: { id: 'local-a' } }), 'local-a')
})
