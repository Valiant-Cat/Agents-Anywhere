# Agents Anywhere 远程设备（DSH 插件）

在 DeepSeek Harness（DSH）里作为客户端使用 Agents Anywhere：登录服务端，查看设备与远程会话，读取远程时间线，向远程 Runtime 发消息。任务在远程设备上执行，插件只和 Server 通信。

插件提供两种入口：

- **侧边栏「Agents Anywhere」入口**：导航行改名为 Agents Anywhere，点开是设备/会话/时间线主面板（内置工作区列表保持不变）。
- **「更多」菜单**：菜单里也列出设备（在线状态 + 活跃会话数），点设备直接打开主面板，不用先切面板。
- **主面板**：左侧是可折叠的「设备」分组（在线点、设备名、会话数），展开后是该设备的远程会话，右侧显示所选会话的时间线；可在面板里登录。
- **Agent 工具**：六个 `aa_*` 工具，让 Agent 在对话里读写远程会话。

这是与 [`dsh-bridge-next`](../dsh-bridge-next/) 方向相反的插件：

| 插件 | 方向 | 用途 |
| --- | --- | --- |
| `dsh-bridge-next` | DSH → Agents Anywhere | 把本机 DSH 会话同步出去，在手机 / Web 上查看和继续 |
| `dsh-remote-next`（本包） | Agents Anywhere → DSH | 在 DSH 里操作其他设备上的远程会话 |

## 工具

| 工具 | 作用 |
| --- | --- |
| `aa_login` | 浏览器 OAuth 登录，凭据写入 DSH 凭据存储 |
| `aa_account` | 账号与凭据状态 |
| `aa_devices` | 设备（Connector）列表与在线状态 |
| `aa_sessions` | 远程会话列表，支持设备过滤与关键词搜索 |
| `aa_timeline` | 读取远程会话最近的时间线条目 |
| `aa_send` | 向远程会话发消息，可选等待回复 |

面板和工具共用同一份登录状态：在面板里登录后，Agent 工具立即可用；反之亦然。

## 安装

通过 DSH 的 `plugin_manager` 从源码目录安装（本地目录会被链接，修改后重启生效）：

```text
install_bundle target=/absolute/path/to/Agents-Anywhere/dsh-remote-next
```

或在 DSH Desktop 的「插件」页面添加本地目录。插件没有 npm 依赖，不需要构建步骤，也不用允许任何安装脚本。

## 配置

默认连接 Agents Anywhere Cloud。自托管时在 profile 的 `cordis.patch.yml` 覆盖：

```yaml
- id: agents-anywhere
  name: '@vvicat/dsh-agents-anywhere'
  config:
    serverUrl: https://your-server.example.com
```

页面从同源路径 `/agents-anywhere/*` 读取数据；Host 在激活时生成一个随机令牌，只注入经过 DSH 鉴权的首页，页面带 `x-agents-anywhere-token` 才能取数，其他本地调用会得到 401。已打开的页面需要刷新一次才能拿到新令牌。

## 认证

使用 Agents Anywhere 的 first-party loopback OAuth 客户端（`agents-anywhere-dsh-plugin`，仅允许 `http://127.0.0.1:<端口>/oauth/callback`），与 `dsh-bridge-next` 相同的授权流程；access token 以凭据记录 `agents-anywhere-remote/account` 保存，不进入配置。token 过期后重新调用 `aa_login`。若后续需要独立客户端身份，可在 `server/agent_server/core/oauth_clients.py` 增加专用 client id。

## 限制

- DSH 的侧边栏工作区是单个槽位（first-wins），插件无法可靠地在其中插入分组；替换它会让内置工作区列表消失，因此设备列表放在主面板，侧边栏只保留导航行。
- 面板目前只读：查看设备、会话和时间线；发消息仍走 `aa_send` 工具。
- 没有实时推送：面板按需刷新，`aa_send` 的等待使用短轮询。
- 页面首次加载需要刷新一次，令牌随首页注入后才可用。
- 远程设备必须在线且 Runtime 正常运行。
- 时间线为有界读取，长文本会截断。

