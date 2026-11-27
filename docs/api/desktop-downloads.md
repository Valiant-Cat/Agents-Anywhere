# 桌面安装包下载

## 下载页面

Web 提供无需登录的 `/downloads/` 页面，支持 `?platform=mac`、`ios`、`windows`、`android`，未指定时自动选择当前设备平台。「连接手机」的下载入口使用当前服务的页面，Desktop 使用已连接服务器的地址。

Mac、Windows 和 Android 统一使用下述 `/download/<platform>/latest` 接口，跳转到自己仓库的最新正式 Release。Android 无需单独配置下载地址。iPhone / iPad 只通过 TestFlight 分发，不跳转 App Store，其入口在 Web 构建时配置，示例见 `web-next/.env.example`：

- `NEXT_PUBLIC_IOS_TESTFLIGHT_URL`：自己的 `https://testflight.apple.com/join/<邀请码>` 链接。

TestFlight 未配置或链接格式无效时，页面显示该渠道暂未开放，不使用上游地址。需要先在 App Store Connect 为自己的应用开放 TestFlight 公开邀请，页面本身不会创建或上传测试包。

Docker 构建用同名 `--build-arg` 注入；自动部署读取 GitHub `self-hosted` 环境的同名 Variables。变更后需重新构建 Web，仅修改容器运行环境不会改变静态页面。

```sh
docker build -f docker/Dockerfile \
  --build-arg NEXT_PUBLIC_IOS_TESTFLIGHT_URL=https://testflight.apple.com/join/你的邀请码 \
  -t agents-anywhere .
```

## 安装包接口

下载入口独立于 `/api/v2`，不需要登录，返回 `302` 跳转到 GitHub Release，服务器不保存安装包、不代理下载流量。

| GET / HEAD 请求 | 最新正式 Release 中的固定附件名 |
| --- | --- |
| `/download/mac/latest` | `Agents-Anywhere-latest.dmg` |
| `/download/windows/latest` | `Agents-Anywhere-Setup-latest.exe` |
| `/download/android/latest` | `Agents-Anywhere-latest.apk` |

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
2. 上传上表三个固定名称的附件。macOS 入口不区分架构，应使用 universal 安装包；Android 应提供已签名且兼容目标设备的 APK；发布者应完成签名、校验和试装。
3. 对三个入口跟随跳转检查真实附件，再协调升级 Server 版本。

先将待发布文件命名为上表的固定名称，再上传，例如：

```sh
gh release upload v2.2.2 "/path/to/Agents-Anywhere-latest.dmg" \
  "/path/to/Agents-Anywhere-Setup-latest.exe" \
  "/path/to/Agents-Anywhere-latest.apk" \
  --repo Valiant-Cat/Agents-Anywhere
```

配置好[发布流水线变量](../self-hosted-deployment.md#桌面流水线配置)后，推送正式版本标签会自动构建两个桌面平台和 Android、上传 iOS 到 TestFlight；全部成功后发布 Release，随后部署 Web 和 Server。构建失败不会发布正式 Release 或触发本次自动部署，已上传的 TestFlight 构建不会撤回。每个作为 Latest 的正式 Release 都必须附带上述安装包，避免仅发布 Server 后下载中断。客户端需要能访问 GitHub；匿名下载不支持私有仓库。

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
