import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

for (const path of [
  "../src/components/session-detail.tsx",
  "../../desktop-workbench/renderer/src/components/session-detail.tsx",
]) {
  test(`${path}：窄屏隐藏接收提示，保留执行提示`, () => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    const status = source.slice(
      source.indexOf('{!creationFailed && (runtimeStatus === "waiting"'),
      source.indexOf("{showScrollBottom ?"),
    )
    assert.match(status, /runtimeStatus === "running" \? "flex" : "hidden md:flex"/)
    assert.match(status, /tSession\("runtimePending", \{ runtime: takeoverAgent \}\)/)
    assert.match(status, /tSession\("runtimeWorking", \{ runtime: takeoverAgent \}\)/)
  })
}
