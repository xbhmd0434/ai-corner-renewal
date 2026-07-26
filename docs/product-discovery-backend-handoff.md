# 商品发现购买承接：后端独立交接

> 适用对话：只负责后端
> 共享协议：[product-discovery-api-contract.md](./product-discovery-api-contract.md)
> 允许修改：`services/orchestrator/**`、`packages/**`、协议测试、OpenAPI、根 HANDOFF
> 不允许修改：`apps/douyin-demo/**` 和 Agent Prompt 正文

## 1. 目标

实现一个独立、可持久、可恢复的 PlanVersion 后置工作流：

```text
合格 after 图
→ ProductDiscoveryRun
→ ProductDiscoveryProvider
→ CommerceCatalogAdapter
→ GroundedProductMatch[]
→ 前端购买承接
```

本轮 Prompt 由其他负责人实现。后端必须先完成端口、状态、Repository、fallback、
目录 grounding 和四个 HTTP 接口。

## 2. 必须坚持的后端边界

- 浏览器不提交 after 图 URL；后端从 PlanVersion 读取；
- Agent 不拥有 product_id、价格、库存和购买链接；
- 商品事实必须来自 Catalog Adapter；
- ProductDiscoveryRun 不修改 PlanVersion；
- 同 PlanVersion 同时最多一个 active run；
- succeeded/failed/cancelled run 不覆盖；
- Prompt、原图、Base64、Provider 原文不进日志；
- actor、幂等、短时媒体访问和来源语义沿用现有规则；
- fallback 成功要标 `fallback`，不得伪装 Live。

## 3. 模块建议

```text
services/orchestrator/src/
├─ adapters/
│  ├─ product-discovery-agent.js
│  └─ commerce-catalog.js
├─ services/
│  └─ product-discovery-service.js
└─ data/
   └─ demo-catalog.js（复用，不复制第二份）
```

协议：

```text
packages/contracts/
├─ schemas/product-discovery-v1.schema.json
├─ src/index.js
└─ src/v1-route-manifest.js
```

测试：

```text
services/orchestrator/test/product-discovery-service.test.js
services/orchestrator/test/server.test.js
packages/contracts/test/contracts.test.js
packages/contracts/test/openapi.test.js
```

## 4. Repository 对象

新增：

```js
productDiscoveryRuns: {
  table: "product_discovery_runs",
  id: "product_discovery_run_id",
  status: "status",
  resourceVersion: null
}
```

记录：

```js
{
  schema_version: "1.0",
  product_discovery_run_id,
  plan_asset_id,
  plan_version_id,
  render_fingerprint,
  retry_of_product_discovery_run_id,
  reason,
  options,
  status,
  stage,
  stage_index,
  stage_total: 6,
  source_mode,
  result_state,
  retryable,
  result,
  error,
  cancel_requested,
  created_at,
  updated_at
}
```

图片不写入 JSON；只保存 fingerprint 和对现有 MediaObject 的间接引用。若当前
Repository migration 需要升级，必须提供旧数据兼容和临时数据库测试。

## 5. Service 状态

阶段：

```text
queued
analyzing_render
building_queries
retrieving_products
grounding_matches
packaging
```

运行流程：

1. 验证 PlanAsset/PlanVersion 所有权和关系；
2. 读取 AICard/RenewalManifest after_ref；
3. 拒绝 unavailable/rejected render；
4. 通过 MediaService 取得 Provider 图；
5. 调 ProductDiscoveryProvider；
6. 校验并规范化 subjects；
7. 为每个 subject 调 CommerceCatalogAdapter；
8. 确定性校验商品事实和 CommerceAction；
9. 打包结果并持久化；
10. Provider 失败时按策略进入 plan-grounded fallback。

重启：

- queued/running 记录恢复为 queued；
- 从头安全重跑；
- 结果写入必须幂等；
- 不支持多进程竞争的限制继续明确记录。

## 6. ProductDiscoveryProvider Port

Provider 接口：

```js
async discover({
  image,
  context,
  limits,
  requestedMode
}) {
  return {
    sourceType: "live",
    provider: "provider-name",
    model: "model-name",
    promptVersion: "prompt-version",
    subjects: []
  };
}
```

本轮提供两个实现：

### `UnconfiguredProductDiscoveryProvider`

- 不发送网络请求；
- 返回 `product_discovery_not_configured`；
- Service 决定是否 fallback。

### `PlanGroundedDiscoveryProvider`

- 读取当前 PlanVersion 的 placements 和 products；
- 构造 `bbox=null` subjects；
- 只使用已有 plan product_id；
- 搜索词来自可信品类和名称的受限拼接；
- 返回 `sourceType=fallback`、`strategy=plan_grounded`。

Prompt 负责人后续新增 Live Provider 时，不修改 Service 和 HTTP 契约。

## 7. Agent 输出校验

必须拒绝：

- subjects 不是数组；
- 超过 `max_subjects`；
- bbox 越界、负数或面积为 0；
- 字符串过长；
- 每个 subject 超过 3 个 query；
- query 为空或过长；
- Agent 输出 product_id、SKU、价格、库存、店铺、销量或链接；
- 非法 confidence；
- 重复 subject_ref。

服务端重新分配 `subject_id`，不把 `subject_ref` 当数据库 ID。

## 8. CommerceCatalogAdapter

接口：

```js
async retrieve({
  actorId,
  subject,
  budgetContext,
  limit
}) {
  return {
    sourceType: "demo_catalog",
    checkedAt,
    candidates: []
  };
}
```

Catalog Candidate 必须包含：

