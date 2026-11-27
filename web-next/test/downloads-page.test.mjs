import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { registerSource } from "./helpers/onboarding-source.mjs"

registerSource()
const { configuredDownloadUrl, detectDownloadPlatform } = await import("../src/lib/download-platforms.ts")

test("下载页识别手机、iPad 桌面模式和桌面平台", () => {
  assert.equal(detectDownloadPlatform("iPhone"), "ios")
  assert.equal(detectDownloadPlatform("Macintosh", 5), "ios")
  assert.equal(detectDownloadPlatform("Macintosh", 0), "mac")
  assert.equal(detectDownloadPlatform("Windows NT"), "windows")
  assert.equal(detectDownloadPlatform("Android"), "android")
})

test("TestFlight 仅接受公开邀请链接，空配置不回退到上游", () => {
  assert.equal(configuredDownloadUrl(undefined, true), "")
  assert.equal(configuredDownloadUrl("https://apps.apple.com/app/123", true), "")
  assert.equal(configuredDownloadUrl("https://testflight.apple.com.evil.test/join/abc", true), "")
  assert.equal(configuredDownloadUrl("https://testflight.apple.com/join/abc", true), "https://testflight.apple.com/join/abc")
  assert.equal(configuredDownloadUrl("javascript:alert(1)"), "")
  assert.equal(configuredDownloadUrl("http://example.com/app.apk"), "")
  assert.equal(configuredDownloadUrl("https://user:secret@example.com/app.apk"), "")
  assert.equal(configuredDownloadUrl("https://example.com/app.apk"), "https://example.com/app.apk")
})

test("连接手机下载入口属于当前服务", async () => {
  const { PRODUCT_LINKS } = await import("../src/lib/product-links.ts")
  assert.equal(PRODUCT_LINKS.downloadPageUrl, "/downloads/")
  const desktop = readFileSync(new URL("../../desktop-workbench/renderer/src/lib/product-links.ts", import.meta.url), "utf8")
  assert.match(desktop, /getDesktopServerConnection\(\)\?\.serverUrl/)
  assert.match(desktop, /new URL\("\/downloads\/", origin\)/)
  assert.doesNotMatch(desktop, /agents-anywhere\.com\/download/)
})

test("下载页保留自部署安装包接口和 TestFlight 配置", () => {
  const screen = readFileSync(new URL("../src/components/pages/downloads-screen.tsx", import.meta.url), "utf8")
  assert.match(screen, /\/download\/mac\/latest\?from=web/)
  assert.match(screen, /\/download\/windows\/latest\?from=web/)
  assert.match(screen, /\/download\/android\/latest\?from=web/)
  assert.doesNotMatch(screen, /NEXT_PUBLIC_ANDROID_DOWNLOAD_URL/)
  assert.match(screen, /NEXT_PUBLIC_IOS_TESTFLIGHT_URL, true/)
  assert.match(screen, /role="tablist"/)
  assert.match(screen, /role="tabpanel"/)
  assert.doesNotMatch(screen, /apps\.apple\.com|anywhere-labs/)
})
