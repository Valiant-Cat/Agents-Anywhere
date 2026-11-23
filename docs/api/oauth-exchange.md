# 统一身份令牌交换

自托管 Server 提供 `POST /api/v2/auth/oauth/exchange`，用于已经持有实例配置的身份提供方 access token 的原生客户端。接口不接受客户端指定的 userinfo URL、provider 或用户身份；Server 使用实例管理员配置的 userinfo 校验令牌。

## 请求

```json
{"accessToken":"<identity-provider access token>"}
```

`accessToken` 长度为 1–8192，禁止附加字段。令牌是敏感凭据，不得记录到日志或 URL。

## 响应

返回标准 AuthResponse，另带 `expiresIn: 900`：

```json
{"userId":"usr_...","email":"user@example.com","displayName":"用户","role":"member","accessToken":"<AA token>","tokenType":"bearer","expiresIn":900,"serverTime":"..."}
```

`GET /api/v2/auth/config` 新增 `oauthExchangeEnabled`，当前与实例外部 OAuth 开关一致。旧客户端可以忽略新增字段。

## 身份映射

1. 已绑定 `(provider, subject)`：返回该账号的短期登录态。
2. 未绑定、邮箱匹配已有账号：仅当受信 userinfo 的 `emailVerifiedClaim`（默认 `email_verified`）为真时自动绑定，否则 409。
3. 新邮箱：只有 `oauthRegistrationOpen` 时创建 member 账号并绑定；不授予管理员角色。
4. 缺少邮箱返回 409；关闭注册返回 403；关闭外部 OAuth 返回 404；userinfo 拒绝令牌返回 401。

本接口无数据库迁移，复用用户与 OAuth 绑定表。无状态 AA JWT 有效期 15 分钟；客户端删除令牌不等于服务端立即吊销，旧的长效 JWT 不会被这次改动追溯撤销。

## 部署说明

必须将 API、模型和 OAuth service 的改动一起构建到 Server 镜像；仅部署临时容器补丁会在下次标准发布时丢失。部署后检查 `oauthExchangeEnabled`，并以无效令牌测试接口应返回 401 而非 405。生产数据库禁止用于自动化测试。