## 校验

```bash
cd dsh-remote-next && npm run check
```

`check` 先做语法检查，再用本地桩服务跑 `node:test`（设备、会话、时间线、发消息、未登录、跨服务器 token 六条路径）。安装后确认两处注册：Host `Tool` → `listTools` 应出现 `aa_*` 六个工具；Client `Slots` → `listSubTree` 的 `sidebar.panellist` 与 `main` 应出现 `agents-anywhere`。
## 与 DSH 统一身份（侠猫 OIDC）

Agents Anywhere 在这个插件里**没有独立登录或退出**：会话完全跟随 DSH 的侠猫统一身份。

- DSH 已登录侠猫时：插件把 `vvicat-authorization/default` 里的侠猫令牌交给实例的 `POST /api/v2/auth/oauth/exchange` 换取 AA 会话；DSH 退出侠猫后，插件会删除本地 AA 会话，且服务端只签发 15 分钟短令牌，最长 15 分钟内必然失效。
- 首次使用：实例开启 OAuth 注册时按侠猫 `sub` 自动建号；已有同邮箱账号且侠猫返回 `email_verified: true` 时自动绑定；否则由管理员处理。
- 云端实例（`web.agents-anywhere.com`）目前没有该交换接口，需官方部署；自托管实例需包含该接口的 Server 版本。

实例侧仍需配置侠猫 OIDC：authorize/token/userinfo 取自 `https://account.vvicat.com/.well-known/openid-configuration`，回调 `https://<实例域名>/api/v2/auth/oauth/callback`，scopes `openid profile email`，claims `sub` / `preferred_username` / `email` / `name`。


## DSH 会话级关联与上下文

支持存储的 profile 会额外提供 `aa_binding`：`set` 关联当前 DSH 会话与一个已存在的远程会话，`get` 校验该关联的账号归属及远程状态，`clear` 解除关联。关联前先用 `aa_devices` / `aa_sessions` 发现目标。

关联按 DSH 会话 ID 持久化存储，不同对话不会共享选中目标；恢复原对话后可读取原关联。设置关联不会发送消息、启动任务或自动回复审批，远程工作仍需显式调用 `aa_send`。

插件通过 DSH 的 systemPrompt.context 注册轻量发现说明与当前会话的关联摘要。不会自动读取全部设备/远程历史，不会将远程 Agent 伪装成本地子智能体。关联摘要是已存元数据，不代表在线状态；操作前使用 `aa_binding get` 校验，完整进展用 `aa_timeline` 按需读取。切换 AA 账号或服务后，原关联不能直接用于新账号。

当前页面仍是设备/时间线浏览器；本轮的关联入口是 Agent 工具，不是面板按钮。新建远程会话、实时对话输入框及审批 UI 尚未实现。


## 远程会话详情与操作

点击最近会话，初次读取最新 100 条原始时间线记录并定位到底部；可加载更早记录，工具结果和系统条目折叠查看完整 JSON，消息正文不再使用模型工具的 1200 字摘要。详情每 5 秒轮询刷新（不是 WebSocket 实时流），向上读历史时不强制滚动到底部。

顶部提供「刷新最新」「接管会话／释放接管」「中断」，底部为消息输入框。发送、中断与交互响应依据服务端有效能力启用，服务端调用前再次校验；接管会影响账号下其它客户端，并可能派发此前排队消息，必须用户确认。释放不是停止当前任务。

新增 `aa_session_control`，为 Agent 提供 inspect/takeover/release/interrupt；只有用户明确要求控制时才能接管。页面的发送操作与控制工具共用 Host 业务实现。审批/提问通过 notice 返回的 actionId 手动响应，Agent 控制工具不提供审批动作。复杂表单暂用原始 JSON Schema 提示和 JSON 输入，不是完整的可视化表单。

本轮未实现：附件上传、模型/权限切换、队列管理、新建会话、归档/重命名、WebSocket 流式更新。不能将本面板称为所有 AA 客户端能力的完全替代。
