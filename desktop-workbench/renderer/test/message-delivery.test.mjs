import assert from "node:assert/strict"
import test from "node:test"
import { registerSource } from "./helpers/onboarding-source.mjs"

const hooks = registerSource()
const { ApiError } = await import("../src/lib/api/errors.ts")
const { messageDeliveryIsUncertain, messageWasConfirmed } = await import("../src/components/session/message-delivery.ts")
const { buildOptimisticUserMessage } = await import("../src/components/session/optimistic-timeline.ts")

test("网络或上游确认超时不能当作明确失败", () => {
  for (const [status, code, expected] of [
    [0, undefined, true], [504, undefined, true],
    [409, "codex_ipc_start_turn_outcome_unknown", true],
    [409, "session_busy", false], [403, undefined, false],
    [422, undefined, false],
  ]) assert.equal(messageDeliveryIsUncertain(new ApiError({ status, kind: status === 0 ? "network" : "http", code, detail: "失败" })), expected)
  assert.equal(messageDeliveryIsUncertain(new Error("配置写入失败")), false)
})

test("仅同一消息的服务端记录能确认交付", () => {
  const pending = buildOptimisticUserMessage({ sessionId: "s", clientMessageId: "m", text: "hi", attachments: [], items: [], nextSeq: 0 })
  assert.equal(messageWasConfirmed([pending], "m"), false)
  const confirmed = { ...pending, id: "server", source: { clientMessageId: "m" }, status: "done" }
  assert.equal(messageWasConfirmed([confirmed], "m"), true)
  assert.equal(messageWasConfirmed([confirmed], "other"), false)
})

test.after(() => hooks.deregister())
