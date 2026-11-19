# 自部署自动发布

推送正式版本标签（如 `v2.2.3`）时，「自部署桌面发布」先构建 macOS 通用包和 Windows x64 安装包，两个平台均成功后创建正式 GitHub Release，再调用「自部署服务器」构建 Linux 镜像并部署。普通分支 push 不部署，预发布标签不部署。标签提交必须属于 `self-hosted` 分支，否则校验失败。
也可在 Actions 手动运行「自部署服务器」，必须选择正式版本标签，不能选择分支。

```sh
git switch self-hosted
# 先按版本规则更新各端版本与发布说明，提交并推送后再发布标签。
git tag -a v2.2.1 -m "发布 v2.2.1"
git push origin v2.2.1
```

标签指向的提交必须已经包含自动部署工作流；不要移动或覆盖已发布标签。推送标签本身不自动修改源码版本号，必须在打标签前更新版本配置；标签必须与 Server 的版本一致，否则停止部署。

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

流水线使用 Node 22 和现有打包脚本，核验包内服务地址、更新地址和版本，上传两个固定名称的附件及 SHA-256 文件；全部上传完成前 Release 保持草稿。Desktop 安装包版本临时取标签版本，不回写源码；更新比较基线仍来自该标签的 Server 版本。

签名是可选的，凭据必须放在仓库 Actions Secrets：macOS 使用 `MAC_CERT_P12_BASE64`、`MACOS_SIGN_IDENTITY`、`CSC_KEY_PASSWORD`，Apple 公证使用 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；Windows 使用 `WIN_CERT_P12_BASE64`、`WIN_CSC_KEY_PASSWORD`。不配置时构建未签名、未公证包，系统可能阻止启动，不能当作已签名正式发行包；不完整的凭据会使构建失败。流水线检查不代替真实安装和 OAuth 验证。

首次补包：在 `self-hosted` 分支推送本桌面工作流文件的变更，也会触发构建，自动读取 Server 版本并检出同名既有标签；仅补安装包，不部署 Server、不移动标签。已发布的正式 Release 不允许覆盖；失败后可以重跑草稿发布。不要手动把无附件 Release 设置为 Latest。

手动触发要求仓库默认分支也包含本工作流；满足这个条件后，已有标签可在「自部署桌面发布」选择 `self-hosted` 分支，填写 `release_tag` 后手动补包，不再次部署 Server。

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
