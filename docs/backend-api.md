# 后端 API 与可验证示例

> `0.5.0` 说明：本文保留旧 `health/generate/revise` 的完整兼容手册。
> 新产品 `/api/v1` 已实现，资源路径、对象状态和请求示例以
> `docs/backend-next-phase-handoff.md` 为准，机器协议见
> `packages/contracts/schemas/platform-v1.schema.json`，模型空端口见
> `docs/model-integration.md`。当前服务端使用 Node SQLite 和私有媒体目录，旧接口
> 的方案同样会进入持久 PlanAsset/PlanVersion。

## 1. 成熟度与范围

当前后端是比赛阶段的“可联调集成原型”：

- 已定义 `AICard v1`、生成请求和调整请求协议。
- 默认 `demo` 模式不依赖网络或第三方服务。
- 预算、安装方式、保留家具、尺寸、库存和宠物安全由确定性代码校验。
- 可选通过团队自有 HTTP 网关接入真实空间理解；非法响应、超时或网络失败会返回同协议 Demo 降级结果。
- 已包含比赛 P0 SQLite 和本地私有图片存储；不包含真实登录、限流、真实库存、
  交易、抖音私有接口或生产级对象存储。

“服务可运行”不等于“真实模型已接通”。调用结果必须通过 `source_mode` 和
`data_sources` 判断：

| `source_mode` | 含义 |
| --- | --- |
| `demo` | 全部使用仓库内明确标注的演示资料 |
| `live` | 房间理解来自已配置的 Agent Plan 或真实 HTTP 网关；效果图需另看 `render.is_demo_asset`，商品与教程仍可能是 Demo |
| `fallback` | 请求过真实 Provider，但因未配置、鉴权、限流、超时、网络或协议错误降级为 Demo |

## 2. 对象所有权

- `RoomProfile`：稳定的空间事实、置信度和不确定项。
- `InspirationProfile`：一次可替换的灵感理解结果。
- `UserConstraints`：本次任务的预算、硬约束、软偏好和目标。
- `ProductCandidate`：商品事实与来源；价格、尺寸、安装方式和库存只在这里维护。
- `DesignPlan`：版本化方案，只通过 `product_ids` 引用商品，不复制商品详情。
- `ValidationReport`：绑定具体 `plan_id + version` 的确定性校验结果。
- `AICard`：前端组合视图，不是底层事实来源。

三套方案的表达方式：

- 顶层 `plan / validation / products / render` 是当前推荐方案。
- `alternatives[]` 中每项包含另一套完整可渲染组合。
- 调整预算后返回新的 `DesignPlan.version`，不原地修改旧版本。
- 首次生成和每次调整都会创建含当前 `request_id` 的唯一 `plan_id`；不能把
  `plan_id + version` 当成跨请求可复用模板名。

## 3. 状态

`AICard.status`：

| 状态 | 行为 |
| --- | --- |
| `ready` | 有可执行方案；校验仍可能包含“购买前复测”警告 |
| `fallback_ready` | 有可执行方案，但真实空间理解已降级 |
| `needs_input` | 信息或预算不足；`follow_up` 说明需要补什么 |

`ValidationReport.overall_status`：

- `pass`：确定性规则全部通过。
- `needs_confirmation`：没有失败项，但尺寸等事实仍需用户确认。
- `failed`：当前组合违反预算、安装或安全等硬规则。
- `blocked`：还没有可校验的方案。

## 4. 运行

要求 Node.js 22.5 或更高版本（推荐 Node 24），不需要安装第三方依赖。

在项目根目录一键启动：

```powershell
npm.cmd run start:all
```

也可分别启动：

```powershell
npm.cmd run start:web
npm.cmd run start:backend
```

- Web：`http://127.0.0.1:8765`
- API：`http://127.0.0.1:8787`

当前前端以 `REMIX_DATA` 提供离线样例与灵感选择；完整流程会把压缩后的用户图片、
预算和约束提交到 `/api/generate`，把 AICard 映射为方案，并用 `/api/revise` 创建
¥300 版本。页面只做请求构建和 AICard 展示，不拥有预算或硬约束规则。下一阶段再
迁移到持久 `/api/v1/media → space → DesignRequest → Run`。

## 5. 接口

### `GET /api/health`

返回服务状态、协议/API 版本、运行模式、鉴权模式、SQLite migration、上传限制、
Repository 数量、模型端口能力和运行时间。
健康检查不会尝试调用模型。

### `POST /api/generate`

请求：

