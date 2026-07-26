# renewal-card/2.1 canonical fixtures

前端离线开发时用于替代 orchestrator 的样例响应。所有响应均基于协议
`renewal-card/2.1`（详见 `docs/v2-parallel-development-contract.md`）。

同一 fixture 通过后端 Service 投影生成或逐字段通过同一 Schema，禁止“只有成功态”。

| 文件 | 覆盖 |
| --- | --- |
| `inspiration.needs-confirmation.json` | AssetUnderstanding 无法判断组件/风格，需用户确认 |
| `inspiration.confirmed.component.json` | 用户确认为 component 后的 Asset 快照 |
| `inspiration.confirmed.style.json` | 用户确认为 style 后的 Asset 快照 |
| `related.running.json` | RelatedDesignRun 处于 retrieving_inspiration 阶段 |
| `related.ready.mixed-source.json` | 抖音内容与用户 Publication 混合命中的 ready 结果 |
| `related.partial.single-dimension.json` | 单路降级：仅场景匹配，含 fallback_dimension |
| `related.empty.json` | 无相关内容的成功 empty 结果 |
| `publication.indexing.json` | 发布后进入本地索引，尚未完成 |
| `publication.published.json` | 发布并完成索引 |
| `implementation.ready.component.json` | 组件意图，`video_selected` 固定在组 0 |
| `implementation.ready.style.json` | 风格意图，`source_video` 组 0，AI 补充组 1 |
| `implementation.partial.json` | 部分 subject unmatched 但整体可用 |
| `cart-intent.unavailable.json` | 宿主 Cart Bridge 不可用时的降级结果 |

每个响应示例均以 `contract_version=renewal-card/2.1` 标记；`source_mode` 反映真实来源
（Demo/fallback/live）；不得只保留成功态。

## 后端负责的验收

- 契约测试通过 (`packages/contracts/test/openapi.test.js`)
- 每个 fixture 逐字段通过 `packages/contracts/schemas/platform-v1.schema.json`
- 未接入真实抖音/交易能力时，`/api/health` 对应 feature flag 保持 false
