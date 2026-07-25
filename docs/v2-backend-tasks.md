# 「搬进我家」V2.1 后端任务书

> 前置协议：`v2-parallel-development-contract.md`
> 工作目录：`services/orchestrator`、`packages/contracts`、`examples`
> 目标成熟度：单进程 SQLite 可持久联调 P0
> 不在本轮：真实账号、真实交易、全量抖音索引、多进程队列、训练数据回流

## 1. 后端责任和禁区

后端负责稳定身份、不可变快照、状态机、排序、来源、商品事实、发布隐私、幂等和恢复。
Agent 输出必须经过结构校验和确定性门禁。

并行期间可修改：

```text
services/orchestrator/**
packages/contracts/**
examples/**
scripts/generate-openapi.mjs
docs/openapi.yaml（只通过生成器）
后端相关测试与事实文档
```

不要修改 `apps/douyin-demo/**`。根 `package.json` 和 lockfile 只有确需新后端依赖且
经集成负责人确认时才改；优先使用现有 Node/SQLite 能力。

## 2. 服务与 Repository 目标

```text
AssetService
└─ Inspiration intent analysis + confirmation

DesignRequestService
└─ confirmed intent + SpaceVersion immutable snapshot

PlanService
└─ GenerationRun + PlanAsset/PlanVersion（现有）

RelatedDesignService
├─ RelatedDesignRun
├─ DouyinContentProvider Port
└─ PublicationIndexProvider Port

PublicationService
└─ immutable Publication + index state

ProductDiscoveryService（现有）
└─ implementation_list deterministic projection

CommerceHandoffService
└─ CartIntent validation + host action
```

新增集合/表至少包括：

- `relatedDesignRuns`
- `publications`
- `cartIntents`

意图确认可以存入现有 Asset 记录，但必须通过 `resource_version` 和专用确认操作更新，
不能允许通用 PATCH 任意覆盖模型分析字段。

## 3. 工作包

### BE-00：形成可检出的契约基线

依赖：先把当前 Product Discovery 未提交实现纳入一个明确基线 Commit。

任务：

- 把新增 V2.1 路由加入 Route Manifest；
- 为新对象增加 Draft 2020-12 Schema；
- 生成 OpenAPI，不手改生成文件；
- 建立 `examples/contracts/renewal-v2` canonical fixtures；
- `/api/health` 增加五个独立 feature flag，默认只对真正实现能力置 true；
- 建契约测试，保证路由、Schema、OpenAPI、fixture 一致。

完成标准：

- 前端无需启动后端即可消费全部 fixture；
- 未实现路由不进入 OpenAPI 或对应 feature 保持 false；
- baseline SHA、协议代号和 fixture 版本可追溯。

### BE-01：InspirationAsset 意图分析与确认

覆盖：FR-01～FR-03。

任务：

- 扩展 InspirationAsset 属性：`intent_analysis`、`confirmed_intent`；
- Asset Understanding Port 输出组件/风格候选、摘要和结构化参考；
- 模糊或不确定时返回 `needs_confirmation`，不能默认猜成组件；
- 新增 intent confirmation 专用路由，要求 Idempotency-Key + resource_version；
- 用户纠正只生成确认快照，不改写原 Agent 分析；
- 来源视频只保存 provider、content ID、时间点、bbox 和绑定媒体 ID。

确定性校验：

- bbox、字段长度、受控 category/material/color 代码；
- `component_reference` 与 `style_reference` 至少一项与 suggested type 相符；
- Agent 返回的商品 ID、价格、URL、库存全部拒绝；
- 已确认意图重复同请求幂等；不同确认需显式版本更新。

完成标准：

- component、style、needs_confirmation、failed、retry、用户纠正均有测试；
- 跨 actor 统一 404；
- 重启后确认快照可读；
- 未确认资产创建 DesignRequest 返回 `409 intent_confirmation_required`。

### BE-02：V2.1 DesignRequest 快照和双 run 基础

覆盖：FR-07～FR-09。

任务：

- 现有 DesignRequest 接受 `options.experience_contract=renewal-card/2.1`；
- 验证唯一 reference 是已确认 InspirationAsset；
- 快照 `confirmed_intent`、来源最小信息、SpaceVersion、场景事实和
  `context_fingerprint`；
- V2.1 `constraints={}` 合法；系统内部成本保护不得转成用户待补预算；
- 为无真实场景的 actor 投影一个 `scene_origin=ai_example`、`read_only=true`、
  带 sealed SpaceVersion 的示例 SceneAsset；它不计入用户上传指标；
