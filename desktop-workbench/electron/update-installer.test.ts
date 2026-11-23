import test from "node:test";
import assert from "node:assert/strict";
import { openUpdateInstaller } from "./update-installer";

test("打开 macOS 更新包后，经用户确认才完整退出旧版", async () => {
  const calls: string[] = [];
  await openUpdateInstaller("/tmp/update.dmg", {
    platform: "darwin", isPackaged: true,
    openPath: async (file) => { calls.push(file); return ""; },
    confirmQuit: async () => { calls.push("confirm"); return true; },
    quit: async () => { calls.push("shutdown"); },
  });
  assert.deepEqual(calls, ["/tmp/update.dmg", "confirm", "shutdown"]);
});

test("取消退出、开发模式和 Windows 不会退出应用", async () => {
  for (const [platform, isPackaged, confirmations] of [
    ["darwin", true, 1], ["darwin", false, 0], ["win32", true, 0],
  ] as const) {
    let asked = 0;
    await openUpdateInstaller("/tmp/update", {
      platform, isPackaged,
      openPath: async () => "",
      confirmQuit: async () => { asked++; return false; },
      quit: async () => { assert.fail("不应退出"); },
    });
    assert.equal(asked, confirmations);
  }
});

test("安装包打开失败时保留旧应用，不弹退出确认", async () => {
  for (const openPath of [
    async () => "打开失败",
    async (): Promise<string> => { throw new Error("打开失败"); },
  ]) {
    await assert.rejects(openUpdateInstaller("/tmp/update.dmg", {
      platform: "darwin", isPackaged: true, openPath,
      confirmQuit: async () => { assert.fail("不应询问退出"); },
      quit: async () => { assert.fail("不应退出"); },
    }), /打开失败/);
  }
});
