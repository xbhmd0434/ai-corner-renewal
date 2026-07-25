# 焕新结果商品发现 API 协议

> 状态：P0 已实现；真实图像 Agent 已接入，真实抖音商品目录仍待授权
> 协议版本：`product-discovery/1.0`
> 当前代码状态：四个接口、状态机、Live Agent、plan fallback 与 Demo Catalog 已实现
> Prompt 状态：`product-discovery-agent/1.0` 已冻结并由服务端拥有
> 更新日期：2026-07-25

## 1. 产品目标

用户看到焕新后的效果图后，系统继续完成：

```text
PlanVersion 的合格 after 图
→ 图像商品发现 Agent 识别可购买元素
→ 生成商品检索需求
→ 抖音商品目录召回与事实校验
→ 返回“画面中是什么、可以买什么、去哪里买”
→ 前端展示“把这一角搬回家”
```

本能力是 PlanVersion 的后置能力，不参与空间设计和效果图生成，也不能修改已有
PlanVersion。

## 2. 关键边界

### 2.1 Agent 只识别需求，不拥有商品事实

Agent 可以输出：

- 画面中可购买元素的位置；
- 品类、颜色、材质、风格和用途；
- 面向商品目录的搜索词；
- 识别置信度。

Agent 不得输出或决定：

- `product_id`、SKU；
- 商品标题；
- 价格、库存；
- 店铺、销量；
- 购买链接；
- “同款”结论。

真实商品事实必须由 Commerce Catalog Adapter 返回，并由后端校验。

### 2.2 识别对象、候选商品和购买动作必须拆开

```text
DiscoveredSubject
→ CommerceCandidate[]
→ GroundedProductMatch[]
→ CommerceAction
```

- `DiscoveredSubject` 是效果图中的一个视觉元素；
- `CommerceCandidate` 是目录召回候选，默认不直接返回前端；
- `GroundedProductMatch` 是经过事实校验、可以展示的商品匹配；
- `CommerceAction` 决定前端是跳转、打开网页、复制搜索词还是不可购买。

### 2.3 来源必须逐阶段标注

不得只用一个 `LIVE` 标签掩盖真实来源。至少分开：

- `image_analysis`：图像 Agent 的来源；
- `commerce_catalog`：商品事实的来源。

允许的组合示例：

| 图像分析 | 商品目录 | 用户展示 |
| --- | --- | --- |
| Live Agent | 抖音真实目录 | AI 识别 · 抖音好物 |
| Plan fallback | Demo Catalog | 方案关联 · Demo 商品 |
| Live Agent | Demo Catalog | AI 识别 · Demo 候选 |
| Agent 失败 | 无目录 | 暂时未找到可购买结果 |

## 3. 对象模型

```mermaid
flowchart LR
    PV["PlanVersion"] --> RI["Render image"]
    RI --> RUN["ProductDiscoveryRun"]
    RUN --> SUBJECT["DiscoveredSubject[]"]
    SUBJECT --> QUERY["CommerceQuery[]"]
    QUERY --> CANDIDATE["CommerceCandidate[]"]
    CANDIDATE --> MATCH["GroundedProductMatch[]"]
    MATCH --> ACTION["CommerceAction"]
```

### 3.1 ProductDiscoveryRun

一次针对一个不可变 PlanVersion after 图的异步识别和商品匹配。

稳定身份：

- `product_discovery_run_id`
- `plan_asset_id`
- `plan_version_id`
- `render_fingerprint`

同一 PlanVersion 同时最多一个 active run。重试和刷新创建新 run，不覆盖旧 run。

### 3.2 DiscoveredSubject

```json
{
  "subject_id": "subject-001",
  "label": "桌面氛围灯",
  "category_code": "table_lamp",
  "bbox": {
    "x": 0.63,
    "y": 0.24,
    "width": 0.18,
    "height": 0.31
  },
  "appearance": {
    "colors": ["奶油白"],
    "materials": ["哑光金属"],
    "style_keywords": ["圆润", "暖光", "小体积"]
  },
  "placement_hint": "桌面右后侧",
  "confidence": 0.91,
  "search_queries": ["奶油白小台灯 暖光 桌面"],
  "match_state": "matched",
  "matches": []
}
```

`bbox` 使用相对 after 图的归一化坐标，所有数值在 `0..1` 内。使用
plan-grounded fallback 时无法证明图像位置，`bbox` 必须为 `null`，前端不得显示
伪造热点。

### 3.3 GroundedProductMatch

