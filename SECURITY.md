# 安全政策

## 支持范围

当前 P0 不处理真实账号或交易，但后端会把用户明确上传的房间图片清理后保存到
非静态私有目录，并可在运行时转发到团队配置的空间理解网关。安全报告应覆盖：

- 提交到仓库的访问令牌和私钥。
- 私有上传被越权读取、未按 retention 删除或意外进入静态目录。
- 路径遍历、脚本注入和不安全的外部链接。
- 未来 API 的越权、数据泄漏和日志敏感信息。

## 当前 API 防护

- JSON 请求体默认不超过 6 MB；multipart 单图默认不超过 20 MB。
- JPEG/PNG/WebP 会同时校验扩展名、MIME 和真实签名，并清理 EXIF/GPS/XMP/IPTC/
  文本元数据；颜色关键的 ICC/Adobe 信息保留。
- 媒体保存在 `PRIVATE_MEDIA_DIRECTORY`，通过绑定 actor/media/purpose/过期时间的
  HMAC 短时 URL 访问，响应同样受精确 CORS 控制。
- CORS 默认仅允许本机 8765 的 `127.0.0.1` 与 `localhost`。
- 非回环监听必须同时配置 8～128 字符的 `DEMO_ACCESS_CODE` 和至少 32 字节的
  `SESSION_SIGNING_SECRET`；缺任一项时服务拒绝启动。
- 公网入口使用 HMAC 签名、短期、`HttpOnly; Secure; SameSite=Lax` 会话 Cookie。
  未登录只能读取精简健康状态，其他 API 返回 401。
- 认证尝试、通用 API 和昂贵 AI 请求分别限流；真实 AI 另有进程级并发上限与
  `AI_REQUESTS_ENABLED` 紧急总开关。只有显式 `TRUST_PROXY=true` 时才信任第一跳
  `X-Forwarded-For`。
- 上游地址只来自服务端环境变量，客户端不能指定 URL。
- Agent Plan 专属地址被限制为官方
  `https://ark.cn-beijing.volces.com/api/plan/v3`，避免把套餐 Key 发送到中转站
  或任意自定义主机；自有网关仍使用独立 `ROOM_ANALYZER_URL/API_KEY`。
- 上游公网地址必须使用 HTTPS，禁止 URL 内嵌凭据和 HTTP 重定向；只有无密钥回环开发地址可使用 HTTP。
- 全局 Demo 模式不能被客户端升级为 Live；转发字段使用白名单，上游响应默认限制为 256 KiB，并核对房间 ID。
- 日志不记录请求体、图片、Authorization、Cookie、用户原文或密钥。
- 错误响应不暴露堆栈和环境变量。
- 成功和错误响应均禁止缓存。
- API 设置请求/Header/连接超时；5xx 仅返回通用错误。
- 资产、任务、运行、方案版本、偏好和幂等记录保存在 SQLite；数据库与媒体目录均
  在 `data/` 下并被 Git 忽略。
- 资产删除先撤销逻辑访问，再按 media binding/ref count 物理清理独占文件；临时
  资源启动时和每 10 分钟执行过期清理。

公网共享口令只适合受控比赛评审，不提供真实账号或 actor 隔离；所有评委仍共享
`demo-user-001` 数据域。正式多用户部署前必须增加真实身份、上传内容安全、独立
配额、审计和备份恢复。当前已有 P0 删除接口，但它不能替代生产级数据生命周期
治理。

## 报告方式

请使用 GitHub Private Vulnerability Reporting 提交安全问题，不要创建公开 Issue，也不要在截图中包含真实令牌或用户数据。

报告应包含影响、复现步骤、受影响版本和建议修复方式。维护者确认前，请勿公开漏洞细节。

## 密钥泄漏处理

发现密钥后应立即：

1. 撤销并轮换密钥。
2. 检查使用日志和影响范围。
3. 从当前文件和 Git 历史中移除。
4. 增加自动检查，防止再次提交。

仅删除当前文件不足以解决已经进入 Git 历史的秘密泄漏。
