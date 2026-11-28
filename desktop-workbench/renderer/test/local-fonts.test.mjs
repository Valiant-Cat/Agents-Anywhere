import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = new URL("../src/app/", import.meta.url);

test("桌面布局仅使用已内置且附带许可证的字体", () => {
  const layout = readFileSync(new URL("layout.tsx", app), "utf8");
  assert.match(layout, /from "next\/font\/local"/);
  assert.doesNotMatch(layout, /next\/font\/google/);
  const files = [...layout.matchAll(/(?:src:|path:)\s*"(\.\/fonts\/[^"]+)"/g)];
  assert.equal(files.length, 4);
  for (const [, path] of files) {
    const bytes = readFileSync(new URL(path, app));
    assert.equal(bytes.readUInt32BE(0), 0x00010000, `${path} 应为有效 TrueType 字体`);
  }
  for (const name of ["geist", "geist-mono", "instrument-serif"]) {
    assert.match(readFileSync(new URL(`fonts/${name}-OFL.txt`, app), "utf8"), /SIL OPEN FONT LICENSE/);
  }
});