```json
{
  "match_id": "match-001",
  "product_id": "product-demo-lamp-001",
  "title": "奶油白蘑菇台灯",
  "category_code": "table_lamp",
  "cover_url": null,
  "price_cny": 129,
  "price_label": "¥129",
  "match_type": "visual_similar",
  "match_confidence": 0.84,
  "match_reasons": ["颜色接近", "体积适合桌面", "支持免打孔摆放"],
  "availability": {
    "status": "demo",
    "checked_at": "2026-07-25T12:00:00.000Z"
  },
  "commerce_action": {
    "type": "search_query",
    "label": "去抖音搜",
    "url": null,
    "query": "奶油白蘑菇台灯 暖光"
  },
  "source": {
    "source_type": "demo_catalog",
    "label": "本地 Demo 商品目录",
    "checked_at": "2026-07-25T12:00:00.000Z"
  }
}
```

`match_type`：

- `exact_catalog_product`：有可靠商品身份和图像证据；
- `visual_similar`：视觉与用途相似，不得写“同款”；
- `category_recommendation`：只有品类和用途接近。

### 3.4 CommerceAction

```text
douyin_deeplink
web_url
search_query
unavailable
```

规则：

- `douyin_deeplink`：只交给抖音宿主 Bridge，普通 Web 不直接导航任意 scheme；
- `web_url`：必须经过后端允许域名校验，Web 使用新窗口打开；
- `search_query`：前端展示和复制后端返回的 query；
- `unavailable`：按钮禁用，并展示原因；
- 前端不能根据 product_id 自行拼购买链接。

## 4. 状态机

```text
queued
→ analyzing_render
→ building_queries
→ retrieving_products
→ grounding_matches
→ packaging
→ succeeded | failed | cancelled
```

传输字段：

- `status`: `queued | running | succeeded | failed | cancelled`
- `stage`: 上述阶段；
- `stage_index`: `1..6`
- `stage_total`: 固定 `6`
- `progress`: `0..100`
- `retryable`: 布尔值

成功 run 还有 `result_state`：

- `ready`：至少一个 subject 有可展示 match；
- `partial`：部分 subject 未匹配；
- `empty`：没有可靠识别或没有可展示商品；
- 运行中为 `null`。

`empty` 是成功业务结果，不是 500。

## 5. 路由

### 5.1 创建商品发现运行

```http
POST /api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs
Idempotency-Key: <uuid>
Content-Type: application/json
```

请求：

```json
{
  "schema_version": "1.0",
  "reason": "initial",
  "options": {
    "discovery_mode": "auto",
    "max_subjects": 6,
    "matches_per_subject": 3
  }
}
```

`reason`：

- `initial`：首次运行；
- `retry`：重试同 PlanVersion 的 failed/cancelled run；
- `refresh`：基于同一不可变 after 图重新识别。

`retry` 额外需要：

```json
{
  "retry_of_product_discovery_run_id": "product-discovery-run-failed"
}
```

`options`：

- `discovery_mode`: `auto | live | demo`
- `max_subjects`: `1..8`
- `matches_per_subject`: `1..5`

普通前端使用默认值，不向用户暴露模型参数。

响应 `202`：

```json
{
  "schema_version": "1.0",
  "product_discovery_run_id": "product-discovery-run-001",
  "plan_asset_id": "plan-001",
  "plan_version_id": "plan-version-001",
  "status": "queued",
  "stage": "queued",
  "stage_index": 1,
  "stage_total": 6,
  "progress": 0,
  "source_mode": null,
  "result_state": null,
  "retryable": false,
  "result": null,
  "error": null,
  "created_at": "2026-07-25T12:00:00.000Z",
  "updated_at": "2026-07-25T12:00:00.000Z"
}
```

创建前置条件：

- actor 有权访问 PlanAsset 和 PlanVersion；
- PlanVersion 属于 PlanAsset；
- `after_ref` 存在且可由服务端读取；
- 渲染未被拒绝；
- 同一 PlanVersion 没有 active run；
- `reason` 与历史 run 状态一致。

### 5.2 列出某个方案版本的发现运行

```http
GET /api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs
  ?sort=recent&limit=10&cursor=...
```

响应 `200`：

```json
{
  "schema_version": "1.0",
  "items": [
    {
      "product_discovery_run_id": "product-discovery-run-001",
      "status": "succeeded",
      "stage": "packaging",
      "progress": 100,
      "source_mode": "fallback",
      "result_state": "ready",
      "subjects_count": 3,
      "matches_count": 7,
      "created_at": "2026-07-25T12:00:00.000Z",
      "updated_at": "2026-07-25T12:00:05.000Z"
    }
  ],
  "next_cursor": null,
  "total": 1
}
```

用途：

- 刷新后恢复最新 run；
- 历史 PlanVersion 重新打开时恢复结果；
- 前端先 list，再决定创建、轮询或显示。

