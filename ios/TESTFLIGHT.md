# 自部署 TestFlight 构建

此流程仅处理 iOS 构建上传，不表示应用已通过外部测试审核。
最低系统要求保持 iOS 26.5，本机 Xcode 16.4 无法编译；工作流使用
macOS 26 和 Xcode 26.6，运行时输出实际工具链版本。

## 配置

在仓库 Actions Variables 设置：

| 变量 | 用途 |
| --- | --- |
| `CLOUD_SERVER_URL` | 自部署 HTTPS 源地址，不能包含 `/api/v2` |
| `IOS_TEAM_ID` | Apple Developer 团队 ID |
| `IOS_BUNDLE_ID` | 已注册且与 App Store Connect 应用一致的 Bundle ID |

在 Actions Secrets 设置，禁止提交到源码：

| Secret | 内容 |
| --- | --- |
| `IOS_CERTIFICATE_P12` | 含私钥的 Apple Distribution P12，使用 base64 编码 |
| `IOS_CERTIFICATE_PASSWORD` | P12 密码 |
| `IOS_PROFILE` | 对应应用的 App Store Connect 分发描述文件，使用 base64 编码 |
| `ASC_PRIVATE_KEY` | App Store Connect API 的 P8 私钥原文 |
| `ASC_KEY_ID` | API Key ID |
| `ASC_ISSUER_ID` | API Issuer ID |

仅编译模式只需要 `CLOUD_SERVER_URL`。本机 Xcode 构建可传入
`CLOUD_SERVER_URL=https://your-server.example.com` 构建设置；应用从 Info.plist
读取，未配置时保留上游默认地址。该地址会进入安装包，不是秘密；
访问令牌、密码和签名私钥不能放在这个设置里。

## 执行

1. 审查、验证并推送本次发布源码，确认远程提交；不从脏工作区发布。
2. 对对应远程分支手动运行 `iOS TestFlight`，首次保持 `upload=false`。
3. 编译与 Swift 测试通过后，完成签名材料配置，再运行 `upload=true`。
4. 检查 App Store Connect 构建处理结果，补齐测试信息和出口合规说明。
5. 配置外部测试组、提交必要审核，获得自己的公开邀请链接。
6. 将链接填入 Web 的 `NEXT_PUBLIC_IOS_TESTFLIGHT_URL` 并重新构建发布 Web。

普通分支 push 和 `v*` 版本标签不会触发本工作流。专用标签 `ios-check-*`
只编译，`ios-testflight-*` 会签名上传，用于默认分支尚未收录工作流时执行。
构建号使用工作流运行编号，
相同构建已上传后需要发起新运行而不是重跑同一次运行。
构建产物附带提交号、工具链和构建编号，签名临时文件在结束时清理。
上传成功不等于审核通过，也不等于邀请链接已经可以安装。
