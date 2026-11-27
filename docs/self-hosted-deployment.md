# 自部署自动发布

推送正式版本标签（如 `v2.2.0.3`）时，「自部署全平台发布」校验标签和移动端签名配置，再从同一提交构建 macOS、Windows、Android 并上传 iOS 到 TestFlight。桌面矩阵仍先 Mac 后 Windows，移动端可以同时构建。所有平台成功后才发布包含 DMG、EXE、APK 和校验文件的 GitHub Release，再部署 Web 和后端。普通分支 push 不部署，预发布标签不部署。标签提交必须属于 `self-hosted-2.2.0` 分支，否则校验失败。
也可在 Actions 手动运行「自部署服务器」，必须选择正式版本标签，不能选择分支。

```sh
git switch self-hosted-2.2.0
# 先按版本规则更新各端版本与发布说明，提交并推送后再发布标签。
git tag -a v2.2.0.3 -m "发布 v2.2.0.3"
git push origin v2.2.0.3
```

标签指向的提交必须已经包含自动部署工作流；不要移动或覆盖已发布标签。标签必须与 Server 的版本一致；桌面、Android、iOS 构建时从标签注入版本，不改写这些端的源码版本文件。四段 `2.2.0.N` 映射为系统三段 `2.2.(10000+N)`；Android 保留四段显示版本，安装编号由版本确定，不使用不同工作流的运行序号。

在 Actions 手动运行「自部署全平台发布」并指定新正式标签，也会运行完整发布及部署。不能重发已有正式 Release；失败时在草稿发布前可以重跑。iOS 上传属于独立外部操作，后续平台失败不会撤回已上传的构建；重跑使用新的 iOS 构建号。上传成功只代表 Apple 接收，不代表处理完成、审核通过或公开邀请已开放。

## 首次配置

仓库的 `self-hosted` Environment 需要：

- Secret `DEPLOY_SSH_KEY`：专用 Ed25519 私钥，不使用登录密码，不写入代码。
- Variable `DEPLOY_HOST`：服务器地址。
- Variable `DEPLOY_KNOWN_HOSTS`：经控制台确认指纹的 SSH 主机公钥记录，不在流水线中临时信任扫描结果。

服务器保留 `/opt/agents-anywhere/.env`，以及原 Compose 目录 `/opt/agents-anywhere/Agents-Anywhere-main`；流水线不替换这些文件，也不重建数据库或文件卷。
`/opt/agents-anywhere/deploy/oauth.py` 保留线上 PKCE 补丁，`oauth-source.sha256` 记录首次核对的仓库原文件哈希。仓库 OAuth 源文件变化时部署中止，必须人工核对补丁，不能直接更新哈希绕过。
当前流水线面向这台已有服务的服务器，不是通用首次安装脚本。

## 发布流程

1. GitHub Runner 构建镜像，压缩后生成 SHA-256 校验文件。
2. SSH 上传镜像与部署脚本，服务器取得部署锁并校验文件。
3. 检查 OAuth 源码基线，应用已保留的线上补丁。
4. 备份数据库到 `/opt/agents-anywhere/backups/`，保留旧应用镜像。
5. 暂停旧 Server，执行迁移，启动新 Server。
6. 本机及公网就绪检查通过后记录提交哈希；失败尝试恢复旧应用镜像。

发布有短暂维护窗口，不承诺零停机。迁移不会自动回滚：如果新数据库与旧代码不兼容，需要维护者根据迁移情况决定修复或从备份恢复，不能盲目恢复数据库。备份、旧镜像及历史接收目录不自动删除，应定期检查磁盘并按保留策略清理。

## 安装包

下载入口返回 302，跳转到 GitHub Release，服务器不存储或代理安装包。默认仓库为 `Valiant-Cat/Agents-Anywhere`，可在服务器 `.env` 设置 `AGENT_SERVER_DOWNLOAD_RELEASE_REPO=owner/repo` 后重新部署覆盖。固定文件名和发布步骤见[桌面安装包下载](api/desktop-downloads.md)。旧下载目录可以保留，但不再使用或挂载。

