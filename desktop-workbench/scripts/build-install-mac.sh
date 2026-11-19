#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="/Applications"
SKIP_BUILD=0
OPEN_APP=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --no-open) OPEN_APP=0; shift ;;
    --install-dir)
      [[ $# -ge 2 && "$2" = /* ]] || { echo "安装目录必须是绝对路径。" >&2; exit 1; }
      INSTALL_DIR="$2"; shift 2 ;;
    --help)
      echo "用法：$0 [--skip-build] [--no-open] [--install-dir /Applications]"
      echo "默认完整构建当前 Mac 架构，安装并打开应用；--skip-build 仅复用编译结果，仍会重新打包。"
      exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 1 ;;
  esac
done

[[ "$(uname -s)" = Darwin ]] || { echo "该脚本只能在 macOS 运行。" >&2; exit 1; }
case "$(uname -m)" in
  arm64) ARCH=arm64; OUTPUT=mac-arm64 ;;
  x86_64) ARCH=x64; OUTPUT=mac ;;
  *) echo "不支持当前 Mac 架构。" >&2; exit 1 ;;
esac

# 与项目要求保持一致，避免子进程误用系统的其他 Node 版本。
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 22 ? 0 : 1)' 2>/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    source "$NVM_DIR/nvm.sh"
    nvm use 22
  fi
fi
node -e 'if (Number(process.versions.node.split(".")[0]) !== 22) { console.error("请先安装并启用 Node 22。"); process.exit(1); }'
command -v corepack >/dev/null || { echo "找不到 Corepack，请先安装项目要求的 Yarn。" >&2; exit 1; }
[[ -d "$INSTALL_DIR" && -w "$INSTALL_DIR" ]] || {
  echo "安装目录不存在或不可写：$INSTALL_DIR。请先为当前用户配置写入权限。" >&2
  exit 1
}

cd "$ROOT"
echo "构建 macOS $ARCH 桌面应用……"
if [[ "$SKIP_BUILD" = 1 ]]; then
  corepack yarn dist:mac "--$ARCH" --skip-build
else
  corepack yarn dist:mac "--$ARCH"
fi
SOURCE="$ROOT/release/$OUTPUT/Agents Anywhere.app"
[[ -x "$SOURCE/Contents/MacOS/Agents Anywhere" ]] || {
  echo "未找到有效的构建产物：$SOURCE" >&2; exit 1
}

TARGET="$INSTALL_DIR/Agents Anywhere.app"
[[ ! -L "$TARGET" ]] || { echo "目标应用是符号链接，停止覆盖：$TARGET" >&2; exit 1; }
STAGING="$(mktemp -d "$INSTALL_DIR/.agents-anywhere-install.XXXXXX")"
BACKUP="$STAGING/previous.app"
NEW="$STAGING/Agents Anywhere.app"
cleanup() {
  local status=$?
  if [[ -e "$BACKUP" && ! -e "$TARGET" ]]; then
    if ! mv "$BACKUP" "$TARGET"; then
      echo "自动恢复失败，旧应用保留在：$BACKUP" >&2
      exit 1
    fi
  fi
  rm -rf "$STAGING"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "暂存新应用……"
ditto "$SOURCE" "$NEW"
[[ -x "$NEW/Contents/MacOS/Agents Anywhere" ]]
if pgrep -x "Agents Anywhere" >/dev/null; then
  osascript -e 'tell application id "dev.agentsanywhere.workbench" to quit'
  for ((i=0; i<30; i++)); do
    pgrep -x "Agents Anywhere" >/dev/null || break
    sleep 1
  done
  if pgrep -x "Agents Anywhere" >/dev/null; then
    echo "旧应用仍在运行，请正常退出后重试；未覆盖原应用。" >&2
    exit 1
  fi
fi
if [[ -e "$TARGET" ]]; then mv "$TARGET" "$BACKUP"; fi
mv "$NEW" "$TARGET"
echo "已安装：$TARGET"
if [[ "$OPEN_APP" = 1 ]]; then open "$TARGET"; fi
