import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"

const source = (path) => readFileSync(new URL(`../src/components/${path}`, import.meta.url), "utf8")
const elements = (text, name) => {
  const result = []
  const visit = (node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === name) {
      result.push(node.getText())
    }
    ts.forEachChild(node, visit)
  }
  visit(ts.createSourceFile("component.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
  return result
}

test("项目筛选合并到唯一的右侧更多菜单", () => {
  const text = source("sidebar/projects-section.tsx")
  assert.equal(elements(text, "SessionFilterMenu").length, 0)
  assert.equal(elements(text, "DropdownMenu").length, 1)
  assert.equal(elements(text, "SessionFilterMenuItems").length, 1)
  assert.match(elements(text, "DropdownMenuContent")[0], /align="end"/)
  assert.match(text, /onSessionStatusChange\(value\)/)
  assert.doesNotMatch(text, /opacity-0/)
})

test("最近会话只保留靠右的更多入口，并传递已读操作", () => {
  const text = source("sidebar/recent-sessions-section.tsx")
  const menus = elements(text, "SessionFilterMenu")
  assert.equal(menus.length, 1)
  assert.match(menus[0], /ml-auto/)
  assert.match(menus[0], /onMarkAllRead=\{onMarkAllRead\}/)
  assert.doesNotMatch(text, /CheckCheck/)
})

test("共享菜单保留设备、Agent、清除筛选和全部已读操作", () => {
  const text = source("session-filter-menu.tsx")
  assert.doesNotMatch(text, /ListFilter/)
  assert.equal(elements(text, "MoreHorizontal").length, 1)
  assert.equal(elements(text, "FilterSection").length, 2)
  assert.match(text, /setFilter\(defaultFilter\)/)
  assert.match(text, /onSelect=\{\(\) => void onMarkAllRead\(\)\}/)
})
