import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";

const localEnv = new URL("../.env", import.meta.url);
if (existsSync(localEnv)) loadEnvFile(localEnv);

export function resolveDesktopConfig(base, env = process.env) {
  const origin = (value) => {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/") {
      throw new Error("桌面服务地址必须是 HTTP/HTTPS 源地址，不能包含路径、凭据或查询参数。");
    }
    return url.origin;
  };
  const server = env.CLOUD_SERVER_URL?.trim();
  const web = env.CLOUD_OAUTH_WEB_ORIGIN?.trim();
  const cloud = {
    ...base.cloud,
    serverUrl: server ? origin(server) : base.cloud.serverUrl,
    oauthWebOrigin: web ? origin(web) : server ? origin(server) : base.cloud.oauthWebOrigin,
  };
  const selfHosted = cloud.serverUrl !== origin(base.cloud.serverUrl) ||
    cloud.oauthWebOrigin !== origin(base.cloud.oauthWebOrigin);
  const downloadUrls = { ...base.updates.downloadUrls };
  for (const [platform, variable] of [
    ["darwin", "DESKTOP_UPDATE_MAC_URL"],
    ["win32", "DESKTOP_UPDATE_WINDOWS_URL"],
  ]) {
    const value = env[variable]?.trim();
    if (value === undefined) {
      if (selfHosted) downloadUrls[platform] = "";
      continue;
    }
    if (value) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hash ||
          url.hostname.endsWith(".invalid")) {
        throw new Error(`${variable} 必须是有效的 HTTPS 下载地址，不能包含凭据或片段。`);
      }
    }
    downloadUrls[platform] = value;
  }
  return {
    ...base,
    cloud,
    updates: { ...base.updates, downloadUrls },
  };
}

export function readDesktopConfig() {
  return resolveDesktopConfig(JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8")));
}