```json
{
  "schema_version": "1.0",
  "room_input": {
    "room_id": "demo-room-001",
    "image": {
      "reference": "./assets/desk-before.png",
      "media_type": "image/png"
    },
    "reference_width_cm": 120,
    "quality_hint": "clear"
  },
  "inspiration_input": {
    "inspiration_id": "demo-inspiration-warm",
    "source_type": "demo",
    "style_key": "warm"
  },
  "constraints": {
    "budget_cny": 500,
    "hard_constraints": [
      "no_drilling",
      "keep_desk",
      "keep_chair"
    ],
    "soft_preferences": [
      "clean_but_lived_in"
    ],
    "goals": [
      "organization",
      "ambient_lighting"
    ]
  },
  "options": {
    "analysis_mode": "demo",
    "include_trace": true
  }
}
```

v1 硬约束只接受 `no_drilling`、`keep_desk`、`keep_chair`、`pet_safe`。
未知硬约束会返回 422，不能被静默忽略。`soft_preferences` 当前只记录在协议中，
尚不参与自动筛选或排序。

图片字段支持：

- `reference`：前端自己可解析的资源引用。
- `data_url`：需要真实网关分析时使用的 JPEG、PNG 或 WebP Data URL。

两者至少一个。服务不把 Data URL 写入文件、AICard 或日志；若使用真实网关，
Data URL 只存在于当前请求内存和上游调用中。运行时会核对 Base64 形式、声明媒体
类型和 JPEG/PNG/WebP 文件签名；`reference` 只接受受控本地引用或 HTTPS URL。
默认请求上限为 6 MB。

当前灵感目录仍是 Demo。即使输入 `source_type=user_owned` 或
`authorized_public`，后端也只按 `style_key` 选本地 `InspirationProfile`，输出
`source_type=demo` 并附 `inspiration_source_not_connected` 警告。

如果完整模板超过预算，但 187 元最低组合仍可执行，生成接口会按 compact
保留优先级重组。例如 300 元请求直接返回 4 件、240 元方案；低于 187 元才返回
预算不足的 `needs_input`。

### `POST /api/revise`

请求：

```json
{
  "schema_version": "1.0",
  "request_id": "上一条 generate 返回的 request_id",
  "plan_id": "上一条 AICard 中的 plan_id",
  "target_budget_cny": 300
}
```

服务会创建新版本方案，并同步返回：

- 新商品组合。
- 删除/增加的商品 ID 和调整理由。
- 新总价。
- 与新组合一致的 `ValidationReport`。

v1 只支持把预算压低：`target_budget_cny` 必须低于所选父方案总价；相同或更高
目标返回 422 `target_budget_not_lower`，不会无理由切换成 compact 模板。
预算调整复用父卡的 `RoomProfile`，不会重新调用空间分析，因此新卡会沿用原
`room_analysis.updated_at`，同时用新的 `generated_at` 标记本次组合时间。

生成结果只在当前进程内保留 30 分钟，且最多保留 200 张 AICard；达到上限时淘汰最早条目。服务重启、过期、被淘汰或 `request_id` 不存在时返回结构化 404；前端应提示重新生成或使用本地 Demo，不应把它显示成一次成功调整。

## 6. 可复制验证

最简单的一条命令会在随机空闲端口启动进程内 API，完成
`health → generate → revise(300)`，然后自动关闭：

```powershell
npm.cmd run demo:backend
```

完整自动测试：

```powershell
npm.cmd run check
```

手动调用已启动的 API：

```powershell
$generateBody = Get-Content .\examples\requests\generate.main.json -Raw
$card = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/generate `
  -ContentType 'application/json' `
  -Body $generateBody

$reviseBody = @{
  schema_version = '1.0'
  request_id = $card.request_id
  plan_id = $card.plan.plan_id
  target_budget_cny = 300
} | ConvertTo-Json

$revised = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8787/api/revise `
  -ContentType 'application/json' `
  -Body $reviseBody

if ($revised.plan.total_price_cny -gt 300) {
  throw '预算验收失败'
}

$revised.plan
$revised.validation
```

可直接阅读的固定文件：

- `examples/requests/generate.main.json`
- `examples/requests/generate.missing-dimension.json`
- `examples/requests/generate.low-budget.json`
- `examples/requests/revise.to-300.json`
- `examples/aicard.demo.json`

## 7. Live 空间理解 Provider

后端启动时依次读取操作系统环境、项目根目录 `.env` 和 `.env.local`；操作系统/
部署平台环境变量优先。`.env.local` 已被 Git 忽略，只用于本机密钥。

