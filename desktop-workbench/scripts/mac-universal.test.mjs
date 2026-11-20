import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const matcher = require("minimatch");
const minimatch = matcher.minimatch ?? matcher;
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("通用包保留 Pi Runtime 两套按架构加载的原生模块", () => {
  const pattern = manifest.build.mac.x64ArchFiles;
  for (const arch of ["arm64", "x64"]) {
    const file = `Contents/Resources/pi-runtime/node_modules/@earendil-works/pi-tui/native/darwin/prebuilds/darwin-${arch}/darwin-platform.node`;
    assert.ok(minimatch(file, pattern), file);
  }
  for (const file of [
    "Contents/Resources/pi-runtime/node_modules/other/native.node",
    "Contents/Resources/pi-runtime/node_modules/other/prebuilds/linux-x64/native.node",
    "Contents/MacOS/Agents Anywhere",
  ]) {
    assert.equal(minimatch(file, pattern), false, file);
  }
});
