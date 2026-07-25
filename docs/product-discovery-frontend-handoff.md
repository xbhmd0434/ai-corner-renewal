# 商品发现购买承接：前端独立交接

> 适用对话：只负责前端
> 共享协议：[product-discovery-api-contract.md](./product-discovery-api-contract.md)
> 允许修改：`apps/douyin-demo/**`、前端测试和前端交接文档
> 不允许修改：后端 Service、Repository、Route Manifest、OpenAPI 和 Agent Prompt

## 1. 目标

在用户看到焕新 before/after 之后，加入“把这一角搬回家”区域：

```text
效果图揭晓
→ 恢复或创建 ProductDiscoveryRun
→ 展示识别中
→ 展示画面元素和商品候选
→ 去抖音购买 / 去抖音搜 / 暂不可购买
```

当前不是重做结果页，而是在 `ResultSection` 的图片与变化摘要之后增加一个独立购买
承接区。

## 2. 必须坚持的前端边界

- 不在浏览器分析 after 图；
- 不从 AICard 商品自行伪造 Agent 识别结果；
- 不自行计算价格、库存和匹配置信度；
- 不根据 product_id 拼购买链接；
- 不把 fallback 写成“AI 从图片识别”；
- bbox 为 `null` 时不显示热点；
- Demo Catalog 必须明显标记；
- ProductDiscoveryRun 的迟到响应不能覆盖用户已经切换到的新 PlanVersion。

## 3. 文件方案

建议新增：

```text
douyin-static-demo/
├─ api/
│  └─ product-discovery-client.js
├─ adapters/
│  └─ product-discovery-view-model.js
└─ renewal/
   └─ components/
      └─ shop-the-look.js
```

修改：

```text
renewal/main.js
renewal/renewal-store.js
renewal/components/result-section.js
renewal/styles/renewal.css
tests/product-discovery-view-model.test.js
tests/renewal-mode.test.js（仅在状态恢复需要时）
HANDOFF.md
```

不要把新逻辑加入旧 `me.js`、旧 `router.js` 或 `apps/web`。

## 4. Store 状态

```js
productDiscovery: {
  planVersionId: null,
  runId: null,
  status: "not_started",
  stage: null,
  progress: 0,
  resultState: null,
  result: null,
  error: null,
  polling: false
}
```

前端展示状态：

```text
not_started
unavailable
queued
analyzing
ready
partial
empty
failed
cancelled
```

后端 `status + stage + result_state` 只能在 Adapter 中映射一次，组件不重复解释协议。

## 5. API Client

实现：

```js
createProductDiscoveryRun(planAssetId, planVersionId, body)
listProductDiscoveryRuns(planAssetId, planVersionId, params)
getProductDiscoveryRun(runId)
cancelProductDiscoveryRun(runId)
```

要求：

- mutation 使用现有 Idempotency-Key 工具；
- 使用同源 `/api/v1`；
- 结构化错误继续交给 `http-client.js`；
- Client 不做 UI 文案映射；
- `list` 默认 `sort=recent&limit=1`。

## 6. 进入和恢复

当 `currentPlanVersion` 变化且 after 图可用时：

1. 记录当前 `planVersionId`；
2. 检查 `/api/health.features.product_discovery`；
3. feature 不存在或 false：状态设为 `unavailable`，不请求未实现接口；
4. `GET runs?sort=recent&limit=1`；
5. 最新 run active：恢复轮询；
6. 最新 run succeeded：直接适配和显示；
7. 最新 run failed/cancelled：显示重试；
8. 没有 run：创建 `reason=initial`；
9. 所有响应写 Store 前再次核对 planVersionId 和 runId。

不得因为 GET 超时就自动 POST 第二个 run。

## 7. 轮询

建议：

```text
0～10 秒：800ms
10 秒后：1500ms
页面隐藏：暂停
页面重新可见：立即 GET 一次
连续网络失败：停止并显示“重新连接”
业务终态：停止
```

AbortController 只取消浏览器请求；用户点击“取消识别”时才调用后端 cancel。

## 8. ViewModel

组件只消费：

```js
{
  runId,
  status,
  progress,
  title,
  description,
  sourceBadge,
  sourceTone,
  subjects: [
    {
      id,
      label,
      bbox,
      hotspotNumber,
      appearanceLabel,
      matches: [
        {
          id,
          productId,
          title,
          coverUrl,
          priceLabel,
          matchLabel,
          reasons,
          action: {
            type,
            label,
            url,
            query,
            disabled
          },
          sourceLabel
        }
      ]
    }
  ],
  notices,
  canRetry
}
```

