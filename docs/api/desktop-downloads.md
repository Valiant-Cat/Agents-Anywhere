# 桌面安装包下载

下载入口独立于 `/api/v2`，不需要登录，返回 `302` 跳转到 GitHub Release，服务器不保存安装包、不代理下载流量。

| GET / HEAD 请求 | 最新正式 Release 中的固定附件名 |
| --- | --- |
| `/download/mac/latest` | `Agents-Anywhere-latest.dmg` |
| `/download/windows/latest` | `Agents-Anywhere-Setup-latest.exe` |

跳转目标为 `https://github.com/<owner>/<repo>/releases/latest/download/<附件名>`。
响应使用 `Cache-Control: no-store`，`from=update` 等查询参数不传递到 GitHub，也不能修改目标地址。范围请求由最终下载服务器处理。

未配置仓库、不支持的平台及其他下载路径返回 404，不回退到 Web 页面。入口不会请求 GitHub 检查附件；仓库没有正式 Release 或缺少对应附件时，入口仍返回 302，跟随跳转后由 GitHub 返回 404。

## 配置

```sh
export AGENT_SERVER_DOWNLOAD_RELEASE_REPO=Valiant-Cat/Agents-Anywhere
```

该变量必须为 `owner/repo`，不填写时禁用下载跳转，格式无效时启动报错。替代旧的 `AGENT_SERVER_DOWNLOAD_DIR`；不再需要下载目录或文件挂载。修改变量需重启服务。

Docker Compose 可叠加：

```sh
docker compose -f docker/docker-compose.postgres.yml -f docker/docker-compose.downloads.yml up -d --build
```

自动部署和 Compose 覆盖文件默认使用 `Valiant-Cat/Agents-Anywhere`。反向代理必须把 `/download/` 原样转发给 Server，不能落入前端静态页面。

## 发布安装包

1. 在公开 GitHub 仓库创建正式 Release，确认它被设置为 Latest；草稿和预发布不作为下载源。
2. 上传上表两个固定名称的附件。macOS 入口不区分架构，应使用 universal 安装包；发布者应完成签名、校验和试装。
3. 对两个入口跟随跳转检查真实附件，再协调升级 Server 版本。

先将待发布文件命名为上表的固定名称，再上传，例如：

```sh
gh release upload v2.2.2 "/path/to/Agents-Anywhere-latest.dmg" \
  "/path/to/Agents-Anywhere-Setup-latest.exe" \
  --repo Valiant-Cat/Agents-Anywhere
```

配置好[桌面流水线变量](../self-hosted-deployment.md#桌面流水线配置)后，推送包含新工作流的正式版本标签会自动构建两个平台、上传安装包并发布 Release，随后才部署 Server；旧标签通过手动运行「自部署桌面发布」补包。构建失败不会发布正式 Release 或触发本次自动部署。每个作为 Latest 的正式 Release 都必须附带上述安装包，避免仅发布 Server 后下载中断。客户端需要能访问 GitHub；匿名下载不支持私有仓库。

Desktop 原来的 `.env` 下载入口无需更改：

```dotenv
DESKTOP_UPDATE_MAC_URL=https://your-server.example.com/download/mac/latest?from=update
DESKTOP_UPDATE_WINDOWS_URL=https://your-server.example.com/download/windows/latest?from=update
```

验证示例：

```sh
curl -I https://your-server.example.com/download/mac/latest
curl -fIL https://your-server.example.com/download/mac/latest
```

第一条应返回 302 和正确的 `Location`；第二条用于验证最终附件可下载。版本检查仍基于 `/api/v2/health`，不会自动验证 Release 或安装包版本。
