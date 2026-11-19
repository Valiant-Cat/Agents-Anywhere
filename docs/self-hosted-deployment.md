# 自部署自动发布

推送正式版本标签（如 `v2.2.1`）时，GitHub Actions 构建 Linux 镜像，再通过专用 SSH 密钥传到现有服务器。普通分支 push 不部署，预发布标签不部署。标签提交必须属于 `self-hosted` 分支，否则校验失败。
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

下载目录固定为 `/opt/agents-anywhere/downloads`，只读挂载到容器 `/downloads`。发布代码不自动生成或上传桌面安装包。文件布局与原子替换步骤见[桌面安装包下载](api/desktop-downloads.md)。

## 手动运维

部署后执行 Compose 命令应包含以下文件，避免切回旧镜像或丢失下载挂载：

```sh
docker compose -p agents-anywhere \
  --env-file /opt/agents-anywhere/.env \
  -f /opt/agents-anywhere/Agents-Anywhere-main/docker/docker-compose.postgres.yml \
  -f /opt/agents-anywhere/Agents-Anywhere-main/docker/docker-compose.local.yml \
  -f /opt/agents-anywhere/deploy/image.yml ps
```

应用所用提交记录在 `/opt/agents-anywhere/deploy/current-release`。部署日志可在 Actions 查看；私钥不打印，服务器密码不进入流水线。建议启用分支保护和 Environment 审批，因为持有该 Environment 部署权限等同于取得服务器部署权限。