来源文案映射：

- `image_agent + douyin_catalog`：`AI 识别 · 抖音好物`
- `plan_grounded + demo_catalog`：`方案关联 · Demo 商品`
- `image_agent + demo_catalog`：`AI 识别 · Demo 候选`
- `empty`：`暂未找到可靠好物`

## 9. 组件视觉

延续结果页“精装杂志感”，不再增加一套商城首页：

- 标题：“把这一角搬回家”；
- 副标题根据来源动态变化；
- bbox 可用时，在 after 图叠加 1、2、3 数字热点；
- 下方使用横向商品票据，不做密集瀑布流；
- 每个 subject 默认只展开一个主候选，其余折叠；
- 商品卡重点顺序：物品名称 → 匹配理由 → 价格 → 行动；
- Demo 标签靠近行动按钮，不能藏在详情；
- 识别中使用阶段性文案，不使用泛化旋转 Loading；
- 空结果仍保留“调整效果图后重试”的入口。

### 文案

运行中：

```text
正在从焕新图里找可购买的元素
正在整理适合搜索的关键词
正在匹配抖音好物
正在核对商品来源
```

Fallback：

```text
根据本次方案，为你整理了可搜索好物
```

Demo：

```text
Demo 商品，仅用于验证购买承接流程
```

不要使用“精准同款”，除非 `match_type=exact_catalog_product` 且来源为真实目录。

## 10. CommerceAction

### `douyin_deeplink`

- 抖音宿主存在 Bridge 时交给 Bridge；
- 普通浏览器没有 Bridge 时降级为不可用或后端给出的 search_query；
- 不直接 `window.location` 到未知 scheme。

### `web_url`

- 只接受 `https:`；
- 使用 `noopener,noreferrer`；
- 后端来源不可信或 URL 非法时禁用。

### `search_query`

- 点击复制 query；
- 成功后 Toast：“搜索词已复制，打开抖音即可搜索”；
- 不把 query 写入事件。

### `unavailable`

- 按钮禁用；
- 展示后端 label 或统一“暂不可购买”。

## 11. 事件

通过现有 batch event：

```text
product_discovery_section_viewed
product_discovery_retry_requested
commerce_match_clicked
commerce_search_copied
commerce_action_unavailable
```

只发送共享协议白名单 ID，不发送 URL、query、bbox 和自由文本。

## 12. Fixture 驱动

后端未完成前，前端测试和组件开发只使用：

- `examples/responses/product-discovery.run.running.json`
- `examples/responses/product-discovery.run.ready.json`
- `examples/responses/product-discovery.run.empty.json`

浏览器中若提供本地 fixture 开关，必须由用户显式选择，并显示“本地离线 Demo”；
不得在真实接口 404 时静默切 fixture。

## 13. 测试

必须覆盖：

- health feature false；
- 无历史 run 后创建；
- active run 恢复；
- ready/partial/empty；
- failed/cancelled 重试；
- bbox null 不显示热点；
- bbox 有效时热点映射；
- PlanVersion 切换后旧响应被丢弃；
- search_query 复制；
- URL scheme 拒绝；
- Demo/Fallback/Live 文案；
- 390、430 和 1440 视口无溢出；
- reduced motion 不依赖动画表达状态。

## 14. 前端完成标准

1. 使用 fixture 可完整演示结果揭晓后的购买承接；
2. 后端实现后只替换数据源，不修改组件协议；
3. 所有来源诚实可见；
4. 页面刷新能恢复后端 run；
5. 不存在前端商品事实和购买链接拼装；
6. `npm.cmd run check:douyin` 通过；
7. 更新 `apps/douyin-demo/HANDOFF.md`。

## 15. 交给前端独立对话的任务说明

> 仅实现“焕新结果商品发现”的前端。严格遵守
> `docs/product-discovery-api-contract.md`，只修改 `apps/douyin-demo/**`、
> 前端测试和前端 HANDOFF。先用共享 fixtures 完成 Client、Adapter、Store 恢复、
> 轮询和 `shop-the-look` 组件；不得修改后端接口，不得实现 Agent Prompt，不得在
> 接口失败时静默使用 Demo。完成后运行 `npm.cmd run check:douyin`，并报告实际
> 修改文件、状态矩阵和仍依赖后端的能力。