### 5.3 查询运行

```http
GET /api/v1/product-discovery-runs/{product_discovery_run_id}
```

运行中响应见：

[product-discovery.run.running.json](../examples/responses/product-discovery.run.running.json)

成功响应见：

[product-discovery.run.ready.json](../examples/responses/product-discovery.run.ready.json)

空结果响应见：

[product-discovery.run.empty.json](../examples/responses/product-discovery.run.empty.json)

### 5.4 取消运行

```http
POST /api/v1/product-discovery-runs/{product_discovery_run_id}/cancel
```

请求体：

```json
{
  "schema_version": "1.0"
}
```

响应 `200`：返回取消后的完整 run。

取消只对 queued/running 有效；已经发出的 Provider 调用不保证停止计费。

## 6. 完整 ProductDiscoveryRun 响应

```json
{
  "schema_version": "1.0",
  "product_discovery_run_id": "product-discovery-run-001",
  "plan_asset_id": "plan-001",
  "plan_version_id": "plan-version-001",
  "render_fingerprint": "sha256:...",
  "status": "succeeded",
  "stage": "packaging",
  "stage_index": 6,
  "stage_total": 6,
  "progress": 100,
  "source_mode": "fallback",
  "result_state": "ready",
  "retryable": false,
  "result": {
    "subjects": [],
    "subjects_count": 0,
    "matched_subjects_count": 0,
    "matches_count": 0,
    "notices": [],
    "provenance": {
      "image_analysis": {
        "source_type": "fallback",
        "strategy": "plan_grounded",
        "provider": null,
        "model": null,
        "prompt_version": null
      },
      "commerce_catalog": {
        "source_type": "demo_catalog",
        "label": "本地 Demo 商品目录",
        "checked_at": "2026-07-25T12:00:00.000Z"
      }
    }
  },
  "error": null,
  "created_at": "2026-07-25T12:00:00.000Z",
  "updated_at": "2026-07-25T12:00:05.000Z"
}
```

`source_mode` 仅用于快速徽标：

- `live`：图像分析和真实目录均为 Live；
- `fallback`：至少一段使用 plan-grounded 或其他明确降级；
- `demo`：完整固定 Demo。

精确来源始终看 `result.provenance`。

## 7. Agent Port 契约

Prompt 由其他负责人实现，但 Provider 必须遵守以下端口。

### 7.1 服务端输入

```js
discoverProducts({
  afterImage: {
    dataUrl: "data:image/jpeg;base64,...",
    mediaType: "image/jpeg"
  },
  context: {
    planVersionId: "plan-version-001",
    sceneType: "desk_corner",
    planTitle: "克制但完整的暖光书桌",
    placements: [
      {
        zone: "desktop_back",
        expectedCategory: "table_lamp"
      }
    ]
  },
  limits: {
    maxSubjects: 6,
    maxQueriesPerSubject: 3
  },
  outputContract: {
    name: "ProductDiscoveryAgentOutput",
    version: "1.0"
  }
})
```

图片、data URL 和完整 context 只存在于服务端 Provider 调用中，不返回浏览器，不
进入日志。

### 7.2 Agent 输出

```json
{
  "schema_version": "1.0",
  "subjects": [
    {
      "subject_ref": "subject_01",
      "label": "桌面氛围灯",
      "category_code": "table_lamp",
      "bbox": {
        "x": 0.63,
        "y": 0.24,
        "width": 0.18,
        "height": 0.31
      },
      "appearance": {
        "colors": ["奶油白"],
        "materials": ["哑光金属"],
        "style_keywords": ["圆润", "暖光"]
      },
      "placement_hint": "桌面右后侧",
      "confidence": 0.91,
      "commerce_search_queries": [
        "奶油白小台灯 暖光 桌面"
      ]
    }
  ]
}
```

后端必须：

- 校验 JSON、字段长度、数组上限和 bbox；
- 为 subject 分配服务端稳定 ID；
- 拒绝 Agent 输出的任何 product_id、价格、库存和购买链接；
- 对 search query 做长度和字符规范化；
- 不信任 Agent 的 category 或 confidence；
- 失败时进入 plan-grounded fallback 或安全失败。

## 8. Fallback 规则

在 Prompt 和 Live Agent 尚未接入时，后端可以使用
`plan_grounded` 策略让前后端链路先成立：

```text
AICard.plan.placements + AICard.products
→ 生成 bbox=null 的 DiscoveredSubject
→ 使用现有 product_id 读取可信商品事实
→ 生成 search_query 或 unavailable CommerceAction
```

必须返回：

```json
{
  "image_analysis": {
    "source_type": "fallback",
    "strategy": "plan_grounded"
  }
}
```