### 7.1 Agent Plan 个人版

把 Agent Plan 专属 Key 写入 `.env.local`，不要写进 `.env.example`：

```text
AI_BACKEND_MODE=auto
ROOM_ANALYZER_PROVIDER=agent_plan
AGENT_PLAN_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
AGENT_PLAN_API_KEY=<只放 .env.local，不提交>
AGENT_PLAN_TEXT_MODEL=doubao-seed-2.0-lite
AGENT_PLAN_IMAGE_MODEL=doubao-seedream-5.0-lite
AGENT_PLAN_TIMEOUT_MS=30000
AGENT_PLAN_IMAGE_TIMEOUT_MS=90000
AGENT_PLAN_IMAGE_RESPONSE_LIMIT_BYTES=25165824
ROOM_ANALYZER_RESPONSE_LIMIT_BYTES=262144
```

先运行 `npm run check:agent-plan` 做一次最多 16 输出 token 的低消耗鉴权检查。
它只打印状态、模型和用量。空间理解调用
`/chat/completions`，只接受本次请求中的图片 data URL 或 HTTPS URL；本地路径、
`client://` 和私有逻辑引用不会被转发，会明确 fallback。

Agent Plan 模型只负责可见空间事实候选。`room_id`、用户确认的参考宽度、预算、
商品事实和硬约束仍由本地代码拥有；模型返回正文必须转换为合法 `RoomProfile`
并再次通过协议校验。专属 Base URL 被限制为官方北京网关，不能改成中转站。

当请求不是 Demo 且主方案有效时，后端还会调用同一专属网关的
`POST /images/generations`，使用 `doubao-seedream-5.0-lite` 基于原图生成一张
主效果图。响应图片通过 Base64、MIME、签名、大小和图片结构校验后进入私有媒体，
持久对象只保存逻辑引用。失败时增加 `render_*` warning 并回退 Demo 图，结构化
方案继续成功。候选方案和 `/api/revise` 当前不自动重绘。

### 7.2 团队自有网关

也可以继续选择原有自有网关：

```text
AI_BACKEND_MODE=auto
ROOM_ANALYZER_PROVIDER=gateway
ROOM_ANALYZER_URL=https://team-gateway.example/room-profile
ROOM_ANALYZER_API_KEY=<只放本地环境，不提交>
ROOM_ANALYZER_TIMEOUT_MS=8000
ROOM_ANALYZER_RESPONSE_LIMIT_BYTES=262144
```

后端向网关发送：

```json
{
  "schema_version": "1.0",
  "task": "extract_room_profile",
  "room_input": {},
  "output_contract": {
    "name": "RoomProfile",
    "schema_version": "1.0"
  }
}
```

网关可以直接返回 `RoomProfile`，也可以返回
`{"room_profile": { ... }}`。返回内容在进入 Workflow 前必须通过协议校验。

网关边界：

- 公网 URL 必须为 HTTPS；仅无密钥的回环地址允许 HTTP，URL 禁止内嵌凭据。
- 全局 `AI_BACKEND_MODE=demo` 是锁定开关，客户端 `analysis_mode=live` 不能覆盖。
- 后端只转发 `room_input` 白名单字段，不跟随重定向。
- 上游 JSON 默认最多 256 KiB，且返回 `room_id` 必须与请求一致。
- 超时、不可用、过大响应、非法协议或房间不匹配均诚实返回 `fallback`。

未提供真实 Provider 凭据并记录一次成功调用时，只能验收 Demo 与降级链路，不能把
`source_mode=demo/fallback` 描述成真实多模态调用。

## 8. 数据、隐私和安全

- 不记录请求体、图片、Authorization、Cookie、用户原文或密钥。
- 结构化日志只记录 `request_id`、路径、状态、耗时、`source_mode` 和错误代码。
- CORS 默认只允许本机 8765 的 `127.0.0.1` 与 `localhost`。
- 成功和错误响应都禁止缓存；错误不返回堆栈或环境变量。
- API 设置请求、Header、连接与 Keep-Alive 超时；5xx 只返回通用错误。
- 商品、库存和教程均明确标注 Demo；首次主方案效果图可以是 Seedream Live，
  候选与调整后效果图仍是 Demo。两类来源必须在页面分开标记。
- 当前仍无真实账号；服务端已有 SQLite 方案历史，但旧页面保存按钮仍只是浏览器
  本地状态，正式保存应 PATCH `/api/v1/plans/{plan_asset_id}`。
