import assert from "node:assert/strict"
import test from "node:test"
import { registerSource } from "./helpers/onboarding-source.mjs"

const hooks = registerSource()
const { buildOptimisticUserMessage, markOptimisticItemFailed, mergeTimelineItems, mergeTimelineSnapshot } = await import("../src/components/session/optimistic-timeline.ts")

for (const failed of [false, true]) test(`服务端确认替换${failed ? "失败" : "待发送"}消息，不影响其他消息`, () => {
  const pending = buildOptimisticUserMessage({ sessionId: "a", clientMessageId: "sent", text: "hello", attachments: [], items: [], nextSeq: 10 })
  const optimistic = failed ? markOptimisticItemFailed(pending, "timeout") : pending
  const other = buildOptimisticUserMessage({ sessionId: "a", clientMessageId: "other", text: "hello", attachments: [], items: [], nextSeq: 10 })
  const confirmed = { ...pending, id: "server-message", status: "done", source: { clientMessageId: "sent" }, revision: 1, updatedSeq: 12 }
  for (const items of [
    mergeTimelineItems([optimistic, other], [confirmed]),
    mergeTimelineSnapshot([optimistic, other], 10, [confirmed], 12).items,
  ]) {
    assert.equal(items.length, 2)
    assert.ok(items.some(item => item.id === other.id))
    assert.ok(items.some(item => item.id === confirmed.id))
    assert.ok(items.every(item => item.id !== optimistic.id))
  }
})

test.after(() => hooks.deregister())
