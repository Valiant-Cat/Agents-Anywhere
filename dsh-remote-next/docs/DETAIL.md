# Agents Anywhere 远程设备

这个插件把 Agents Anywhere 的设备和远程会话带进 DeepSeek Harness（DSH）：侧边栏有「设备」面板，可以查看设备、展开远程会话、读取时间线并登录；在 DSH 会话里，Agent 也能通过工具做同样的事。任务仍在远程设备上执行，插件只和 Agents Anywhere Server 通信。

## 可以做什么

| 工具 | 作用 |
| --- | --- |
| `aa_login` | 打开浏览器完成 Agents Anywhere 登录，凭据保存在 DSH 的凭据存储里 |
| `aa_account` | 查看当前登录的账号、服务器地址，以及凭据是否仍然有效 |
| `aa_devices` | 列出账号下的设备（Connector）、在线状态和活跃会话数 |
| `aa_sessions` | 列出远程会话，可按设备过滤或按标题、路径搜索 |
| `aa_timeline` | 读取远程会话最近的时间线，包括消息和工具调用 |
| `aa_send` | 向远程会话发消息，可等待下一条助手回复 |

## 使用方式

**面板**：点侧边栏的「Agents Anywhere」入口（或「更多」菜单里的设备行）→ 「登录」打开浏览器授权 → 回到面板，设备列表自动出现。点设备展开它的会话，点会话在右侧查看时间线。右上角可以刷新或退出登录。

**对话**：

1. 在 DSH 里说「登录 Agents Anywhere」，Agent 会调用 `aa_login` 并打开浏览器；授权完成后回到 DSH。
2. 说「看看我有哪些设备」或「列一下远程会话」，Agent 调用 `aa_devices` / `aa_sessions`。
3. 说「读一下 sess_xxx 最近的对话」或「发给它：继续修那个测试」，Agent 调用 `aa_timeline` / `aa_send`。

面板和工具共用同一份登录状态，任一处登录后另一处立即可用。

远程设备需要保持开机、联网，并且 Connector 与 Runtime 正在运行；否则会话状态会显示离线，发消息也会失败。

## 服务器地址

默认连接 Agents Anywhere Cloud（`https://web.agents-anywhere.com`）。使用自己的服务实例时，在 profile 的 `cordis.patch.yml` 里覆盖这一行的配置：

```yaml
- id: agents-anywhere
  name: '@vvicat/dsh-agents-anywhere'
  config:
    serverUrl: https://your-server.example.com
```

`serverUrl` 只填服务地址，不要带 `/api/v2` 或页面路径。修改后重启 DSH 生效。

## 数据与限制

- 登录凭据保存在 DSH 的凭据存储中，不写入配置文件；插件不会把 token 放进 URL 或日志。
- 会话、时间线、消息内容会经过你选择的 Agents Anywhere Server；自托管时由你的服务处理。
- 时间线按条数读取并截断，单条过长会标注「已截断」。
- 「设备」在侧边栏只是一个导航入口；设备列表在主面板里，不会替换内置的工作区/会话列表（DSH 的工作区槽位是单个槽位，插件无法可靠插入分组）。
- 面板目前是只读的：查看设备、会话和时间线；发消息仍通过 `aa_send` 工具。
- 暂不支持实时推送：面板按需刷新，`aa_send` 的等待使用短轮询，最长 180 秒。
- 面板首次加载需要刷新页面一次（令牌随首页注入）。
## 与 DSH 统一身份

这个插件不能单独登录或退出 Agents Anywhere：会话由 DSH 的侠猫统一身份派生。DSH 登录侠猫后，插件自动把侠猫令牌换成 AA 会话；DSH 退出后插件清除本地会话，服务端短令牌也会在 15 分钟内失效。首次使用会自动创建或绑定 AA 账号（取决于实例的 OAuth 注册开关和侠猫返回的已验证邮箱）。云端实例暂不支持该接口。
