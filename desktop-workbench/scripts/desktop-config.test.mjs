import assert from "node:assert/strict";
import test from "node:test";
import { resolveDesktopConfig } from "./desktop-config.mjs";

const base = {
  cloud: { serverUrl: "https://official.example", oauthWebOrigin: "https://web.example" },
  apiNamespace: "/api/v2",
  updates: { downloadUrls: { darwin: "https://official.example/mac", win32: "https://official.example/windows" } },
};

test("未配置时保留源码默认值且不修改原对象", () => {
  assert.deepEqual(resolveDesktopConfig(base, {}), base);
  resolveDesktopConfig(base, { CLOUD_SERVER_URL: "https://private.example/" });
  assert.equal(base.cloud.serverUrl, "https://official.example");
  assert.equal(base.updates.downloadUrls.darwin, "https://official.example/mac");
});

test("自部署服务默认同时覆盖网页登录地址", () => {
  assert.deepEqual(resolveDesktopConfig(base, { CLOUD_SERVER_URL: " https://private.example/ " }), {
    ...base, cloud: { serverUrl: "https://private.example", oauthWebOrigin: "https://private.example" },
    updates: { downloadUrls: { darwin: "", win32: "" } },
  });
});

test("自部署未配置下载地址时不会回退到官方安装包", () => {
  for (const env of [
    { CLOUD_SERVER_URL: "https://private.example" },
    { CLOUD_OAUTH_WEB_ORIGIN: "https://private.example" },
  ]) {
    assert.deepEqual(resolveDesktopConfig(base, env).updates.downloadUrls, { darwin: "", win32: "" });
  }
});

test("各平台可独立配置 HTTPS 下载地址并保留路径及查询参数", () => {
  const config = resolveDesktopConfig(base, {
    CLOUD_SERVER_URL: "https://private.example",
    DESKTOP_UPDATE_MAC_URL: " https://downloads.example/latest.dmg?from=update ",
    DESKTOP_UPDATE_WINDOWS_URL: "https://downloads.example/latest.exe",
  });
  assert.deepEqual(config.updates.downloadUrls, {
    darwin: "https://downloads.example/latest.dmg?from=update",
    win32: "https://downloads.example/latest.exe",
  });
});

test("只配置一个平台时自部署的另一平台保持禁用", () => {
  const config = resolveDesktopConfig(base, {
    CLOUD_SERVER_URL: "https://private.example",
    DESKTOP_UPDATE_MAC_URL: "https://downloads.example/latest.dmg",
  });
  assert.equal(config.updates.downloadUrls.win32, "");
});

test("显式空值可禁用官方默认下载地址", () => {
  const config = resolveDesktopConfig(base, { DESKTOP_UPDATE_MAC_URL: "  " });
  assert.equal(config.updates.downloadUrls.darwin, "");
  assert.equal(config.updates.downloadUrls.win32, base.updates.downloadUrls.win32);
});

test("无效的更新下载地址不能进入构建", () => {
  for (const variable of ["DESKTOP_UPDATE_MAC_URL", "DESKTOP_UPDATE_WINDOWS_URL"]) {
    for (const value of ["invalid", "http://downloads.example/app", "file:///tmp/app",
      "https://user:secret@downloads.example/app", "https://downloads.example/app#part",
      "https://downloads.example.invalid/app"]) {
      assert.throws(() => resolveDesktopConfig(base, { [variable]: value }));
    }
  }
});

test("支持 API 与 Web 分开部署", () => {
  const config = resolveDesktopConfig(base, {
    CLOUD_SERVER_URL: "https://api.example",
    CLOUD_OAUTH_WEB_ORIGIN: "https://login.example",
  });
  assert.equal(config.cloud.oauthWebOrigin, "https://login.example");
});

test("无效地址及带凭据、路径的地址不能进入构建", () => {
  for (const value of ["invalid", "file:///tmp", "https://user:secret@server.example", "https://server.example/login", "https://server.example?q=1"]) {
    assert.throws(() => resolveDesktopConfig(base, { CLOUD_SERVER_URL: value }));
  }
});
