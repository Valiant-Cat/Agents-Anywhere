import assert from "node:assert/strict"
import test from "node:test"
import { registerSource } from "./helpers/onboarding-source.mjs"

const hooks = registerSource()
const { createCreationCatalogCache } = await import("../src/components/session/creation-catalog-cache.ts")

test("目录缓存合并并发请求并隔离账号设备及配置", async () => {
  const read = createCreationCatalogCache()
  let calls = 0
  const load = async () => ++calls
  const key = JSON.stringify(["token", "device", "runtime", "config"])
  assert.deepEqual(await Promise.all([read(key, load), read(key, load)]), [1, 1])
  assert.equal(await read(key, load), 1)
  for (const parts of [
    ["other-token", "device", "runtime", "config"],
    ["token", "other-device", "runtime", "config"],
    ["token", "device", "other-runtime", "config"],
    ["token", "device", "runtime", "other-config"],
  ]) await read(JSON.stringify(parts), load)
  assert.equal(calls, 5)
})

test("失败或过期的目录请求允许重试", async () => {
  const read = createCreationCatalogCache(-1)
  await assert.rejects(read("key", async () => { throw new Error("暂时不可用") }))
  assert.equal(await read("key", async () => 1), 1)
  assert.equal(await read("key", async () => 2), 2)
})

test.after(() => hooks.deregister())
