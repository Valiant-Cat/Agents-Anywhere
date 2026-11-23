import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { compareUpdateVersions } from "./update-version";

const exec = promisify(execFile);

// 独立进程等待旧主进程退出后替换；不操作用户数据，也不关闭系统安全检查。
export const MAC_UPDATE_SCRIPT = `#!/bin/sh
set -eu
parent="$1"
target="$2"
staged="$3"
backup="$4"
status="$5"
exec >>"$status" 2>&1
echo waiting
count=0
while kill -0 "$parent" 2>/dev/null; do
  count=$((count + 1))
  if [ "$count" -ge 120 ]; then echo quit-timeout; exit 1; fi
  sleep 1
done
if [ ! -d "$target" ] || [ ! -d "$staged" ] || [ -e "$backup" ]; then
  echo invalid-install-paths
  exit 1
fi
mv "$target" "$backup"
if ! mv "$staged" "$target"; then
  mv "$backup" "$target"
  echo rolled-back
  /usr/bin/open "$target" || true
  exit 1
fi
if ! /usr/bin/open -n "$target"; then
  mv "$target" "$staged"
  mv "$backup" "$target"
  echo rolled-back
  /usr/bin/open "$target" || true
  exit 1
fi
echo launch-requested-backup-retained
`;

export function validateUpdateBundle(
  info: Record<string, unknown>, appId: string, currentVersion: string,
): string {
  if (info.CFBundleIdentifier !== appId) throw new Error("更新包的应用标识不匹配。");
  const version = info.CFBundleShortVersionString;
  if (typeof version !== "string" || compareUpdateVersions(version, currentVersion) !== 1) {
    throw new Error("更新包版本不高于当前版本。");
  }
  const executable = info.CFBundleExecutable;
  if (typeof executable !== "string" || !executable || path.basename(executable) !== executable || executable === "..") {
    throw new Error("更新包缺少有效的应用入口。");
  }
  return executable;
}

export async function prepareMacUpdate(options: {
  installer: string;
  appPath: string;
  appId: string;
  currentVersion: string;
  logsDirectory: string;
}): Promise<{ start: () => Promise<void>; cancel: () => Promise<void>; backup: string; unsigned: boolean }> {
  const target = await fs.realpath(options.appPath);
  // 从 DMG 或系统转移目录运行时不能安全覆盖原安装位置。
  if (!target.endsWith(".app") || target.startsWith("/Volumes/") || target.includes("/AppTranslocation/")) {
    throw new Error("请先将应用安装到本机可写目录，再使用自动更新。");
  }
  if ((await fs.lstat(options.appPath)).isSymbolicLink()) throw new Error("不支持替换符号链接应用。");
  await fs.access(path.dirname(target), fs.constants.W_OK);
  await fs.access(target, fs.constants.W_OK);
  const mount = await fs.mkdtemp(path.join(os.tmpdir(), "aa-update-mount-"));
  let mounted = false;
  let job: string | undefined;
  let prepared = false;
  try {
    await exec("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, options.installer], { timeout: 120_000 });
    mounted = true;
    const apps = (await fs.readdir(mount, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
    if (apps.length !== 1) throw new Error("更新包必须包含一个应用。");
    const source = path.join(mount, apps[0].name);
    const { stdout } = await exec("/usr/bin/plutil", ["-convert", "json", "-o", "-", path.join(source, "Contents", "Info.plist")]);
    const executable = validateUpdateBundle(JSON.parse(stdout), options.appId, options.currentVersion);
    await fs.access(path.join(source, "Contents", "MacOS", executable), fs.constants.X_OK);
    let unsigned = false;
    try {
      await exec("/usr/bin/codesign", ["--display", source]);
    } catch (error) {
      if (!String((error as { stderr?: string }).stderr).includes("code object is not signed at all")) throw error;
      unsigned = true;
    }
    if (!unsigned) await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", source], { timeout: 120_000 });
    // 在目标同一文件系统预复制，退出后只需要原子重命名。
    job = await fs.mkdtemp(path.join(path.dirname(target), ".aa-update-"));
    await fs.chmod(job, 0o700);
    const staged = path.join(job, "new.app");
    const backup = path.join(job, "previous.app");
    await exec("/usr/bin/ditto", [source, staged], { timeout: 10 * 60_000 });
    if (!unsigned) await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", staged], { timeout: 120_000 });
    const script = path.join(job, "install.sh");
    await fs.writeFile(script, MAC_UPDATE_SCRIPT, { mode: 0o700 });
    await fs.mkdir(options.logsDirectory, { recursive: true, mode: 0o700 });
    const status = path.join(options.logsDirectory, `install-${randomUUID()}.log`);
    await fs.writeFile(status, "", { mode: 0o600 });
    const jobPath = job;
    prepared = true;
    return {
      backup, unsigned,
      cancel: () => fs.rm(jobPath, { recursive: true, force: true }),
      start: async () => {
        const child = spawn("/bin/sh", [script, String(process.pid), target, staged, backup, status], {
          detached: true, stdio: "ignore", cwd: "/", env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
        });
        await new Promise<void>((resolve, reject) => {
          child.once("error", reject);
          child.once("spawn", resolve);
        });
        child.unref();
      },
    };
  } finally {
    if (mounted) await exec("/usr/bin/hdiutil", ["detach", mount], { timeout: 30_000 }).catch(() => undefined);
    await fs.rmdir(mount).catch(() => undefined);
    if (!prepared && job) await fs.rm(job, { recursive: true, force: true });
  }
}