### 桌面流水线配置

在仓库 Settings → Secrets and variables → Actions 中设置仓库级 Variables，不提交 `.env`：

- `CLOUD_SERVER_URL`：必填，桌面 Cloud 登录所用的 HTTPS 服务源地址。
- `CLOUD_OAUTH_WEB_ORIGIN`：可选，默认同服务地址。
- `DESKTOP_UPDATE_MAC_URL`、`DESKTOP_UPDATE_WINDOWS_URL`：可选，默认分别为服务地址下的 `/download/mac/latest?from=update` 和 `/download/windows/latest?from=update`。

流水线使用 Node 22 和现有打包脚本，核验包内服务地址、更新地址和版本；全部附件上传完成前 Release 保持草稿。Desktop 安装包版本临时取标签版本，不回写源码；更新比较基线仍来自该标签的 Server 版本。

签名是可选的，凭据必须放在仓库 Actions Secrets：macOS 使用 `MAC_CERT_P12_BASE64`、`MACOS_SIGN_IDENTITY`、`CSC_KEY_PASSWORD`，Apple 公证使用 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；Windows 使用 `WIN_CERT_P12_BASE64`、`WIN_CSC_KEY_PASSWORD`。不配置时构建未签名、未公证包，系统可能阻止启动，不能当作已签名正式发行包；不完整的凭据会使构建失败。流水线检查不代替真实安装和 OAuth 验证。

旧的跨提交 Mac 补包分支已移除，避免安装包源码与标签不一致。不要手动把无附件 Release 设置为 Latest。

### Android 配置

仓库 Secrets 必须设置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。必须使用自己长期保管的正式密钥；已分发 APK 的更新必须沿用原密钥，不能为通过构建临时生成替代密钥。Android 工作流运行在 Linux 隔离 Runner，使用 JDK 17，执行 Release 单测、构建、签名核验和包版本核验。

默认服务地址使用仓库 Variable `CLOUD_SERVER_URL`，更新地址使用该地址下的 `/download/android/latest?from=update`。附件名为 `Agents-Anywhere-latest.apk` 和同名 `.sha256`；Server 必须包含对应 Android 下载路由。

### iOS 配置

仓库 Variables：`IOS_TEAM_ID`、`IOS_BUNDLE_ID`、`CLOUD_SERVER_URL`。
仓库 Secrets：`IOS_CERTIFICATE_P12`、`IOS_CERTIFICATE_PASSWORD`、`IOS_PROFILE`、`ASC_PRIVATE_KEY`、`ASC_KEY_ID`、`ASC_ISSUER_ID`。
使用现有 TestFlight 签名上传脚本，正式标签注入 `MARKETING_VERSION`，构建号使用运行序号和重跑序号。`ios-testflight-*` 和手动入口仍可单独上传，`ios-check-*` 仍只编译。

流水线不会自动提交外部 Beta 审核、添加测试员或开启公开邀请。审核通过后，将自己的邀请链接设置为 `NEXT_PUBLIC_IOS_TESTFLIGHT_URL`，重新部署 Web 才会更新下载页；不能使用上游的 TestFlight 邀请。

本流水线不是跨服务原子事务：GitHub Release 发布成功后若部署失败，安装包仍已公开，需要修复部署后重跑失败任务。发布号不得回退；数据库迁移的恢复限制见上文。

## 手动运维

部署后执行 Compose 命令应包含以下文件，避免切回旧镜像或丢失下载配置：

```sh
docker compose -p agents-anywhere \
  --env-file /opt/agents-anywhere/.env \
  -f /opt/agents-anywhere/Agents-Anywhere-main/docker/docker-compose.postgres.yml \
  -f /opt/agents-anywhere/Agents-Anywhere-main/docker/docker-compose.local.yml \
  -f /opt/agents-anywhere/deploy/image.yml ps
```

应用所用提交记录在 `/opt/agents-anywhere/deploy/current-release`。部署日志可在 Actions 查看；私钥不打印，服务器密码不进入流水线。建议启用分支保护和 Environment 审批，因为持有该 Environment 部署权限等同于取得服务器部署权限。