- 同一 inspiration + 同一 sealed SpaceVersion + 同一请求体保持幂等；
- 换场景必须是新 DesignRequest，不提供“改 design request”的接口。

完成标准：

- 组件/风格两类快照合法；
- 空 constraints 不产生 budget `needs_input`；
- draft/stale SpaceVersion 被拒绝；
- 示例场景可生成但不能通过普通 Asset PATCH/DELETE 修改；
- 新场景请求与旧请求 ID、fingerprint 不同；
- GenerationRun 现有回归全部通过。

### BE-03：RelatedDesignRun 与双关联排序

覆盖：FR-10、FR-11、FR-13、FR-14。

任务：

- 新增 RelatedDesignService、Repository、Provider Ports 和四个路由；
- 同一 DesignRequest 最多一个 active initial run；retry/refresh 创建新 run；
- 状态机：
  `queued → extracting_context → retrieving_inspiration → retrieving_scene →
  reranking → packaging → succeeded|failed|cancelled`；
- 同时查询 DouyinContentProvider 与 PublicationIndexProvider；
- 确定性层计算两类关系并执行双关联门禁；
- 单路无结果可降级，必须标记 `fallback_dimension` 和 reason；
- open_action 只允许后端白名单类型和 URL/scheme；
- active run 重启后恢复，Provider 迟到结果按 run ID 丢弃。

建议 P0 Provider：

- 固定授权 Demo Douyin 内容目录；
- 本地 Publication SQLite 索引；
- 不要求本轮接真实抖音搜索，但来源必须显示 demo/local。

完成标准：

- mixed source、single-dimension partial、empty、provider failure、cancel、retry、
  one-active、幂等、actor 和重启恢复均有测试；
- Related Design 失败不修改 GenerationRun；
- unpublished/withdrawn Publication 永不召回。

### BE-04：生成链路适配新产品语义

覆盖：FR-08、FR-09。

任务：

- 组件意图：在规划中固定一个 `source_anchor`，保持核心视觉特征；
- 风格意图：只迁移配色、材质、光线、布局和密度，不伪造同一物件；
- 继续用现有结构保持、已有物保持、比例和悬空门禁；
- PlanVersion 保存来源角色：
  `video_selected|source_video|ai_supplement`；
- 效果图标记 `AI 效果示意` 的元数据和独立 source mode；
- V2.1 只生成一个主效果图，不自动生成三张候选；
- Generation 失败保留 DesignRequest，可创建 retry run。

完成标准：

- 组件和风格各至少 4 个正常/异常 fixture；
- PlanVersion 可追溯到 exact DesignRequest/SpaceVersion/InspirationAsset；
- 旧 AICard v1 和现有兼容接口不破坏；
- 不因内部成本上限向 P0 用户追问预算。

### BE-05：保存与 Publication

覆盖：FR-12。

任务：

- 复用 Plan PATCH `lifecycle=saved`，保持乐观锁；
- 新增 PublicationService 和 create/get/withdraw；
- 创建前要求 PlanAsset 已 saved、PlanVersion 属于该 PlanAsset、来源确认完成；
- Publication 固化标题、封面引用、来源说明、场景/意图检索标签；
- 创建后异步进入本地索引，`index_failed` 可重试且不影响私人方案；
- 同一 PlanVersion 同一 actor 最多一个未撤下 Publication；
- 撤下立即从 Related Design 召回中删除，不删除 PlanAsset。

隐私门禁：

- 不把私有场景原图复制进公共索引；
- 不默认公开来源视频中的用户自由文本；
- 训练/长期记忆授权与发布授权分开；
- 删除场景时 Publication 的公开封面和私人派生物按引用策略处理并可解释。

完成标准：

- save≠publish、重复发布、索引失败、重试、撤下、跨 actor、重启恢复均有测试；
- 未发布私人方案不会被 RelatedDesignService 读到；
- 发布后可召回，撤下后不可召回。

### BE-06：实施清单来源排序

覆盖：FR-15～FR-18。

任务：

- 保持现有 ProductDiscoveryRun 状态机和 `subjects` 兼容；
- 从 DesignRequest/PlanVersion 来源快照生成 `implementation_list`；
- Agent 只识别 subject；Catalog Adapter 提供商品事实；
- 确定性层完成 origin_type、sort_group、sort_index、去重、数量合并和 disposition；
- 组件意图把 `video_selected` 固定在组 0 第 1 项；
- 风格意图把所有成功匹配的 `source_video` 放在 AI 补充前；
- 找不到真实商品时允许 `visual_similar/category_recommendation`，不得升格为同款；
- 返回 estimated total，但标明参考价和检查时间。

