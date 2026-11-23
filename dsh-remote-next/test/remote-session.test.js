import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionAction, sessionDetail, timelineText, mergeTimeline } from '../remote-session.js'

function mock(takeover = true, allowed = true) {
  const calls = []
  return { calls, request: async (path, options = {}) => {
    calls.push({ path, ...options })
    if (path.endsWith('/meta')) return { session: { id: 's1', takeover } }
    if (path.endsWith('/capabilities')) return { capabilitySet: { capabilities: [{ capabilityId: 'session.send_message', supported: true, available: true, allowed }] } }
    if (path.includes('/timeline?')) return { items: [], hasMore: false }
    return { ok: true }
  } }
}

test('send requires explicit takeover and usable capability', async () => {
  const readonly = mock(false)
  await assert.rejects(() => sessionAction(readonly, 's1', 'send', { message: 'hello' }), /先明确接管/)
  assert.equal(readonly.calls.some(call => call.method === 'POST'), false)
  const denied = mock(true, false)
  await assert.rejects(() => sessionAction(denied, 's1', 'send', { message: 'hello' }), /能力不可用/)
  const api = mock()
  await sessionAction(api, 's1', 'send', { message: 'hello', clientMessageId: 'request-1' })
  assert.equal(api.calls.at(-1).body.clientMessageId, 'request-1')
})

test('takeover and release are separate explicit operations', async () => {
  const api = mock()
  await sessionAction(api, 's1', 'takeover')
  await sessionAction(api, 's1', 'release')
  assert.deepEqual(api.calls.map(call => call.method), ['POST', 'DELETE'])
})

test('history uses order cursor and UI text is not truncated', async () => {
  const api = mock()
  await sessionDetail(api, 's1', { before: 75 })
  assert.match(api.calls.find(call => call.path.includes('/timeline?')).path, /mode=history.*beforeOrderSeq=75/)
  const text = 'x'.repeat(10000)
  assert.equal(timelineText({ content: { text } }), text)
  assert.match(timelineText({ content: { command: 'git status', output: 'clean' } }), /git status/)
  assert.deepEqual(mergeTimeline([{ id: 'a', orderSeq: 1 }], [{ id: 'a', orderSeq: 1, status: 'done' }, { id: 'b', orderSeq: 2 }]).map(item => item.id), ['a', 'b'])
})
