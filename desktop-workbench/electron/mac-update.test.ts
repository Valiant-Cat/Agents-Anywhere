import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MAC_UPDATE_SCRIPT, prepareMacUpdate, validateUpdateBundle } from "./mac-update";

const exec = promisify(execFile);
const info = { CFBundleIdentifier: "test.app", CFBundleShortVersionString: "2.2.4", CFBundleExecutable: "App" };

test("只接受同一应用的更高版本和有效入口", () => {
  assert.equal(validateUpdateBundle(info, "test.app", "2.2.3"), "App");
  for (const patch of [
    { CFBundleIdentifier: "other.app" }, { CFBundleShortVersionString: "2.2.3" },
    { CFBundleShortVersionString: "invalid" }, { CFBundleExecutable: "../App" },
    { CFBundleExecutable: ".." }, { CFBundleExecutable: "" },
  ]) assert.throws(() => validateUpdateBundle({ ...info, ...patch }, "test.app", "2.2.3"));
});

test("安装脚本可解析且等待旧进程后替换，保留旧版备份", { skip: process.platform === "win32" }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aa-install-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const script = path.join(directory, "install.sh");
  // 仅测试替换事务，不启动真实应用。
  await fs.writeFile(script, MAC_UPDATE_SCRIPT.replaceAll('/usr/bin/open', '/usr/bin/true'));
  await exec("/bin/sh", ["-n", script]);
  const target = path.join(directory, "App with spaces.app");
  const staged = path.join(directory, "new.app");
  const backup = path.join(directory, "previous.app");
  await fs.mkdir(target);
  await fs.mkdir(staged);
  await fs.writeFile(path.join(target, "version"), "old");
  await fs.writeFile(path.join(staged, "version"), "new");
  await exec("/bin/sh", [script, "2147483647", target, staged, backup, path.join(directory, "status")]);
  assert.equal(await fs.readFile(path.join(target, "version"), "utf8"), "new");
  assert.equal(await fs.readFile(path.join(backup, "version"), "utf8"), "old");
});

test("启动命令失败会恢复旧版，已有备份不会被覆盖", { skip: process.platform === "win32" }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aa-rollback-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const script = path.join(directory, "install.sh");
  await fs.writeFile(script, MAC_UPDATE_SCRIPT.replaceAll('/usr/bin/open', '/usr/bin/false'));
  const target = path.join(directory, "App.app");
  const staged = path.join(directory, "new.app");
  const backup = path.join(directory, "previous.app");
  await fs.mkdir(target);
  await fs.mkdir(staged);
  await fs.writeFile(path.join(target, "version"), "old");
  await fs.writeFile(path.join(staged, "version"), "new");
  const run = () => exec("/bin/sh", [script, "2147483647", target, staged, backup, path.join(directory, "status")]);
  await assert.rejects(run());
  assert.equal(await fs.readFile(path.join(target, "version"), "utf8"), "old");
  assert.equal(await fs.readFile(path.join(staged, "version"), "utf8"), "new");
  await fs.mkdir(backup);
  await assert.rejects(run());
  assert.equal(await fs.readFile(path.join(target, "version"), "utf8"), "old");
});

test("真实 DMG 可只读挂载并预复制，取消不修改原应用", { skip: process.platform !== "darwin" }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "aa-dmg-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const payload = path.join(directory, "payload");
  const contents = path.join(payload, "Test.app", "Contents");
  await fs.mkdir(path.join(contents, "MacOS"), { recursive: true });
  const plist = path.join(contents, "Info.plist");
  await fs.writeFile(plist, JSON.stringify(info));
  await exec("/usr/bin/plutil", ["-convert", "xml1", plist]);
  await fs.writeFile(path.join(contents, "MacOS", "App"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const installer = path.join(directory, "update.dmg");
  await exec("/usr/bin/hdiutil", ["create", "-srcfolder", payload, "-format", "UDZO", installer], { timeout: 60_000 });
  const appPath = path.join(directory, "Installed.app");
  await fs.mkdir(appPath);
  await fs.writeFile(path.join(appPath, "original"), "unchanged");
  const installation = await prepareMacUpdate({
    installer, appPath, appId: "test.app", currentVersion: "2.2.3",
    logsDirectory: path.join(directory, "logs"),
  });
  assert.equal(installation.unsigned, true);
  assert.equal(await fs.readFile(path.join(appPath, "original"), "utf8"), "unchanged");
  assert.equal((await fs.stat(path.join(path.dirname(installation.backup), "new.app"))).isDirectory(), true);
  await installation.cancel();
  await assert.rejects(fs.access(path.dirname(installation.backup)));
  assert.equal(await fs.readFile(path.join(appPath, "original"), "utf8"), "unchanged");
});