完成标准：

- component/style 两套排序 fixture；
- duplicate merge、out-of-stock replacement、partial、empty、bbox=null 均有测试；
- 非法 Agent 商品事实被拒绝；
- 同一 PlanVersion 刷新不改写旧 run。

### BE-07：CartIntent 宿主交接

覆盖：FR-19。

任务：

- 新增 CommerceHandoffService 和 create route；
- 验证 list_item、match 和 quantity 都属于同一个成功 ProductDiscoveryRun；
- 调用目录重新检查可售状态，失效项进入 `rejected`；
- 真实抖音 Bridge 未接时返回 `search_bundle` 或 `unavailable`；
- action token 短时、opaque、绑定 actor/run/items；日志不记录 token；
- 幂等重放不能重复创建交易动作。

完成标准：

- 全部接受、部分拒绝、全部不可用、过期、篡改 match、跨 actor、重复提交均有测试；
- CartIntent 不创建订单，不返回“购买成功”；
- `cart_batch_handoff` 只有真实宿主交接可用才置 true。

### BE-08：恢复、安全、指标和整体验收

任务：

- 新队列记录纳入 SQLite 启动恢复和关闭等待；
- 为所有 run 做 one-active、cancel、retry、refresh 和迟到 Provider 结果隔离；
- 日志只记录 request ID、无 query 路径、状态、来源和耗时；
- 事件白名单加入协议事件，拒绝图片、bbox、标题、URL、query 和 token；
- 媒体引用计数覆盖 Publication/Related cover/Product Discovery；
- 更新 OpenAPI、后端事实文档和根 HANDOFF；
- 运行完整检查并做一次关闭/重启读取。

完成标准：

- `npm.cmd run check`、`npm.cmd run openapi:check` 和后端 E2E 通过；
- 组件/风格、示例/真实场景、双来源相关设计、保存/发布/撤下、实施/CartIntent 全链路
  有自动或可重复脚本证据；
- 停用所有真实 Provider 时仍可用明确标注的 Demo/fallback 完成比赛演示；
- 记录 feature flags、候选 Commit、回滚点和未实现真实能力。

## 4. 后端实施顺序

```text
G0 基线 Commit
→ BE-00 契约/fixture
→ BE-01 意图
→ BE-02 DesignRequest
├→ BE-03 Related Design
├→ BE-04 Generation 语义
└→ BE-05 Publication
BE-04 → BE-06 实施清单
BE-06 → BE-07 CartIntent
全部 → BE-08
```

BE-03 与 BE-04 可由后端内部并行，但只能在 BE-00/01/02 合并后开始。BE-05 可和
BE-04 并行；BE-06 必须等 PlanVersion 来源角色冻结。

## 5. 最小测试矩阵

| 领域 | 必测 |
| --- | --- |
| Intent | component/style/uncertain/correction/failed/retry |
| DesignRequest | unconfirmed/stale scene/empty constraints/idempotency/new scene |
| Related | mixed/partial/empty/fail/cancel/retry/restart/private publication |
| Generation | component/style/structure reject/provider fallback/retry |
| Publication | save first/index/publish conflict/withdraw/actor/restart |
| Implementation | ordering/dedup/quantity/partial/out-of-stock/no bbox |
| Cart | accept/partial reject/unavailable/expired/tampered/idempotent |
| System | health/OpenAPI/Schema/CORS/log redaction/media cleanup |

## 6. 后端交付物

- 新增路由、Service、Repository 数据和迁移；
- Agent/内容目录/发布索引/购物车 Bridge 的可替换 Ports；
- Route Manifest、JSON Schema、OpenAPI；
- canonical request/response fixtures；
- 自动测试与重启恢复测试；
- 当前实现、配置、隐私、限制和运行步骤的 HANDOFF 更新。

## 7. 可复制给后端开发对话的任务

> 基于已冻结的 `docs/v2-parallel-development-contract.md` 和当前基线 Commit，
> 完成 `docs/v2-backend-tasks.md` 的 BE-00～BE-08。只修改后端、共享契约、fixture
> 和后端测试，不修改 `apps/douyin-demo/**`。先形成契约/fixture Commit，再实现
> Service；所有 Agent 输出必须经过确定性校验，保存与发布分开，场景切换创建新
> DesignRequest，Related Design 与 Generation 独立运行，“实施”复用
> ProductDiscoveryRun 并由后端完成来源排序。最终必须通过 OpenAPI、Schema、幂等、
> actor、重启恢复和完整自动测试，未接真实抖音/交易的能力必须保持 false 并如实降级。
