export function packageVersion(version) {
  if (/^\d+\.\d+\.\d+$/.test(version)) return version;
  const match = /^(\d+)\.(\d+)\.0\.(\d+)$/.exec(version);
  if (!match || Number(match[3]) < 1 || Number(match[3]) > 9999) {
    throw new Error(`不支持的自部署版本：${version}`);
  }
  // 系统安装器保留三段版本；产品版本由 Server 和 build-info 记录。
  return `${match[1]}.${match[2]}.${10000 + Number(match[3])}`;
}