```text
product_id
title
category_code
price_cny
cover_url
availability
source
commerce_action
```

本轮复用 `demo-catalog.js`：

- 不复制商品；
- 使用现有商品事实；
- `source_type=demo_catalog`；
- 没有真实跳转时返回 `search_query`；
- 不允许返回伪造抖音链接。

未来真实抖音目录 Adapter 接入时，Service 协议不变。

## 9. Grounding

确定性代码必须完成：

- product_id 唯一；
- 商品来源字段完整；
- `price_cny` 为整数或 null；
- availability 与 source 时间有效；
- URL 使用允许 scheme/host；
- `match_type=exact_catalog_product` 需要足够证据；
- Live 目录没有 exact 证据时最多为 `visual_similar`；
- 每个 subject 返回不超过请求上限；
- 匹配为空时 subject 保留并标 `unmatched`。

模型可以排序候选，但不能改候选事实。

## 10. HTTP 接口

严格实现共享协议四个 operation：

```text
createProductDiscoveryRun
listProductDiscoveryRuns
getProductDiscoveryRun
cancelProductDiscoveryRun
```

建议 Route Manifest：

```js
{
  operationId: "createProductDiscoveryRun",
  method: "POST",
  template: "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs",
  idempotent: true
}
{
  operationId: "listProductDiscoveryRuns",
  method: "GET",
  template: "/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs"
}
{
  operationId: "getProductDiscoveryRun",
  method: "GET",
  template: "/api/v1/product-discovery-runs/{product_discovery_run_id}"
}
{
  operationId: "cancelProductDiscoveryRun",
  method: "POST",
  template: "/api/v1/product-discovery-runs/{product_discovery_run_id}/cancel"
}
```

所有路由由 Manifest、Server 和 OpenAPI 同源生成/校验；不能只手写 Server 路由。

## 11. 幂等、冲突和创建语义

### `initial`

- 已有 active：409 `product_discovery_run_active`；
- 已有 succeeded：409 `product_discovery_already_succeeded`；
- 无历史：202 创建。

### `retry`

- 必须提供 retry ID；
- retry run 属于同 actor、PlanAsset、PlanVersion；
- 只能 retry failed/cancelled；
- 202 创建新 run。

### `refresh`

- 必须已有 succeeded；
- after 图 fingerprint 必须仍相同；
- 202 创建新 run。

重复 Idempotency-Key 返回原始响应，不能创建第二条记录。

## 12. Render 前置条件

优先读取 RenewalManifest：

```text
render.status=ready
render.consistency_status=current
render.after_ref 非空
```

旧 AICard v1：

- `render.after_ref` 非空时可以运行；
- 增加 notice `legacy_render_consistency_unverified`；
- after_ref 指向删除媒体时 409。

`stale`、`unavailable`、`rejected` 默认拒绝，避免给错误版本的图片匹配商品。

## 13. Health

路由和 fallback 可用后：

```json
{
  "features": {
    "product_discovery": true,
    "product_discovery_live_agent": false,
    "douyin_commerce_catalog": false
  }
}
```

只有 Live Provider 真实配置并通过健康检查时，第二项才为 true；只有真实商品目录
接入时第三项才为 true。

## 14. 安全与隐私

- after 图只由 MediaService 读取；
- Provider 只能接收单次受限图像和最小上下文；
- 不记录 data URL、Prompt 和 Provider 原文；
- 结构化 Agent 输出只持久化规范化结果；
- 返回前端的 cover_url/jump URL 必须经过允许规则；
- 跨 actor、已删除和不存在统一 404；
- 事件和 audit 不含搜索词、bbox、图片和链接；
- 每用户 active run 和每分钟创建次数进入限额配置。

## 15. 测试

至少覆盖：

- initial 创建、幂等重放；
- one active；
- succeeded 后 initial 冲突；
- retry/refresh；
- actor 隔离；
- PlanVersion 不属于 PlanAsset；
- after_ref 缺失/删除/stale/rejected；
- Provider live 成功；
- Provider 失败 + plan-grounded fallback；
- Agent 非法 JSON/越界 bbox/伪造价格；
- Demo Catalog grounding；
- ready/partial/empty；
- cancel；
- 重启恢复；
- private media 不泄漏；
- Route Manifest 和 OpenAPI 同源；
- 共享 ready fixture 通过 schema。

## 16. 后端完成标准

1. 四个接口可用；
2. 共享 fixtures 成为测试事实；
3. 无 Prompt 也可通过 plan-grounded fallback 完成链路；
4. 后续 Live Agent 只需实现 Provider；
5. 商品事实不来自 Agent；
6. `npm.cmd run check` 与 `npm.cmd run check:douyin-integration` 通过；
7. 更新根 `HANDOFF.md`、`docs/backend-api.md` 和生成的 OpenAPI；
8. 明确标记真实抖音商品目录仍未接入。

## 17. 交给后端独立对话的任务说明

> 仅实现“焕新结果商品发现”的后端。严格遵守
> `docs/product-discovery-api-contract.md`，不得修改 `apps/douyin-demo/**`，
> 不实现 Agent Prompt 正文。新增 ProductDiscoveryRun Repository、Service、
> Provider Port、plan-grounded fallback、Demo Catalog grounding、四个 `/api/v1`
> 接口、Schema、Route Manifest、OpenAPI 和测试。共享 fixtures 是协议事实，字段
> 不得单边修改。完成后运行根 `npm.cmd run check` 和
> `npm.cmd run check:douyin-integration`，并更新根 HANDOFF 与后端 API 文档。