不得写“AI 已从图片识别”，前端文案应为“根据本次方案关联”。

## 9. Health 能力

`GET /api/health` 计划增加：

```json
{
  "features": {
    "product_discovery": true,
    "product_discovery_live_agent": true,
    "douyin_commerce_catalog": false
  },
  "limits": {
    "product_discovery_max_subjects": 8,
    "product_discovery_matches_per_subject": 5
  }
}
```

含义：

- `product_discovery=true`：本文四个接口已实现；
- `product_discovery_live_agent=true`：当前运行配置为非 Demo 且
  `AGENT_PLAN_API_KEY` 可用，真实图像 Agent 已接入；
- `douyin_commerce_catalog=true`：真实抖音商品目录已接入。

前端必须分别显示，不得把第一项等同于后两项。

## 10. 错误协议

继续使用当前结构化 ErrorEnvelope。

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `product_discovery_request_invalid` | 请求字段或枚举错误 |
| 404 | `resource_not_found` | 跨 actor、不存在或已删除 |
| 409 | `plan_render_unavailable` | 没有可识别 after 图 |
| 409 | `plan_render_rejected` | after 图被评测拒绝 |
| 409 | `product_discovery_run_active` | 同版本已有 active run |
| 409 | `product_discovery_already_succeeded` | initial 已成功，应 list/refresh |
| 409 | `product_discovery_retry_invalid` | retry 目标不合法 |
| 409 | `product_discovery_not_cancellable` | run 已是终态 |
| 422 | `product_discovery_contract_invalid` | Agent 输出不符合协议 |
| 429 | `rate_limited` | 调用受限 |
| 502 | `product_discovery_provider_failed` | Live Agent/目录上游失败 |
| 504 | `product_discovery_timeout` | 上游超时 |

Provider 失败后成功使用 fallback 时，run 应 succeeded，来源标为 fallback；只有
fallback 也不可用时才 failed。

## 11. 前端轮询约定

```text
RESULT_READY
→ GET runs?sort=recent&limit=1
  → active: GET run 轮询
  → succeeded: 直接展示
  → failed/cancelled: 展示重试
  → 无 run: POST initial
```

建议：

- 前 10 秒每 800ms；
- 之后每 1500ms；
- 页面隐藏时暂停 UI 轮询；
- 恢复可见后先立即 GET；
- 连续网络失败只暂停轮询，不自动创建第二个 run；
- 只有业务终态停止轮询；
- 迟到响应不能覆盖当前 PlanVersion 的 run。

## 12. 前端展示约定

结果页在 before/after 与变化摘要之后加入：

```text
把这一角搬回家
画面热点（仅 bbox 非空）
→ 识别元素
→ 1～3 个商品候选
→ 去抖音购买 / 去抖音搜 / 暂不可购买
```

文案必须跟随来源：

- Live Agent + 抖音目录：“从焕新图里找到这些抖音好物”；
- plan-grounded：“根据本次方案，为你整理了可搜索好物”；
- Demo Catalog：“Demo 商品，仅用于验证购买承接流程”。

## 13. 事件

复用 `POST /api/v1/events/batch`：

```text
product_discovery_section_viewed
product_discovery_retry_requested
commerce_match_clicked
commerce_search_copied
commerce_action_unavailable
```

事件属性白名单：

- `plan_version_id`
- `product_discovery_run_id`
- `subject_id`
- `match_id`
- `product_id`
- `commerce_action_type`
- `source_type`

不得上传原图、bbox、搜索词、商品链接、自由文本或完整 Agent 输出。

## 14. 双方完成门

### 前端完成门

- 只依赖本文 fixture 即可完成全部状态；
- 不自行识图、拼商品事实和购买链接；
- Live/Fallback/Demo 来源可辨认；
- bbox=null 不显示热点；
- 刷新可恢复；
- ready/partial/empty/failed/unavailable 均可验收。

### 后端完成门

- 四个接口进入 Route Manifest、OpenAPI 和 tests；
- one active run、幂等、actor、取消和恢复成立；
- 默认 plan-grounded fallback 可跑通；
- Agent Port 可注入，但不要求本轮实现 Prompt；
- Agent 不能创造商品事实；
- 每个响应通过共享 fixture/Schema。

### 联调完成门

双方共同使用以下 fixture：

- [create request](../examples/requests/product-discovery.create.json)
- [running response](../examples/responses/product-discovery.run.running.json)
- [ready response](../examples/responses/product-discovery.run.ready.json)
- [empty response](../examples/responses/product-discovery.run.empty.json)

任何字段变更必须先修改本文与 fixture，再分别修改前端和后端，不能只在一侧临时
兼容。
