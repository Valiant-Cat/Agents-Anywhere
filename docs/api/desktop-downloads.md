# 桌面安装包下载

下载入口独立于 `/api/v2`，不需要登录，供浏览器和 Desktop 更新下载使用，不参与版本比较，也不提供上传或发布管理接口。

| 请求 | 对应下载目录中的文件 |
| --- | --- |
| `GET /download/mac/latest` | `mac/latest.dmg` |
| `GET /download/windows/latest` | `windows/latest.exe` |

两条路径均支持 `HEAD`、字节范围请求（`Range`）；`from=update` 等查询参数不影响文件选择。
成功响应提供附件文件名、二进制内容类型和文件大小，使用 `Cache-Control: no-store` 避免缓存旧版。
目录未配置、安装包不存在或为空、平台不支持以及其他下载路径均返回 404，不回退到 Web 页面。

## 配置与发布

设置 `AGENT_SERVER_DOWNLOAD_DIR` 为安装包根目录；不设置时禁用下载。
目录只能由可信部署者写入，不要使用用户上传目录。下载入口只允许上述固定文件，不允许通过符号链接访问根目录之外的文件。

原生运行时示例：

```sh
export AGENT_SERVER_DOWNLOAD_DIR=/srv/agents-anywhere/downloads
mkdir -p "$AGENT_SERVER_DOWNLOAD_DIR/mac" "$AGENT_SERVER_DOWNLOAD_DIR/windows"
cp "/path/to/Agents Anywhere-universal.dmg" "$AGENT_SERVER_DOWNLOAD_DIR/mac/latest.dmg.part"
mv "$AGENT_SERVER_DOWNLOAD_DIR/mac/latest.dmg.part" "$AGENT_SERVER_DOWNLOAD_DIR/mac/latest.dmg"
cp "/path/to/Agents Anywhere-Setup.exe" "$AGENT_SERVER_DOWNLOAD_DIR/windows/latest.exe.part"
mv "$AGENT_SERVER_DOWNLOAD_DIR/windows/latest.exe.part" "$AGENT_SERVER_DOWNLOAD_DIR/windows/latest.exe"
```

先复制到同目录的临时文件，再原子重命名；不要直接覆盖正在提供下载的文件。后续更新安装包不必重启 Server。
macOS 入口不区分 CPU 架构，应发布 universal 包；仅发布 arm64 包时，必须明确告知 Intel 用户不适用。Windows 同理需要发布面向目标设备的安装包。
服务器仅负责分发，不验证安装包签名或格式；发布者应先完成签名、校验及试装。

Docker Compose 部署可叠加下载配置：

```sh
export AGENT_SERVER_DOWNLOAD_HOST_DIR=/srv/agents-anywhere/downloads
docker compose -f docker/docker-compose.postgres.yml -f docker/docker-compose.downloads.yml up -d --build
```

宿主机目录需预先创建，并按上面的相对路径放置安装包；容器以只读方式挂载。
反向代理必须把 `/download/` 原样转发给 Server，不能落入前端静态页面的 fallback，生产环境应使用 HTTPS。

Desktop 构建目录的 `.env` 配置：

```dotenv
DESKTOP_UPDATE_MAC_URL=https://your-server.example.com/download/mac/latest?from=update
DESKTOP_UPDATE_WINDOWS_URL=https://your-server.example.com/download/windows/latest?from=update
```

部署后检查：

```sh
curl -fI https://your-server.example.com/download/mac/latest
curl -fI https://your-server.example.com/download/windows/latest
curl -f -H 'Range: bytes=0-15' https://your-server.example.com/download/mac/latest
```

HEAD 应返回 `200`、二进制内容类型和正确大小；范围请求应返回 `206`。
先发布并验证安装包，再协调升级 Server 版本；当前 Desktop 仍通过 `/api/v2/health` 的版本决定是否提示更新，本接口不会核实它与安装包版本是否一致。
