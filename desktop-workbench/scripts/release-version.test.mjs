import test from "node:test";
import assert from "node:assert/strict";
import { packageVersion } from "./release-version.mjs";

test("自部署产品版本映射到递增的安装器版本", () => {
  assert.equal(packageVersion("2.2.0.1"), "2.2.10001");
  assert.equal(packageVersion("2.2.0.2"), "2.2.10002");
  assert.equal(packageVersion("2.2.4"), "2.2.4");
  for (const value of ["2.2.0.0", "2.2.0.10000", "2.2.1.1", "invalid"]) {
    assert.throws(() => packageVersion(value));
  }
});
