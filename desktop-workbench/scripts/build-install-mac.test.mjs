import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aa-install-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scripts = path.join(root, "scripts");
  const bin = path.join(root, "bin");
  const install = path.join(root, "应用目录");
  for (const dir of [scripts, bin, install]) fs.mkdirSync(dir);
  const script = path.join(scripts, "build-install-mac.sh");
  fs.copyFileSync(new URL("./build-install-mac.sh", import.meta.url), script);
  const commands = {
    uname: 'if [ "$1" = -s ]; then echo Darwin; else echo arm64; fi',
    node: "exit 0",
    corepack: `
echo "$*" > "$ARGS_FILE"
[ "\${FAIL_BUILD:-0}" = 0 ] || exit 17
mkdir -p "release/mac-arm64/Agents Anywhere.app/Contents/MacOS"
printf new > "release/mac-arm64/Agents Anywhere.app/Contents/MacOS/Agents Anywhere"
chmod +x "release/mac-arm64/Agents Anywhere.app/Contents/MacOS/Agents Anywhere"`,
    ditto: '[ "${FAIL_COPY:-0}" = 0 ] || exit 18\ncp -R "$1" "$2"',
    pgrep: '[ "${APP_RUNNING:-0}" = 1 ]',
    osascript: "exit 19",
    open: 'echo "$1" > "$OPEN_FILE"',
    mv: `
case "$1" in
  */.agents-anywhere-install.*/Agents\\ Anywhere.app)
    [ "\${FAIL_REPLACE:-0}" = 0 ] || exit 20 ;;
esac
/bin/mv "$@"`,
  };
  for (const [name, body] of Object.entries(commands)) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\nset -e\n${body}\n`, { mode: 0o755 });
  }
  const target = path.join(install, "Agents Anywhere.app");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "original"), "old");
  const argsFile = path.join(root, "args");
  const openFile = path.join(root, "opened");
  return {
    target, install, argsFile, openFile,
    run(env = {}, flags = []) {
      return spawnSync("/bin/bash", [script, "--install-dir", install, ...flags], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ARGS_FILE: argsFile, OPEN_FILE: openFile, ...env },
      });
    },
  };
}

test("构建后安装并打开新版，支持带空格和中文的路径", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.target, "Contents/MacOS/Agents Anywhere"), "utf8"), "new");
  assert.equal(fs.readFileSync(f.argsFile, "utf8").trim(), "yarn dist:mac --arm64");
  assert.equal(fs.readFileSync(f.openFile, "utf8").trim(), f.target);
  assert.deepEqual(fs.readdirSync(f.install), ["Agents Anywhere.app"]);
});

test("支持复用编译结果且安装后不启动", (t) => {
  const f = fixture(t);
  const result = f.run({}, ["--skip-build", "--no-open"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(f.argsFile, "utf8"), /--skip-build/);
  assert.equal(fs.existsSync(f.openFile), false);
});

for (const [variable, expectedStatus] of Object.entries({ FAIL_BUILD: 17, FAIL_COPY: 18, FAIL_REPLACE: 20, APP_RUNNING: 19 })) {
  test(`${variable} 时保留或恢复旧应用`, (t) => {
    const f = fixture(t);
    const result = f.run({ [variable]: "1" });
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.equal(fs.readFileSync(path.join(f.target, "original"), "utf8"), "old");
    assert.deepEqual(fs.readdirSync(f.install), ["Agents Anywhere.app"]);
  });
}
