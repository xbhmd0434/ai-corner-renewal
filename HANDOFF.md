# AI 一角焕新 · 工程交接

本文是项目的持续工程事实来源。代码、配置、架构、行为、数据边界、构建或发布
流程变化时，必须把变化抽象到对应章节，不能只追加聊天式日志。

## 1. 当前状态与成熟度

当前源码版本为 `0.5.2`，事实源是本仓库；`apps/douyin-demo` 与后端已经进入
同一源码树。原有 `ai-corner-renewal-mvp` 和“抖音展示 demo”仓库外副本已移除，
不再存在第二套交付或协作事实源。

当前产品目标已经切换到仓库上级目录
`一角焕新_新产品流程与Agent方案_V2.md` 的 V2.1：以「搬进我家」卡片为中枢，
主输入收敛为一个已确认的组件或风格/氛围意图加一个目标场景，效果图生成和相关
设计独立并发，结果通过私人保存/主动发布和「实施」整套清单形成内容与商业闭环。
前后端下一阶段必须共同遵守 `docs/v2-parallel-development-contract.md`；独立任务
分别见 `docs/v2-frontend-tasks.md` 和 `docs/v2-backend-tasks.md`。

后端 V2.1（`renewal-card/2.1`）已在基线 Commit
`4024b0cd3d54bbf07bab9348c158088c96ded21e` 之上完成 BE-00～BE-08：意图分析与
用户确认、V2.1 DesignRequest 快照（含 `confirmed_intent` 快照与 `context_fingerprint`
不可变签名、AI 示例场景 `scene_origin=ai_example / read_only=true` 门禁）、独立
RelatedDesignRun 状态机（双 Provider：DemoDouyin 目录 + LocalPublication 索引）、
V2.1 GenerationRun 语义适配（PlanVersion 保存 `implementation_source_roles` +
只输出主效果图 + `experience_contract=renewal-card/2.1`）、Publication
保存后主动发布（`indexing → published | index_failed | withdrawn`）、
ProductDiscoveryRun 的 `implementation_list` 来源排序与去重、CartIntent 宿主
交接（真实抖音 Bridge 未接时降级为 `search_bundle`/`unavailable`）、以及事件
白名单扩展、`/api/health.features` 五个 V2.1 flag 与完整 E2E 测试。前端并行任务
仍需按 `docs/v2-frontend-tasks.md` 消费上述契约。

后端第一链路已经从“只由固定模板驱动”推进为正式
`SourceComponent → LayoutPlan → ProductSlot → SelectedProduct →
RenderPromptSpec → EvaluationResult` 管线，并仍保留现有 `/api/v1` 资产、任务、运行
和方案版本接口。`PlanService` 只在 `experience_contract=renewal-card/2.1` 时启用
这条正式管线；旧 `/api/generate` 与非 V2.1 请求继续兼容旧行为。正式管线把
SourceComponent 当作不可替换视觉锚点，ProductSlot 只描述其他补充商品；布局、
商品选择、两次以内的效果图尝试和视觉评分均写入 PlanVersion 的
`pipeline_artifacts`。商品、预算、状态、来源和发布门禁仍由代码拥有。
正式 V2.1 分支现在会在生成 Demo 兼容卡片骨架后，单独用真实 `room_input` 调用
`RoomAnalyzer`，再把 live/fallback RoomProfile 交给 `FormalRenewalPipeline`；
因此 LayoutPlan、Prompt 与 `scene_assessment` 不再误用 Demo RoomProfile。
RenderPrompt Builder 还会按 `selected_catalog_candidate.product_id` 从补充商品列表
排除 SourceComponent，避免同一圈选组件被再次描述成“其他商品”并诱发重复生成。
首轮真实基准暴露后又补了两层确定性门禁：`table_lamp/lighting` 等同义品类族不能
再次进入 ProductSlot；包含整理目标时服务端强制补齐 `remove_trash` 与
`organize_loose_items`。正式模式下 Layout Planner 只要 fallback/needs_input 就
直接让 GenerationRun 失败，禁止再拿通用 fallback LayoutPlan 继续消耗 Seedream。
视觉验收新增前后杂乱等级、清理比例、整理动作可见性、组件数量和额外同品类数量；
整理任务清理比例低于 55%、结果不是低杂乱或出现第二件同品类组件时，服务端强制
拒绝，不再相信模型自行给出的高分。

视频圈选也已经进入正式后端：前端从视频关键帧裁剪用户 bbox 后，只上传裁剪图，
媒体用途为 `visual_search_query`；`VisualSearchService` 调用文本视觉模型提取
品类、颜色、材质、形状、风格和受限搜索词，模型不得生成品牌、SKU、价格、库存或
购买链接。用户确认候选后，`AssetService.createSourceComponent` 由服务端创建
`asset_type=item`、`parse_state=ready` 的稳定资产，内部保存
`source_component_id`、原裁剪媒体、视频时间点和 bbox；客户端通用 Asset API
不能伪造 `immutable_anchor` 或视觉身份。当前 SourceComponent 本身的视觉事实来自
真实裁剪图，但候选商品事实与补充商品选择仍来自明确标注的 Demo Catalog，不是
真实抖音商品目录。

下一阶段产品重构蓝图见
`docs/raw-to-refined-rearchitecture-plan.md`。该文档把“毛坯 → 精装”定义为
局部空间从未经整理和搭配的原貌到完整软装结果，不扩张为硬装、施工或整屋承诺；
建议默认组合为 `transformation_strength=high` 与
`visual_density=restrained`，以“变化明显但新增克制”解决强反差与不过度繁复之间
的张力。计划保留现有 Asset/SpaceVersion/DesignRequest/GenerationRun/
PlanVersion 底座与 AICard v1 兼容视图，新增 DesignRequest/GenerationRun `1.1`
和 PlanVersion `renewal_manifest`。其中动态 LayoutPlan/ProductSlot、正式生图
Prompt Builder、SourceComponent 双图输入与效果图视觉验收已经迁入持久正式链路；
`renewal_manifest` 独立协议、保护 mask、真实商品目录和生产级评测仍是后续目标。

焕新结果之后的抖音购买承接已冻结为独立 Draft 协议，见
`docs/product-discovery-api-contract.md`；后端已完成第一阶段：四个
`/api/v1/product-discovery-*` 接口、`ProductDiscoveryRun` Repository、
`ProductDiscoveryService` 六阶段状态机、`ProductDiscoveryProvider` Port、
Agent Plan 多模态 `AgentPlanProductDiscoveryProvider`、plan-grounded fallback、
Demo Catalog grounding 与共享 fixture/协议测试。非 Demo 模式且配置
`AGENT_PLAN_API_KEY` 时，真实视觉 Agent 读取私有 after 图，结合 PlanVersion
新增物白名单定位可购买元素、输出归一化 bbox、外观与受限检索词；Agent 不能拥有
product_id、价格、库存、店铺或链接。`GET /api/health` 此时如实标注
`features.product_discovery_live_agent=true` 与
`model_capabilities.product_discovery=agent_plan_visual_grounding`。
`features.douyin_commerce_catalog=false` 仍保持不变：当前商品事实来自明确标注的
Demo Catalog，不得描述成真实抖音商品或交易。

| 运行面 | 成熟度 | 当前事实 |
| --- | --- | --- |
| `apps/web` | 运行时 Live 集成原型 | 离线样例/灵感读取 `REMIX_DATA`；完整流程调用 `health/generate/revise` 并展示 LIVE/FALLBACK/DEMO |
| `apps/douyin-demo/douyin-static-demo/renewal.html` | 默认可持久联调集成原型 | 正式请求默认提交 `renewal-card/2.1`；单核心卡片承载灵感/SourceComponent、空间、约束、生成进度与结果；结果后接商品发现与购买/搜索承接 |
| `/api/generate`、`/api/revise` | 向后兼容 | 请求和 AICard v1 响应不破坏；内部结果已持久化 |
| `/api/v1` | P0 可持久联调版 | 41 条路由；新增视频圈选视觉查询/候选确认，私有媒体、SourceComponent 资产、任务、运行、方案版本、偏好和事件可用 |
| 正式焕新管线 | 运行时静态集成，尚非生产级 | V2.1 请求执行 LayoutPlan/ProductSlot、SourceComponent 参考图生图、视觉验收和最多一次回炉；Demo 模式只验证结构，不执行真实视觉评分 |
| 真实模型 | Agent Plan + Seedream 已验收 | 空间识别、组件视觉身份、正式 LayoutPlan、主方案多图 image-to-image 与效果图视觉验收；尚缺真实商品目录与生产流量验收 |
| `remix-room-from-inspiration/` | 可移植 Agent Skill | 把组件/风格灵感与目标空间组合为结构保持的主方案、生图指令、质量门禁和带来源实施清单；不依赖本仓后端即可生成并校验 `corner-renewal/1.0` JSON |

已实现：

- 固定服务端 Demo actor：`demo-user-001`；客户端不能提交 `owner_id`。
- Node 内置 SQLite Repository、migration v2、WAL、事务和持久幂等记录；v2 新增
  `visual_search_queries`，旧 v1 数据库可原地启动并自动建表。
- 私有 JPEG/PNG/WebP multipart 上传、真实签名检查、EXIF/文本元数据清理、
  非静态目录存储、短时 HMAC URL、未绑定媒体删除。
- Space / Inspiration / Item 三类资产、默认空间、去重收藏、解析状态、解析重试、
  draft/sealed SpaceVersion、乐观锁和隐私删除。
- 2 个空间、3 个灵感、5 个单品的固定 Demo seed。
- 不可变 DesignRequest、完整输入快照、预算/打孔/宠物/编辑区来源优先级。
- 九阶段 GenerationRun、轮询、取消、失败重试和进程启动恢复。
- PlanAsset 稳定谱系、不可变 PlanVersion、方案列表/详情、预算与换风格调整。
- Preference 显式偏好和白名单事件批次。
- 旧 `generate → revise(300)` 继续返回 486 元与 240 元结果，并写入同一个持久
  PlanAsset 的两个 PlanVersion。
- AICard v1、旧请求 Schema、`platform-v1.schema.json` 和结构化错误。
- 41 个 `/api/v1` 操作使用 `packages/contracts/src/v1-route-manifest.js` 作为
  方法、路径、幂等和 multipart 事实源；`docs/openapi.yaml` 与
  `GET /api/openapi.json` 提供同源 OpenAPI 3.1，GenerationRun 额外投影
  `progress` 和结构化 `needs_input`。
- 焕新结果商品发现后置工作流：`ProductDiscoveryService` 六阶段状态机
  （`queued → analyzing_render → building_queries → retrieving_products →
  grounding_matches → packaging → succeeded | failed | cancelled`）、
  `ProductDiscoveryRun` Repository 持久化与重启恢复、
  `AgentPlanProductDiscoveryProvider`、`UnconfiguredProductDiscoveryProvider`
  与 `PlanGroundedDiscoveryProvider` 三个内建 Provider、复用
  `demo-catalog.js` 的 `DemoCommerceCatalogAdapter` 与确定性 Grounding
  校验器；四个 `/api/v1` 接口（`createProductDiscoveryRun`、
  `listProductDiscoveryRuns`、`getProductDiscoveryRun`、
  `cancelProductDiscoveryRun`）与 `platform-v1.schema.json` 中
  `ProductDiscoveryRun`/`GroundedProductMatch`/`DiscoveredSubject`/`ProductDiscoveryProvenance`
  同源，通过 `packages/contracts/src/openapi.js` 自动生成 OpenAPI。V2.1 packaging
  阶段额外生成 `implementation_list`（来源角色 `video_selected|source_video|
  ai_supplement`，`sort_group=0|1|2`）、`estimated_total_cny` 与 `currency`；
  商品去重按 `product_id`，同一 product_id 不会跨 list_item 重复出现。
- V2.1 renewal-card 协议全部实现（`renewal-card/2.1`）：
  - `AssetService.confirmIntent` 生成不可变 `confirmed_intent` 快照，
    `intent_analysis` 只读不覆盖；模糊场景返回 `parse_state=needs_confirmation`
    并提供候选。
  - `DeterministicAssetUnderstandingAdapter` 为 inspiration 输出结构化
    `intent_analysis`，含 `state|suggested_type|component_reference|
    style_reference|candidates`。
  - `DesignRequestService` 支持 `options.experience_contract=renewal-card/2.1`，
    未确认灵感 → `409 intent_confirmation_required`，快照保存
    `confirmed_intent + context_fingerprint`（sha256 前 16 位）。
  - AI 示例空间 seed 附带 `scene_origin=ai_example, read_only=true`，PATCH/DELETE
    统一 `409 ai_example_scene_read_only`。
  - `RelatedDesignService` 独立六阶段状态机（`queued → extracting_context →
    retrieving_inspiration → retrieving_scene → reranking → packaging →
    succeeded|failed|cancelled`），one-active、cancel、retry、refresh 与重启
    恢复；结果计算双关系（inspiration + scene），单路降级标 `fallback_dimension`；
    open_action 只允许白名单类型与 `snssdk1128://` deep link/内部
    `internal_publication_id`；`DemoDouyinContentProvider` 与
    `LocalPublicationIndexProvider` 两个 Port，未 published Publication 永不召回，
    context_fingerprint 变化会取消迟到的 run。
  - `PlanService` V2.1 分支：`experience_contract=renewal-card/2.1` 只输出
    主效果图（`alternatives=[]`），PlanVersion 保存
    `experience_contract` 与 `implementation_source_roles`（每个 product 归入
    video_selected/source_video/ai_supplement 角色，from_reference_asset_id 追踪
    来源）。
  - `FormalRenewalPipeline` 由 `PlanService` 拥有，不依赖 Prompt 实验台：
    图 1 是真实空间，图 2 是可选的 SourceComponent 裁剪图；Agent 输出
    `LayoutPlan`，其中 SourceComponent 必须有精确
    `source_component:<source_component_id>` 的 add action，`ProductSlot` 不得包含
    这个组件。`PlanService` 在进入正式管线前先调用真实 RoomAnalyzer，并把明确的
    live/fallback RoomProfile 传入布局和 `scene_assessment`；服务端再用 Demo Catalog
    选择补充商品并执行确定性预算/方案校验。
  - 正式 RenderPromptSpec 位于 `src/prompts/renewal-v2.js`，已把根目录
    `shengtu_prompt.md` 的机位/结构锁定、强视觉焦点、材质层次、写实摄影和负面约束
    抽象为版本化 Builder；当前版本只完成工程接入，尚未对提示词质量做专项优化。
  - 正式效果图把空间图与 SourceComponent 裁剪图共同发给 Seedream。随后视觉模型
    同看 before / component / after，按 `base_fidelity`、组件一致性、变化可见性、
    视觉协调、物理合理、约束遵守和杂乱风险执行服务端阈值判断。第一次不通过时把
    `repair_instruction` 送回 Seedream，仅回炉一次；第二次仍不通过则
    GenerationRun 失败，不保存或发布不合格 after 图。RenderPrompt 中的
    “补充商品”会再次排除 SourceComponent 对应 product_id，防止规划正确但生图指令
    重复列出圈选组件。
  - 三条视觉搜索路由：
    `POST /api/v1/visual-search/queries`、
    `GET /api/v1/visual-search/queries/{visual_search_query_id}`、
    `POST /api/v1/visual-search/queries/{visual_search_query_id}/selections`。
    查询只接收裁剪图媒体与视频来源上下文，选择由服务端落为稳定
    SourceComponent；正式商品发现 Agent 与 plan-grounded fallback 都会排除
    `implementation_source_roles.role=video_selected`，不会再次把用户组件输出成
    “其他商品”。
  - `PublicationService`（保存 ≠ 发布）：`indexing → published | index_failed |
    withdrawn`，同一 PlanVersion + actor 最多一个未撤下 Publication；发布前必须
    `plan.lifecycle=saved`；`index_failed` 可重试且不影响私人方案；撤下立即从
    RelatedDesign 本地索引消失，不删除 PlanAsset；`published_snapshot` 仅保存
    scene_type/intent_type/source_attribution 与检索关键字，不复制私有渲染或
    自由文本。
  - `CommerceHandoffService` 生成 CartIntent：校验 list_item/match/quantity 归属
    同一成功 ProductDiscoveryRun，全部有效 → `search_bundle`（真实抖音购物车
    Bridge 未接入，`cart_batch_handoff=false`）；部分/全部无效返回
    `partial`/`unavailable`；action.token 短时 opaque（randomBytes(24) base64url，
    绑定 actor/run/items），日志不记录 token；不创建订单，不返回“购买成功”。
- V2.1 契约与 Route Manifest（`packages/contracts/src/v1-route-manifest.js`）新增 9 个
  operationId，全部进入 OpenAPI 3.1、`platform-v1.schema.json` 与 canonical
  fixtures：`confirmInspirationIntent`、`createRelatedDesignRun`、
  `listRelatedDesignRuns`、`getRelatedDesignRun`、`cancelRelatedDesignRun`、
  `createPublication`、`getPublication`、`withdrawPublication`、`createCartIntent`。
- `examples/contracts/renewal-v2/` 13 个 canonical fixture 覆盖组件/风格意图确认、
  Related running/ready/partial/empty、Publication indexing/published、
  Implementation ready-component/ready-style/partial、CartIntent unavailable；
  逐字段通过 `platform-v1.schema.json` 与结构性测试。
- `GET /api/health.features` 增加五个 V2.1 flag：`renewal_intent_v2=true`、
  `related_designs=true`、`plan_publication=true`、`implementation_list_v2=true`、
  `cart_batch_handoff=false`（真实抖音购物车 Bridge 未接入时保持 false，返回
  search_bundle/unavailable，绝不冒充 live）。
- EventService 白名单新增 6 个 V2.1 事件：`intent_confirmed`、`scene_switched`、
  `related_design_opened`、`publication_requested`、`implementation_opened`、
  `cart_handoff_requested`；仍拒绝图像、bbox、URL、token 与自由文本。
- 比赛复用 Skill `remix-room-from-inspiration` 遵守 Agent Skills 目录规范：
  `SKILL.md` 只保留核心工作流，详细设计与输出协议按需读取 `references/`，
  `scripts/validate-renewal-plan.mjs` 确定性校验组件锚点、固定结构、ProductSlot
  商品事实边界、效果图成熟度、视觉门禁和实施清单来源顺序；随包示例不依赖
  项目数据库、模型 Key 或 Demo Catalog。
- Agent Plan 专属 OpenAI 兼容网关 RoomProfile 适配器、固定官方 Base URL、低消耗
  鉴权脚本和同协议 fallback。
- Seedream 5.0 Lite 图片编辑适配器：只为首次生成的主方案调用一次，输入原图、
  结构保持约束、摆放规则与商品名；输出校验 Base64、MIME、文件签名、大小和真实
  图片结构后写入私有媒体。
- 正式 V2.1 流水线使用版本化 LayoutPlan、RenderPromptSpec 和 RenderEvaluator；
  规划、Seedream 生图、最多一次回炉、私有媒体与 PlanVersion 持久化由同一正式
  管线拥有。旧 Prompt 实验台及专用 API 已移除。
- 空间识别来源与效果图来源在 Web 分开显示；图片失败只降级效果图，结构化方案
  继续返回。
- Web 会把后端返回的 `/api/v1/media/...` 私有媒体相对地址解析到 API
  `8787`，而不是错误请求 Web 静态端口 `8765`；这是 `0.5.1` 的破图修复。
- Web 图片压缩、真实生成、AICard 映射、来源证据、结构化错误、重新生成和
  `revise(300)`。
- Agent Plan 自由文本可见标签到稳定空间/区域代码的保守归一化。
- 抖音前端 68 项自动测试、后端/协议自动测试、真实 Seedream 闭环检查与
  一键可读后端示例。
- 仓内抖音前端已提供同源静态/API 代理和一键启动；前端正式主链路为
  `video context 或 media upload → Asset → sealed SpaceVersion → DesignRequest
  → GenerationRun → PlanVersion`，商品价格和校验结论只读后端字段。
- `renewal.html` 已从多 hash 页面重构为 `IDLE / GENERATING / RESULT_READY /
  ADJUSTING` 单页状态流；资产和历史不再抢占主流程，旧 hash 由 `mode.js` 兼容
  解析。结果可创建降预算/换风格的新版本，不覆盖父 PlanVersion。
- `renewal.html` 的 Product Discovery 前端已经按共享 `1.0` 协议落地：独立 Client、
  DTO Adapter、PlanVersion/context Store 隔离、刷新 list/get 恢复、800/1500ms
  可见性轮询、取消/重试、完整状态区和 `shop-the-look` 商品票据。合法 bbox 才显示
  可键盘操作的数字热点；bbox=null 不显示。四类 CommerceAction 均不根据
  product_id 拼接链接，Demo/Fallback/Live 按 image analysis 与 catalog provenance
  分开标注。
- 后端能力未声明或请求失败时不会静默切 Demo；用户必须点击“使用本地离线 Demo”
  才读取共享 fixture，页面持续显示“本地离线 Demo”，且不发送商品事件。
- 抖音推荐流新增独立 `visual-search/**` 体验：手动暂停后定帧、框选、候选选择、
  轻量 2D 资产生成和入库完成页。后端未声明视觉搜索能力时使用固定本地候选并如实
  标注；用户确认后优先调用现有 AssetService 创建 saved ItemAsset。
- 视觉搜索全流程已与焕新核心统一为温馨家居编辑语言：奶油纸、苔绿和陶土橙，
  框选画面使用相纸式容器，查询、候选、建模和完成页使用“好物/收藏”用户语言；
  Demo 来源、2D/3D 能力和隐私提示仍明确展示。

仍未实现或未达到生产成熟度：

- `apps/web` 当前接的是兼容 AICard 接口，不是持久 `/api/v1`；保存仍是
  `localStorage` 摘要，刷新不恢复上传图。持久 `/api/v1` 前端主路径已经移到
  `apps/douyin-demo/douyin-static-demo/renewal.html`。
- 公网使用共享访问口令和固定 Demo actor，不是多用户身份系统；仍没有账号隔离、
  内容安全审核、多租户或多人家庭。
- 没有真实商品、库存、交易、教程或抖音内部接口。
- PlanVersion after 图后置真实视觉 Agent 已接入，但没有真实抖音商品目录、库存
  或交易接入。Agent 只识别方案新增物和高置信软装补充、生成 bbox 与检索需求；
  Demo Catalog 和确定性代码独立拥有商品事实。非 Demo 模式且 Key 可用时
  `features.product_discovery_live_agent=true`；缺 Key、指定 Demo、上游失败或
  Agent 输出非法时自动回到 bbox=null 的 plan-grounded fallback。
  `features.douyin_commerce_catalog=false` 在获得真实目录授权前必须保持。
- 本机 `.env.local` 已配置 Agent Plan 个人版专属 Key。2026-07-25 运行
  `npm.cmd run check:agent-plan` 成功连接官方专属网关，模型
  `doubao-seed-2-0-lite-260215` 返回有效响应，共消耗 83 tokens；Key 本身不得写入
  仓库、日志或交接文档。
- 同日运行 `npm.cmd run check:agent-plan-room`，使用许可记录内的
  `apps/web/assets/desk-before.png` 完成真实 RoomProfile：`source_mode=live`，
  配置模型 `doubao-seed-2.0-lite`，耗时约 14.5 秒，输出通过 RoomProfile 协议
  校验。
- 同日已在 1440px 浏览器完整点击选灵感 → 默认/上传空间 → 加约束 → 生成：
  页面显示 `LIVE`、原木方案 ¥486、6 件商品和 4 项校验；随后点击压到 ¥300，
  得到高效收纳版 ¥240、4 件商品。390px 手机宽度上传预览无横向溢出。该验收仍走
  兼容接口，不代表 `/api/v1` 前端持久链路已完成。`/api/v1` 的
  `asset_understanding`、`planning_agent` 和 `segmentation` 仍未接真实供应方。
- 首次生成只给当前主方案调用一次 Seedream；另外两个候选方案仍为预生成示意，
  预算调整目前也不重新绘图。不能把一张主效果图扩大描述为全部候选均实时生成。
- 2026-07-25 运行 `npm.cmd run check:agent-plan-image` 完成真实
  `RoomProfile → Seedream → 私有媒体` 闭环：空间与效果图来源均为 `live`，
  模型配置为 `doubao-seedream-5.0-lite`，返回 `image/jpeg` 286,836 字节并通过
  短时签名 URL 读取。脚本不输出 Key、Base64、完整提示词或供应方正文。
- 没有外部消息队列；解析与生成队列都在进程内，重启会恢复 queued/running 记录
  并重新执行，但不支持多进程竞争。
- 没有厘米级测量、硬装或专业施工建议。

不得把当前实现描述为生产级空间设计或完整 Live 链路。AICard
`source_mode=live` 只代表本次空间理解来源；效果图看
`render.is_demo_asset` 和 `data_sources[kind=render_generation]`，商品与教程继续
以各自 `data_sources[]` 为准。

## 2. 对象模型、身份和所有权

```text
MediaObject
  → Asset(space | inspiration | item)
    → SpaceVersion(draft → sealed，仅 space)
      → DesignRequest(不可变输入快照)
        → GenerationRun(一次执行/重试)
          → PlanAsset(稳定谱系)
            → PlanVersion v1 → v2 → ...
              → AICard v1(前端 DTO 快照)
              → ProductDiscoveryRun(独立后置运行)
                → DiscoveredSubject[] → GroundedProductMatch[] → CommerceAction
```

V2.1 目标在这条底座上增加独立对象，不把新语义继续塞进 AICard：

```text
InspirationAsset.intent_analysis
  → confirmed_intent(component | style)
    + sealed SpaceVersion
      → immutable DesignRequest
        ├→ GenerationRun → PlanVersion → PlanAsset(draft | saved)
        │                               ├→ Publication(indexing | published | withdrawn)
        │                               └→ ProductDiscoveryRun → implementation_list
        │                                                         → CartIntent
        └→ RelatedDesignRun → Douyin content + published Publication
```

上述 `confirmed_intent`、RelatedDesignRun、Publication、implementation_list v2 和
CartIntent 均是 `docs/v2-parallel-development-contract.md` 中的待实现目标；只有
PlanAsset 保存和 ProductDiscoveryRun 底座当前已实现。保存与发布必须分开，相关
设计与生成必须独立运行，场景切换必须创建新 DesignRequest。

视频框选新增目标对象链：

```text
QueryMedia（用户确认的裁剪图）
→ VisualSearchQuery
  → Candidate[]（仅候选）
    → 用户确认
      → ItemAsset（稳定身份）
        → ModelGenerationRun
          → ModelVersion（不可变派生物）
```

当前只实现前端状态与 ItemAsset 兼容写入；VisualSearchQuery、Candidate、
ModelGenerationRun 和 ModelVersion 的 Repository/API 尚未实现，契约见
`docs/visual-search-api.md`。

旧 3D Composition 与 PromptLabRun 均已从当前对象模型移除。正式规划、生图和
视觉验收只存在于 `DesignRequest → GenerationRun → PlanVersion` 谱系中；不得
重新引入不持久的第二套实验结果对象。

身份含义：

- `media_id`：一份私有原图或派生媒体。
- `asset_id`：用户空间、灵感或单品的稳定身份。
- `resource_version`：Asset、draft SpaceVersion、PlanAsset、Preference 的乐观锁。
- `space_version_id`：一组照片和解析事实；sealed 后不可修改。
- `parse_run_id`：一次资产解析尝试。
- `design_request_id`：不可变任务输入。
- `generation_run_id`：一次工作流执行；`AICard.request_id` 与它相等。
- `plan_asset_id`：方案版本谱系。
- `plan_version_id`：不可变结果版本；`AICard.plan.plan_id` 与它相等。
- `product_discovery_run_id`：针对一个不可变 PlanVersion after 图的商品发现尝试；
  retry/refresh 创建新 run，不覆盖旧 run。
- `subject_id`：效果图中一个可购买元素；只有服务端返回的合法 bbox 可形成前端热点。
- `match_id`：经目录 grounding 后可展示的商品匹配；商品事实和 CommerceAction
  始终来自服务端响应。
- `related_design_run_id`：V2.1 目标中针对一个 DesignRequest 的相关内容召回尝试；
  不与 GenerationRun 共用状态。
- `publication_id`：V2.1 目标中用户主动公开的不可变 PlanVersion 快照；不是
  PlanAsset 的布尔字段。
- `cart_intent_id`：V2.1 目标中的短时宿主交接身份；不是订单或购买成功凭证。
- `baseModelId`：试搭基础包模型的稳定引用；当前为前端 fixture ID。
- `attachmentModelId`：挂件模型的稳定引用；当前为前端 fixture ID。
- `anchorId`：包模型局部坐标中的推荐连接点；自由拖动后当前值为 `free`。
- `Composition.schemaVersion`：浏览器保存结构版本；目前固定为 1。
- HTTP `X-Request-Id`：日志关联，不能作为业务对象 ID。

Repository 所有查询显式接收 actor。跨 actor、不存在和已删除资源统一为 404，
避免枚举私有数据。AICard 是组合视图，不是数据库事实模型。

规则所有权：

- `packages/contracts`：协议形状、枚举与结构断言。
- `packages/validation`：预算、安装、保留、结构、尺寸、库存和宠物安全。
- Repository/Service：所有权、状态机、版本、删除、价格/库存来源。
- 模型：只提取事实候选、提出方案或生成图像，不能拥有确定性规则。
- 前端：只渲染和装配请求，不自行重新计算预算或发明业务结论。
## 3. 状态、转换和组合

资产有两个独立维度：

```text
lifecycle: temporary | saved | archived
parse_state: queued | parsing | needs_confirmation | ready | failed
```

空间版本：

```text
draft
  → parse queued/running
  → needs_confirmation | ready | failed
  → 用户确认并 seal
  → sealed + ready（终态）
```

V2.1 核心卡片采用正交状态，不再用单一页面枚举覆盖全部能力：

```text
entry: recognizing → needs_confirmation → confirmed
generation: not_started → active → ready | failed | cancelled
related: not_started → active → ready | partial | empty | failed
publication: not_started → saving → saved → publishing → published | failed
implementation: closed → loading → ready | partial | empty | failed
```

用户切换场景时，前端增加 context epoch，用同一 confirmed InspirationAsset 和新
SpaceVersion 创建新 DesignRequest，并行启动 GenerationRun 与 RelatedDesignRun。
旧请求可保留为历史，但旧响应必须通过 `design_request_id + epoch + run_id` 三重
校验后才能写 UI。

- sealed 后修改图片、参考尺寸或检测物必须创建新 SpaceVersion。
- Asset 名称、默认预算、长期约束和是否默认仍可独立 PATCH。
- DesignRequest 只能引用 sealed SpaceVersion。

生成：

```text
queued
→ input_validation
→ space_analysis
→ reference_analysis
→ constraint_filter
→ matching
→ planning
→ rendering
→ validation
→ packaging
→ succeeded | failed | cancelled
```

- 同一 DesignRequest 同时最多一个 active run。
- succeeded 后不能重复执行；failed/cancelled 可用新 run 重试。
- `AICard.status=needs_input` 是成功业务结果，不是 500。
- 模型失败后成功使用 Demo 降级时 run 仍 succeeded，`source_mode=fallback`。

V2.1 正式生成在上述 GenerationRun 阶段内增加以下不可见子状态：

```text
SourceComponent(optional, immutable)
→ LayoutPlan(ready | deterministic fallback)
→ ProductSlot[]（仅补充商品）
→ SelectedProduct[]（当前为 Demo Catalog 事实）
→ render attempt 1
→ EvaluationResult
   ├─ pass → persist generated_render → package
   └─ fail → repair_instruction → render attempt 2
              ├─ pass → persist generated_render → package
              └─ fail → GenerationRun failed，不暴露 after 图
```

- SourceComponent 一旦进入 DesignRequest 快照，在本次运行中不可换品、不可取消锚定；
  用户要换组件必须创建新的 DesignRequest。ProductSlot 不拥有商品事实，可以被
  服务端目录选择结果独立替换。
- 视觉验收前的图片字节只存在于当前进程调用链；只有最终通过版本才创建
  `generated_render` 私有媒体。Demo 模式不调用生图/评测模型，明确保留演示图。
- PlanVersion 的 `pipeline_artifacts` 保存布局、槽位、选择结果、Prompt 版本和每次
  评分，不保存图片 Base64、供应商原始正文或 Authorization。

商品发现：

```text
queued → analyzing_render → building_queries → retrieving_products
→ grounding_matches → packaging
→ succeeded(ready | partial | empty) | failed | cancelled
```

- 前端展示状态由唯一 Adapter 映射为 `not_started | unavailable | queued |
  analyzing | ready | partial | empty | failed | cancelled`；组件不重复解释协议。
- 前端进入结果先看 health feature，再 list 最新 run；active 恢复轮询，成功 get 完整
  run，无历史才 POST initial。PlanVersion 切换和同版本 retry/refresh 都创建新
  contextId，旧响应写 Store 前会被拒绝。
- 页面隐藏暂停轮询，恢复可见后立即 GET；连续网络错误停止等待用户重新连接，不能
  自动创建第二个 run。AbortController 不等于后端 cancel。

方案调整：

- `reduce_budget` 与 `change_style` 都先创建派生 DesignRequest，再创建 GenerationRun。
- 当前方案历史保持线性；父版本必须等于当前版本。
- 新版本、PlanAsset current pointer 和 resource version 在同一 SQLite 事务更新。
- 失败调整保留派生任务和失败 run，不移动当前版本。
- 方案内容变化才创建 PlanVersion；saved/selected 等用户状态只 PATCH PlanAsset。

- 多视角只是相机预设，不会生成或保存四份模型。

## 4. 代码与模块所有权

### 当前三人协作边界

当前迭代按产品、前端、后端三条线并行，完整执行规则见
`docs/team-roles.md`；V2.1 的目录级边界和契约变更顺序以
`docs/v2-parallel-development-contract.md` 为准：

- 产品拥有问题优先级、用户承诺和验收口径；每轮最多冻结 3 个 P0，不直接把想法
  当成实现方案。
- 前端拥有 `apps/douyin-demo/**`、`apps/web/**`、Adapter 和浏览器状态；不复制
  价格、预算、安全、尺寸或来源等后端规则。
- 后端拥有 `services/**`、`packages/**`、生图 Prompt Builder、版本和评测；Prompt
  只翻译已确认的结构化输入，不能覆盖 Repository、Schema 或确定性校验。
- 项目发起人 `xbhmd0434` 协调联合回归、PR 合并和候选 Commit。

前后端可以分别实现，但用户主路径、Contract/fixture 和最终集成 Commit 必须经过
共同阶段门。纯 Prompt 内部改动若不改变协议可以独立合并，但必须提供固定案例的
对比评测；需要新增字段时先提交单独 Contract PR。

V2.1 并行期前端只修改 `apps/douyin-demo/**`，后端/契约线维护 `services/**`、
`packages/contracts/**`、canonical fixtures 和生成 OpenAPI。根依赖、lockfile、
本文和共享协议由集成负责人收口，避免两个分支同时修改。字段变更必须先形成
“协议 + Schema + fixture”独立 Commit，双方 rebase 后再改实现。

### `packages/contracts`

- `schemas/aicard-v1.schema.json`：前端结果 DTO。
- `schemas/generate-request-v1.schema.json`、`revise-request-v1.schema.json`：
  旧兼容请求。
- `schemas/platform-v1.schema.json`：Media、Asset、SpaceVersion、DesignRequest、
  GenerationRun、PlanVersionEnvelope、Preference、EventBatchResult 聚合协议。
- `src/index.js`：旧协议零依赖运行时断言。
- `src/v1-route-manifest.js`：41 个 `/api/v1` 操作（原 38 + 视觉搜索 3）的方法、
  路径、幂等和请求类型事实源；服务端路由和 OpenAPI 生成器共同消费。
- `src/openapi.js`：从路由清单与 JSON Schema 组装 OpenAPI 3.1；生成文件由
  `scripts/generate-openapi.mjs` 写入 `docs/openapi.yaml`。

新增 `/api/v1` 字段时先改 Schema、fixture/测试和交接，再改服务端与前端。

### `packages/validation`

纯函数规则，无 I/O、时钟或隐式状态。商品事实、总价、安装、尺寸、结构、库存和
宠物安全仍由这里复核；模型输出不能绕过它。

### `services/orchestrator`

- `src/server.js`：HTTP、CORS、JSON/multipart、路由、幂等、错误与最小日志。
- `src/local-env.js`：本地开发读取 `.env`/`.env.local`；已有进程环境变量优先，
  不做变量插值。
- `src/platform.js`：Repository、服务和队列装配，真实进程使用这一入口。
- `src/repository.js`：SQLite migration、各集合、事务、actor、幂等和持久卡片。
- `src/services/media-service.js`：私有媒体、清理、签名 URL。
- `src/services/asset-service.js`：资产、匹配、解析任务、空间版本、删除；可信内部
  方法 `createSourceComponent` 是唯一可写不可替换组件身份的入口。
- `src/services/visual-search-service.js`：裁剪媒体校验、组件理解、目录候选和确认
  入库；不拥有商品价格或库存事实。
- `src/services/design-service.js`：Preference 与不可变 DesignRequest。
- `src/services/plan-service.js`：GenerationRun、现有 Workflow、方案谱系、调整和
  旧接口持久兼容。V2.1 分支拥有正式管线入口、只输出主效果图、保存
  `pipeline_artifacts` 并计算 `implementation_source_roles`。
- `src/services/formal-renewal-pipeline.js`：正式 LayoutPlan、SourceComponent 锚点
  门禁、ProductSlot 到 SelectedProduct、双图生图、视觉验收和一次回炉。
- `src/services/related-design-service.js`：V2.1 独立 RelatedDesignRun 状态机、
  DemoDouyin 与 LocalPublication 双 Provider、迟到运行按 context_fingerprint 丢弃。
- `src/services/publication-service.js`：V2.1 Publication 不可变发布对象、
  异步本地索引、`index_failed` 重试与撤下语义；不复制私有渲染到公开索引。
- `src/services/commerce-handoff-service.js`：V2.1 CartIntent 校验、宿主 Bridge
  未接入时降级 search_bundle，token 短时 opaque。
- `src/services/event-service.js`：白名单、最小化事件。
- `src/workflow.js`：已有确定性生成内核；不能再复制第二套工作流。
- `src/adapters/room-analyzer.js`：RoomProfile Agent Plan 直连与自有 HTTP 网关；
  稳定身份/用户确认尺寸不交给模型，响应必须过同一协议校验。
- `src/adapters/layout-planner.js`：正式管线使用的文本视觉规划
  传输/JSON 边界；支持最多四张输入图，限制 1～8 个动作和最多 5 个商品槽位。
- `src/adapters/component-understanding.js`：视频裁剪图到受控组件视觉身份；禁止
  商品事实，未配置 Agent Plan 时显式返回 fallback。
- `src/adapters/render-evaluator.js`：before/component/after 三图视觉验收；服务端
  重新计算通过条件，不信任模型返回的 `accepted` 布尔值。
- `src/adapters/asset-understanding.js`：当前确定性解析 adapter。
- `src/adapters/render-generator.js`：正式主方案 Seedream 请求、响应上限、图片
  签名和供应方错误分类。
- `src/prompts/renewal-v2.js`：正式布局、正式生图和视觉验收 Prompt Builder；版本
  分别为 `layout-planner-v2.0.0`、`render-spec-builder-v2.0.0` 和
  `render-evaluator-v1.0.0`。
- `docs/backend-product-handoff.md`：从当前抖音前端和产品闭环出发的后端正式
  交接，定义本轮 P0、Agent/代码边界、正式 GenerationRun 阶段、接口承诺和产品
  验收标准；后端排期与联调优先读取本文。
- `src/adapters/model-ports.js`：真实模型/精细 API 的空端口和能力说明。
- `test/v1-platform.test.js`：CORS、幂等、媒体、空间封存、生成、调整和重启。

### 前端与示例

- `apps/web/index.html`、`styles.css`、`app.js`：空间焕新兼容 AICard 页面。
- `services/orchestrator/src/public-access.js`：共享口令会话、HMAC Cookie、认证尝试、
  API/AI 限流、并发上限和真实 AI 总开关。
- `services/orchestrator/src/static-files.js`：正式抖音前端、兼容图片与受控 fixture 的
  单端口静态托管和目录穿越防护。
- 根目录 `Dockerfile` / `.dockerignore`：Node 24 非 root 运行、`/app/data`
  持久目录、健康检查和 Zeabur 镜像边界。
- `apps/douyin-demo/**`：默认抖音宿主前端，只消费公开 HTTP、Schema
  和授权 Demo 图片；`api/**`、`adapters/**` 和 `renewal/**` 已接通。
- `apps/douyin-demo/douyin-static-demo/renewal/components/**`：单核心界面的灵感、
  空间、约束、结果、资产抽屉和历史抽屉；`renewal/mode.js` 只负责启动入口兼容，
  `renewal/main.js` 负责状态和网络协调。
- `apps/douyin-demo/douyin-static-demo/api/product-discovery-client.js`：四条冻结
  Product Discovery 路由、默认 list 参数、创建幂等与显式共享 fixture 读取。
- `apps/douyin-demo/douyin-static-demo/adapters/product-discovery-view-model.js`：
  唯一协议映射、来源文案、bbox/HTTPS/CommerceAction 安全归一化。
- `apps/douyin-demo/douyin-static-demo/renewal/components/shop-the-look.js`：
  “把这一角搬回家”完整状态、数字热点、横向票据与动作装配，不拥有商品事实。
- `apps/douyin-demo/douyin-static-demo/visual-search/**`：视频暂停框选、查询状态、
  候选选择、轻量建模与完成页；`api/visual-search-client.js` 负责能力发现、裁剪图
  上传和三条已实现 `/api/v1/visual-search/**` 路由，后端能力不可用时才进入显式
  本地 Demo。
- `apps/douyin-demo/HANDOFF.md`：前端对象边界、页面状态、运行方式、
  已实现范围和分阶段验收事实源。
- `examples/run-backend-demo.mjs`：使用临时 SQLite 验证旧兼容结果进入持久历史。
- `examples/aicard.demo.json`：AICard v1 稳定渲染夹具。
- `remix-room-from-inspiration/`：比赛提交用可移植 Agent Skill；`SKILL.md` 拥有
  执行流程，`references/` 拥有设计规则与 `corner-renewal/1.0` 输出契约，
  `scripts/validate-renewal-plan.mjs` 拥有确定性验证，`assets/` 只放结构示例。
  根目录同名 ZIP 是其提交快照，修改源目录后必须重新生成并复验压缩包内容。

## 5. HTTP API 与兼容策略

保留：

```text
GET  /api/health
GET  /api/openapi.json
POST /api/generate
POST /api/revise
```

已实现 `/api/v1`：

```text
POST/GET/DELETE  /api/v1/media...
POST/GET/PATCH/DELETE /api/v1/assets...
POST/GET/PATCH   /api/v1/assets/{space}/versions...
POST/GET         /api/v1/visual-search/queries...
POST             /api/v1/visual-search/queries/{visual_search_query_id}/selections
POST/GET         /api/v1/design-requests...
POST/GET         /api/v1/generation-runs...
GET/PATCH        /api/v1/plans...
POST             /api/v1/plans/{plan}/revisions
GET/PATCH        /api/v1/me/preferences
POST             /api/v1/events/batch
POST/GET         /api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs
GET              /api/v1/product-discovery-runs/{product_discovery_run_id}
POST             /api/v1/product-discovery-runs/{product_discovery_run_id}/cancel
POST             /api/v1/product-discovery-runs/{product_discovery_run_id}/cart-intents
POST             /api/v1/assets/{asset_id}/intent-confirmations
POST/GET         /api/v1/design-requests/{design_request_id}/related-design-runs
GET              /api/v1/related-design-runs/{related_design_run_id}
POST             /api/v1/related-design-runs/{related_design_run_id}/cancel
POST             /api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/publications
GET/DELETE       /api/v1/publications/{publication_id}
```

Web 静态服务另有一个只读本机诊断端点：

```text
GET /api/runtime/hunyuan
→ status + engine + profile + pythonReady + weightsReady + sampleReady
```

它只返回布尔能力，不返回本机绝对路径、用户文件或密钥；不要把它混入公开
Orchestrator `/api/v1` 契约。生产模型生成端点尚未实现。

完整路径和字段基线见 `docs/backend-next-phase-handoff.md`；模型边界见
`docs/model-integration.md`；视频视觉搜索设计背景见 `docs/visual-search-api.md`，
当前运行契约以 Route Manifest、生成的 `docs/openapi.yaml` 和本节为准。

V2.1 目标接口与当前接口的复用/新增边界统一见
`docs/v2-parallel-development-contract.md`。待新增的是意图确认、
RelatedDesignRun、Publication 和 CartIntent；它们进入 Route Manifest、Schema、
OpenAPI、自动测试和 `/api/health.features` 之前均不得调用或描述为已实现。
ProductDiscoveryRun 继续作为“实施”底座，但目标交互改为用户点击后按需创建，
且需新增由后端生成的 `implementation_list` 来源排序投影。

通用契约：

- CORS：`GET, POST, PATCH, DELETE, OPTIONS`。
- 允许 Header：`Content-Type, Idempotency-Key`。
- 暴露：`X-Request-Id, ETag, Deprecation, Sunset`。
- 创建媒体、资产、解析 run、SpaceVersion、DesignRequest、GenerationRun、
  PlanRevision 和事件批次要求 `Idempotency-Key`。
- 相同 scope/key/fingerprint 重放第一次响应；不同 fingerprint 返回 409。
- 媒体上传的幂等记录不持久保存短时 token；重放时对同一 `media_id` 重新签发
  access URL。
- Asset、draft SpaceVersion、PlanAsset、Preference PATCH 使用 `resource_version`。
- 错误统一为 `schema_version + request_id + error`，未知 5xx 不返回堆栈。
- GenerationRun 统一返回 0～100 的 `progress` 和对象/null 形态的
  `needs_input`；待补对象从终态 AICard `follow_up` 投影，并明确是否已有预览。
- `npm.cmd run openapi:generate` 更新可导入契约；`openapi:check` 及根检查验证生成
  文件、41 个操作、幂等 Header、Schema 引用和示例不漂移。

旧接口内部持久化：

- `/api/generate` 仍直接返回 AICard，但会创建兼容 DesignRequest、GenerationRun、
  PlanAsset 和 PlanVersion。
- `/api/revise` 可在进程重启后读取持久卡片，预算调整写入同一 PlanAsset 新版本。
- 新前端正式业务只调用 `/api/v1`；旧接口不增加新产品字段。

## 6. 配置

本地后端启动时读取项目根目录 `.env` 和 `.env.local`；操作系统、终端、进程
管理器或部署平台已提供的环境变量优先。本地密钥只放 `.env.local`。

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `ORCHESTRATOR_HOST` | `127.0.0.1` | 默认只回环监听 |
| `ORCHESTRATOR_PORT` | `8787` | API 端口 |
| `AI_BACKEND_MODE` | `demo` | `demo / auto / live` |
| `ROOM_ANALYZER_PROVIDER` | 自动推断 | `demo / gateway / agent_plan` |
| `AGENT_PLAN_BASE_URL` | 官方北京专属网关 | 只允许 `https://ark.cn-beijing.volces.com/api/plan/v3` |
| `AGENT_PLAN_API_KEY` | 空 | Agent Plan 个人版专属 Key，仅服务端 |
| `AGENT_PLAN_TEXT_MODEL` | `doubao-seed-2.0-lite` | RoomProfile 多模态理解 |
| `AGENT_PLAN_IMAGE_MODEL` | `doubao-seedream-5.0-lite` | 主方案实时图片编辑 |
| `AGENT_PLAN_TIMEOUT_MS` | `30000` | Agent Plan 调用超时 |
| `AGENT_PLAN_LAYOUT_TIMEOUT_MS` | `90000` | 正式 LayoutPlan、效果图验收与实验台规划的单次超时 |
| `AGENT_PLAN_IMAGE_TIMEOUT_MS` | `90000` | Seedream 单次图片请求超时 |
| `AGENT_PLAN_DISCOVERY_TIMEOUT_MS` | `45000` | 商品发现视觉 Agent 单次多模态请求超时 |
| `AGENT_PLAN_DISCOVERY_RESPONSE_LIMIT_BYTES` | `524288` | 商品发现 Agent JSON 响应上限 |
| `AGENT_PLAN_IMAGE_RESPONSE_LIMIT_BYTES` | `25165824` | Seedream JSON/Base64 响应上限 |
| `CORS_ORIGINS` | 本机 8765 | 精确允许来源 |
| `DATA_DIRECTORY` | `./data` | 运行时私有数据根 |
| `DATABASE_PATH` | `./data/ai-corner-renewal.sqlite` | SQLite |
| `PRIVATE_MEDIA_DIRECTORY` | `./data/private-media` | 非静态媒体目录 |
| `MAX_UPLOAD_BYTES` | `20000000` | 单图上限 |
| `TEMPORARY_RETENTION_HOURS` | `24` | 未绑定/临时资源保留 |
| `MEDIA_ACCESS_TTL_SECONDS` | `900` | 私有媒体 URL 有效期 |
| `LIST_LIMIT_MAX` | `100` | 列表最大页长 |
| `ROOM_ANALYZER_*` | 空/见模板 | Provider 选择、自有 RoomProfile 网关和响应限制 |
| `DEMO_ACCESS_CODE` | 空 | 公网共享访问口令；公网监听必填，8～128 字符 |
| `SESSION_SIGNING_SECRET` | 空 | HMAC 会话签名密钥；公网监听必填，至少 32 字节 |
| `SESSION_TTL_SECONDS` | `14400` | 评审会话有效期 |
| `TRUST_PROXY` | `false` | Zeabur 设为 `true`，仅此时读取代理来源 IP |
| `API_REQUESTS_PER_MINUTE` | `240` | 每会话/IP 通用 API 分钟限额 |
| `AI_REQUESTS_PER_MINUTE` | `12` | 每会话/IP 昂贵 AI 请求分钟限额 |
| `AI_MAX_CONCURRENT` | `2` | 单进程真实 AI 并发上限 |
| `AI_REQUESTS_ENABLED` | `true` | 真实 AI 紧急总开关 |

`ASSET_UNDERSTANDING_*`、`PLANNING_AGENT_*`、`RENDER_EDIT_*` 和
`SEGMENTATION_*` 仍是预留的独立 Provider 接入位；当前 SourceComponent 理解、
正式 LayoutPlan 与效果图验收复用 Agent Plan 文本视觉模型，正式生图复用
Seedream。代码不会仅因写入预留 URL 就宣称能力可用。

`.env`、`.env.local`、数据库、WAL、上传媒体和密钥不能提交；`.gitignore`
已忽略 `.env*`（保留模板）和 `data/`。

旧 Three.js、Hunyuan 与 Prompt Lab 依赖已经删除；项目当前没有第三方 Node 运行
依赖，仍需保留 `package-lock.json` 供 Docker 中 `npm ci` 做可重复安装。

## 7. 数据、隐私与安全

- SQLite 保存 owner、稳定 ID、状态、版本、时间和 JSON 类型快照。
- 数据库 migration 版本是 2；启动自动验证并创建 Demo actor/seed，v2 新增
  `visual_search_queries` 通用 JSON 实体表。
- 私有媒体从不进入 Web 静态目录。
- Seedream 返回字节作为 `generated_render` 私有媒体保存，并绑定对应空间资产；
  删除空间会让派生效果图一起进入清理/脱敏边界。数据库与日志不保存原图或效果图
  Base64，AICard 持久层只保存逻辑媒体引用，读取时才签发短时 URL。
- JPEG 清理 EXIF/XMP、IPTC 和 Comment，同时保留颜色关键的 ICC/Adobe 段；
  PNG 清理 EXIF/文本 Chunk；WebP 清理 EXIF/XMP 并保留 ICC。
- 媒体访问 token 绑定 actor、media、purpose 和过期时间；数据库只保存 storage key。
- 日志只记录 HTTP request ID、方法、无 query 路径、状态、来源和耗时。
- 原图、Base64、token、Cookie、Authorization、用户自由文本和供应商正文不得进入
  日志、事件、Trace 或 AICard。
- 浏览器不分析 after 图，也不持久化 ProductDiscoveryRun 正文、search query、
  bbox、商品 URL 或短时媒体地址；刷新恢复只保存 plan/run 业务 ID。
- 视频圈选只上传用户 bbox 对应的裁剪图，不上传整段视频；后端将裁剪图保存为
  `visual_search_query` 私有媒体。确认 SourceComponent 后，该媒体转为受资产引用的
  长期私有事实；删除资产时沿用 Media binding/ref count 和访问撤销规则。
- 商品发现事件仅允许共享协议列出的稳定 ID、`commerce_action_type` 与
  `source_type`，不得发送 query、bbox、URL、自由文本或 after 图；本地离线 Demo
  不发送事件。
- Agent Plan 专属 Base URL 固定到官方主机，禁止改成中转站；只发送请求内 data
  URL 或 HTTPS 图片，本地路径、`client://` 与私有逻辑引用不会外发。
- Asset 与 Media 使用显式 binding/ref count；删除只物理清理 ref count 归零媒体。
- 删除资产先撤销访问，再清媒体；历史 PlanVersion 保留非媒体事实并投影 redaction。
- EventService 只接受 14 个白名单事件和受控短属性。
- 用户图片不用于模型训练；接入供应方前必须确认其保留策略。

仍有重要安全边界：

- 共享访问口令只保护比赛入口，固定 Demo actor 仍不是多用户身份隔离。
- 公网已有限流、AI 并发上限和总开关，但没有内容安全审核或真实账号审计。
- 非回环监听必须同时配置 `DEMO_ACCESS_CODE` 与至少 32 字节
  `SESSION_SIGNING_SECRET`，否则配置加载直接失败。
- 公网 Cookie 为 `HttpOnly; Secure; SameSite=Lax`；Zeabur 必须通过 HTTPS 提供。

## 8. 本地运行、测试、构建和交付

使用 Node.js `>=22.5`；推荐当前验证过的 Node 24。首次拉取或
`node_modules` 缺失时必须先 `npm.cmd install`。Windows 若拦截
`npm.ps1`，使用 `npm.cmd`。

```powershell
Set-Location 'C:\Users\xbhmd\Desktop\大区赛\ai-corner-renewal'
npm.cmd install
npm.cmd run check
npm.cmd run demo:backend

# 比赛 Agent Skill
& 'C:\Users\xbhmd\.codex\python-envs\default\Scripts\python.exe' `
  'D:\CodexData\.codex\skills\.system\skill-creator\scripts\quick_validate.py' `
  '.\remix-room-from-inspiration'
node .\remix-room-from-inspiration\scripts\validate-renewal-plan.mjs `
  .\remix-room-from-inspiration\assets\example-renewal-plan.json
```

`remix-room-from-inspiration.zip` 必须包含一个顶层
`remix-room-from-inspiration/` 目录，且其中直接存在 `SKILL.md`；压缩包不包含
`.env.local`、数据库、私有媒体、模型权重或用户图片。比赛包使用 ZIP，避免假设
特定客户端私有的 `.skill` 扩展格式。

当前预期：

```text
209 项唯一自动测试（后端、协议与抖音前端）
生成：原木呼吸感，6 件，¥486
调整：高效收纳版 v2，4 件，¥240
持久方案历史：1 个谱系、2 个版本
```

填入本机 Agent Plan Key 后先运行：

```powershell
npm.cmd run check:agent-plan
```

该命令只做一次最多 16 输出 token 的文本鉴权检查，不输出 Key 或模型正文。
2026-07-25 已使用个人版专属 Key 验证成功：网关状态为 `ok`，实际模型为
`doubao-seed-2-0-lite-260215`，本次总计 83 tokens。下一步把 `.env.local` 中
`AI_BACKEND_MODE=auto`、`ROOM_ANALYZER_PROVIDER=agent_plan` 取消注释，并用
data URL/HTTPS 图片验收一次 `source_mode=live`：

```powershell
npm.cmd run check:agent-plan-room
```

2026-07-25 已使用默认演示书桌图验收成功，耗时约 14.5 秒，输出协议合法。可在命令
末尾追加 PNG/JPEG/WebP 路径验证其他已获授权空间图；脚本不得打印图片字节、Key 或
供应商原始正文。

完整 Seedream 闭环验收：

```powershell
npm.cmd run check:agent-plan-image
```

该命令使用项目演示书桌图走真实空间识别和一次主方案生图，把结果临时写入隔离的
私有媒体目录，再通过短时签名 URL 读取并清理临时目录。它会消耗 Agent Plan
燃料值，只输出来源、模型、媒体类型和字节数。

完整 V2.1 首跑基准：

```powershell
npm.cmd run benchmark:first-live
```

固定输入位于 `artifacts/first-live-benchmark/`：真实双屏工作桌
`scene-before.png`、模拟“视频关键帧圈选”的暖白蘑菇灯裁剪图
`component-mushroom-lamp.png`，风格为 `warm`（暖木奶油 × 低饱和樱粉）。脚本会走
组件视觉理解与候选确认、真实 RoomProfile、正式 LayoutPlan/ProductSlot、双图
Seedream、视觉验收和最多一次回炉；成功后把结果图和 `manifest.json` 写回同目录，
并把 Space/SourceComponent/DesignRequest/GenerationRun/PlanVersion 留在当前本地
数据库，便于前端继续查看。该裁剪图是首跑代理素材，不代表前端视频抽帧已经在本次
运行中真实发生；候选仍来自 Demo Catalog，也不能声称是真实抖音 SKU。

这条命令会把空间图、组件裁剪图、派生规划和生成图发送到火山方舟视觉/Seedream
服务并消耗额度，只有在图片与派生数据外发获得明确授权后才能执行。

2026-07-26 在用户明确授权后完成一次真实首跑：组件视觉理解成功识别
`table_lamp`，标签为“蘑菇造型桌面台灯”，置信度 0.95，并确认
`prod-green-mushroom-lamp` 为本地 Demo Catalog 候选。首张 Seedream 图保住双屏和
蘑菇灯，但大量杂物仍在且额外出现夹灯；旧验收错误给出
`clutter_risk=0.10/accepted=true`。该图已人工拒绝并保留为
`artifacts/first-live-benchmark/result-first-rejected.jpg`，对应证据为
`manifest-first-rejected.json`，不得当作合格效果图。

随后已收紧门禁并暂停继续生图：正式 Layout Planner 失败后不再降级生图，后续尝试
均停在 `planning 6/9`，没有新增 Seedream 图片。最后一次安全诊断为
`planning_contract_invalid`，具体字段是
`actions[1].placement 必须是非空字符串`。下一次继续时应先让 LayoutPlan
normalizer 对缺失 placement 做受控默认/修复，或让 Provider 使用更强的结构化输出
约束；当前输出预算已从 2200 提升到 4000 tokens，温度为 0，Prompt 版本为
`layout-planner-v2.1.0`、`render-spec-builder-v2.1.0`、
`render-evaluator-v1.1.0`。用户已要求暂时停止，不能自动继续外部调用。

商品发现视觉 Agent 验收：

```powershell
npm.cmd run check:agent-plan-products
```

该命令默认读取 `apps/web/assets/desk-after-warm.png`，调用
`AgentPlanProductDiscoveryProvider`，只输出 provider/model/prompt 版本、耗时、
识别数量、热点数量、类别和置信度，不输出 Key、图片字节或供应商原始正文。它会把
本地效果图与受限方案上下文发送到火山方舟并消耗一次调用，因此必须在图片授权明确后
执行。2026-07-26 在用户明确授权图片与受限方案上下文外发后完成 Live 验收：
`source_mode=live`、`strategy=image_agent`、provider 为
`volcengine_agent_plan`、模型为 `doubao-seed-2.0-lite`、Prompt 版本为
`product-discovery-agent/1.0`，耗时约 20.4 秒；演示图共识别 5 个可购买元素和
5 个热点，每个元素生成 3 条搜索意图，置信度为 0.98–0.99。脚本未输出 Key、
图片字节或供应商原始正文。自动与 Mock 集成测试也已通过。

默认一键启动当前抖音前端、同源代理和后端：

```powershell
npm.cmd start
```

也可分别启动新版前端或后端；旧兼容页面使用 `start:classic`：

```powershell
npm.cmd run start:douyin-web
npm.cmd run start:backend
npm.cmd run start:classic
```

- 默认抖音前端：`http://127.0.0.1:8765/douyin-static-demo/index.html`
- 兼容 AICard 页面：`http://127.0.0.1:8765/index.html`
- API：`http://127.0.0.1:8787`
- 状态库：`./data/ai-corner-renewal.sqlite`
- 私有媒体：`./data/private-media`

启动器会探测端口：兼容的现有 `8787` 后端会被复用；默认 `8765` 被占时会从
`8766` 起选择空闲前端端口。显式指定的 `WEB_PORT` / `API_PORT` 不会被替换。

本地开发没有前端构建步骤或 `dist`；源码就是静态交付物。生产通过根目录
`Dockerfile` 构建 Node 24 镜像，并由同一个 Node 端口提供正式前端和 API。
候选交付顺序：

1. `npm.cmd run check`
2. `npm.cmd run demo:backend`
3. 启动 API 并检查 `/api/health`
4. 走一遍 `/api/v1` 种子空间 → DesignRequest → run → plan → revision
5. 重启 API，重新读取资产、run 和方案历史
6. 上传/删除一张测试图，确认旧短时 URL 失效
7. 关闭真实 Provider，确认 fallback
8. 以公网变量运行 `npm.cmd run start:production`，验证口令页、401、登录和首页
9. 构建 Docker 镜像（当前 Windows 主机未安装 Docker，需由 Zeabur 首次构建验证）
10. 记录版本、Commit SHA、部署地址和离线源码

未经用户明确要求，不提交、推送、开 PR 或部署。

### 公网部署状态与既定方案

公网比赛部署的唯一执行方案见根目录 `DEPLOYMENT_PLAN.md`。该方案已经冻结为：
Zeabur Server 上的单 Docker 服务、单 HTTPS 域名，正式入口为
`apps/douyin-demo/douyin-static-demo`，Node 同端口提供静态页面和 `/api`，
SQLite 与私有媒体挂载 `/app/data`，真实 Agent Plan / Seedream 只由服务端调用。

代码侧部署能力已经实现：共享口令 HMAC 会话、登录前精简健康检查、API/AI 限流、
并发上限、AI 总开关、安全公网监听门禁、`PORT` 读取、正式前端单端口托管、
`Dockerfile`、`.dockerignore` 和 `/app/data` 路径均已接入。2026-07-26 已用
公网配置在本机临时端口完成烟测：未登录口令页 200、受保护 API 401、登录 200、
带 Cookie 首页 200、SQLite 写入指定数据目录。当前机器没有 Docker CLI，因此
镜像构建仍需由 Zeabur 首次构建验证。

Zeabur 新项目已不能使用旧共享集群，需要购买或绑定 Server；购买按月固定费用并
默认自动续费。目标机型已选 Tencent Hong Kong 2 vCPU / 2 GB / 40 GB，
US$6/月，ZeaburOS。购买与填入真实密钥仍由项目所有者在控制台完成。

### 8.1 V2.1 后端重启验证（2026-07-26）

在基线 `4024b0c` + BE-00～BE-08 实现之上做过一次显式重启验证，未修改代码或
运行配置，只为核对 31 个 API 路径与 5 个 V2.1 feature flag：

- **重启方式**：探测到旧后端 PID 20840 仍占用 `127.0.0.1:8787`，`taskkill /F`
  释放端口后运行 `npm run start:backend` 起当前源码。此后 `curl /api/health`、
  `curl /api/openapi.json` 均返回 HTTP 200。
- **31 个 path template**：`/api/health` + `/api/openapi.json` + 29 条 `/api/v1/**`，
  映射到 OpenAPI 里 38 个 operations（`V1_ROUTE_MANIFEST` 与运行时 OpenAPI 逐条
  对齐）。其中 V2.1 新增 7 条 unique path template / 9 个 operations：
  `confirmInspirationIntent`、`createRelatedDesignRun`、`listRelatedDesignRuns`、
  `getRelatedDesignRun`、`cancelRelatedDesignRun`、`createPublication`、
  `getPublication`、`withdrawPublication`、`createCartIntent`；其余 22 条 unique
  path template / 29 个 operations 为 V1 底座。
- **5 个 V2.1 feature flag**（`/api/health.features`）实机返回值：
  `renewal_intent_v2=true`、`related_designs=true`、`plan_publication=true`、
  `implementation_list_v2=true`、`cart_batch_handoff=false`。真实抖音购物车
  Bridge 未接入，`cart_batch_handoff=false` 与协议 §8 目标一致；接入后
  CommerceHandoffService 的 `hostBridgeAvailable` 与该 flag 才可同时置为
  `true`，此前保持返回 `search_bundle` / `unavailable`。
- **其余原有 3 个 flag**：`product_discovery=true`；
  `product_discovery_live_agent` 按运行配置动态返回（非 Demo + Agent Plan Key
  为 `true`）；`douyin_commerce_catalog=false`。
- 本次验证过程使用的临时 `curl` 落盘目录 `/tmp/` 已进入 `.gitignore`，不进入
  仓库；本轮未运行 `npm.cmd run check` 或改动代码/配置。

## 9. 自动测试覆盖

2026-07-26 最近一次完整 `npm.cmd run check` 覆盖并通过 209 项唯一自动测试，
包含后端、协议与抖音前端 Builder/Adapter/视觉框选/商品发现/状态语义；随后
`check:douyin` 独立重跑 68 项前端测试并再次通过。新增公网部署测试覆盖未登录
口令页、精简健康检查、受保护 API 401、登录 Cookie、正式首页以及 AI 总开关。

- 4 个 JSON Schema 可解析与内部 `$ref`；13 个 V2.1 canonical fixture 逐字段通过
  `platform-v1.schema.json` 与排序/降级/空态断言。
- OpenAPI 3.1 覆盖共享清单中的 41 个 `/api/v1` 操作（原 38 + 视觉搜索新增 3），
  幂等 Header 和所有本地 `$ref` 可解析，生成文件与路由/Schema 一致。
- V2.1 服务测试：InspirationAsset 意图分析 5 项（component/style/needs_confirmation/
  幂等确认/非 inspiration 拒绝）、DesignRequest V2.1 快照 4 项（context_fingerprint、
  换场景、intent_confirmation_required、AI 示例场景只读）、RelatedDesignRun 6 项
  （ready/partial/empty 状态机、one-active 409、cancel、非 V2.1 拒绝、重启恢复、
  未发布 Publication 不召回）、Generation V2.1 3 项（alternatives=[]、
  source_video 全标记、组件意图 video_selected/ai_supplement 门禁）、Publication 5 项
  （save→publish 召回、draft 拒绝、单一未撤下、index_failed 重试、撤下不召回）、
  Implementation list 3 项（排序单调、style 全 source_video、product_id 去重）、
  CartIntent 6 项（search_bundle、篡改 match、非法 list_item、
  ProductDiscoveryRun 未成功拒绝、重复/非法 quantity、部分 rejected）、
  V2.1 HTTP e2e 4 项（意图确认+双 run+发布+实施+购物车、404、Idempotency-Key
  重放/冲突、重启恢复）。
- 旧 45 项 AICard、规则、Live/Fallback、HTTP 和内存 Store 回归。
- Agent Plan 官方主机约束、模型名配置、本地环境优先级、OpenAI 兼容多模态请求、
  稳定 `room_id` 所有权、自由标签到受控区域代码的归一化、本地图片拒绝、401
  脱敏和 fallback。
- Seedream 专属 `/images/generations` 请求体、单图模式、响应上限、Base64/MIME/
  文件签名校验、401 脱敏、失败降级、主方案替换和候选方案不误标 Live。
- 视频圈选裁剪图媒体、视觉身份、目录候选确认、SourceComponent 稳定资产和媒体
  保留测试；商品发现对 `video_selected` 的 Agent 与 plan-grounded 双重排除测试。
- 正式效果图验收测试覆盖服务端阈值不信任模型 `accepted` 字段、第一次不通过后
  只回炉一次、修复指令进入第二次生图，以及只持久化第二次通过的 after 图；另覆盖
  SourceComponent 不进入“补充商品”Prompt。正式 RoomProfile 注入也在管线测试中
  断言进入 `scene_assessment`。
- Prompt 实验台布置规划请求、规划 JSON 边界、非家居 `needs_input` 截止、商品
  槽位到 Seedream 指令编译、非持久声明、输入图片校验、供应方失败安全映射及
  GET/POST/405 路由。
- 真实效果图保存后绑定空间资产、AICard 内部逻辑引用到短时私有 URL 的投影，以及
  私有媒体端点读取。
- `/api/v1` CORS PATCH/DELETE/Idempotency-Key 预检。
- Demo seed、创建幂等重放和 key 冲突。
- 私有 PNG 上传、签名访问、空间解析、draft 封存和删除级联。
- DesignRequest、九阶段 run、首次方案、300→200 预算调整。
- GenerationRun queued 进度、成功 100%、结构化低预算 `needs_input` 与无空方案
  谱系语义。
- 600 元方案换成 `green` 风格、新 PlanVersion 与空间硬约束继承。
- PlanVersion ID/AICard ID 一致、父版本不变、总价不超预算。
- SQLite 关闭重开后方案谱系与两个版本可读。
- Product Discovery 四路 Client、共享 fixture Adapter、ready/partial/empty/failed/
  unavailable/cancelled、四类 CommerceAction、bbox 热点边界和 PlanVersion/context
  迟到响应隔离。
`0.5.1` 另完成一次浏览器回放回归：用已持久化的 Live AICard 模拟
`/api/generate` 响应，不再次调用 Seedream；页面把相对私有媒体地址解析到
`127.0.0.1:8787`，媒体请求返回 200，JPEG 以 `2592×1760` 加载，页面无脚本错误。

尚待补强：

- JPEG/WebP 元数据清理的恶意文件夹具。
- 跨 actor Repository 测试（当前只暴露一个 Demo actor）。
- queued/running 在真实进程强杀后的恢复 E2E。
- 失败 retry 和 Provider 不支持硬取消时的迟到结果竞态。
- 媒体共享 ref count、清理失败和 `deletion_pending` 故障注入。
- 使用 Ajv 2020 对所有响应运行完整 Draft 2020-12 编译。
- 真实 Seedream 限流、超时和供应方 5xx 的长期故障注入与燃料值统计。
- 正式 V2.1 已接 LayoutPlan/ProductSlot 与效果图视觉回炉，但商品检索仍是
  `DemoCommerceCatalogAdapter`；ProductSlot 只是无品牌需求槽位，只有服务端目录
  返回的 SelectedProduct 才能进入 AICard 商品事实。真实抖音商城检索、SKU 选择、
  商品参考图授权和线上评分分布尚未实现。

仓内抖音前端另有：

- `npm.cmd run check:douyin`：68 项 Builder、Asset/Plan/Product Discovery Adapter、
  四路 Client、商品状态/热点/动作、Store 隔离、视觉框选、启动模式和状态语义测试；
- `npm.cmd run check:douyin-integration`：用临时 SQLite 跑通真实图片上传、资产解析封存、
  DesignRequest、GenerationRun 和 PlanVersion，不读写本目录正式 `data`；
- 430×900 Chrome 浏览器实测视频入口、真实 PNG、私有媒体、生成和方案详情均无
  控制台错误。
- 新版 `renewal.html` 另在 1440×900 与 390×844 Chrome 验收：桌面叙事/手机双栏、
  移动端全视口、资产/历史抽屉、方案回填和结果清单展开无横向溢出；占位效果图
  不遮挡操作。
- 温馨风视觉搜索在 1440×900 与 390×844 Chrome 逐步验收框选、查询、候选、
  建模和完成状态；页面无横向溢出或控制台错误，流程关闭后会清理外层主题 class。
- 根目录 `npm.cmd start` 单仓烟雾测试已验证实际自动选择端口后，推荐流与健康
  代理均返回 200。
- 商品发现购买承接已在 390×844、430×900、1440×900 Chrome 验收：三档均无
  横向溢出和控制台错误；真实 plan-grounded + Demo Catalog partial 结果显示
  “方案关联 · Demo 商品”，bbox=null 无热点。共享 ready fixture 注入合法 bbox 后
  显示可键盘聚焦的数字热点并能把焦点送到对应商品元素；reduced motion 生效；
  search_query 可复制且 Toast 正常。新增的 Live 视觉 Agent 证据面板已有自动
  Markup/来源分层测试，尚待下一次浏览器人工验收。
- 成功 ProductDiscoveryRun 刷新只执行 list + get，没有重复 POST；health feature=false
  时不会请求未实现接口或自动切 Demo，用户点击后才进入“本地离线 Demo”。

## 10. 已知限制与下一步

当前一轮优先按 V2.1 并行协议执行：

1. 基线 Commit `4024b0cd3d54bbf07bab9348c158088c96ded21e` 已作为契约基线；后端
   BE-00～BE-08 已完成并通过 `npm.cmd run check` 与 `npm.cmd run openapi:check`。
2. 前端仍需按 `docs/v2-frontend-tasks.md` 实现意图确认、默认收起的"我的"、双 run
   正交状态、保存/发布和按需"实施"；`apps/douyin-demo/**` 可直接消费
   `examples/contracts/renewal-v2/` canonical fixture 与 `/api/v1` 全部 41 条路由。
3. 联调完成后需再次在同一候选 Commit 回归组件/风格、示例/真实场景、换场景迟到响应、
   发布前后召回、实施排序、购物车不可用、Provider 失败和重启恢复；本次后端已经通过
   V2.1 HTTP e2e 覆盖这些场景，联调时以真实前端交互回归为准。
4. `cart_batch_handoff=false` 与真实抖音购物车 Bridge 未接入是本轮已知边界：
   CommerceHandoffService 通过 `search_bundle`/`unavailable` 降级；不得展示"已加入
   购物车"成功态。接入真实宿主 Bridge 时同时把 `hostBridgeAvailable` 置真并把
   `douyin_cart_batch` action 通过健康检查置为 `true`。
5. 真实抖音内容目录与商品目录仍是 Demo：`DemoDouyinContentProvider` 与
   `DemoCommerceCatalogAdapter` 只能声称 `source_mode=fallback`。接入真实
   Provider 时需分别在 `/api/health.features` 单独开关，并保留 fallback 分支。

最优先：

1. 在已接通的抖音宿主前端补齐 Asset 重命名/保存/归档/删除/重试，以及
   PlanRevision、版本切换和 PlanAsset 用户状态；继续只消费协议，不读取
   `services/**`。
2. VisualSearchQuery、候选确认、SourceComponent 媒体引用与删除边界已经实现；
   下一步接真实抖音商品目录，并把当前轻量 `preview_2d_ready` 升级为独立
   ModelGenerationRun/ModelVersion。当前组件视觉输入是真实裁剪图，但商品候选仍
   是明确标注的 Demo Catalog。
3. 继续使用
   已验收的 `auto + agent_plan` RoomProfile，并在界面如实展示
   `source_mode=live/fallback`。
4. 把候选方案和预算调整的效果图改成显式“点击后按需生成”；不要自动一次生成
   三张，也不要把旧主图复用后标成新版本 Live。
5. bbox/mask 接检测与分割专用 API，并保留用户确认，不覆盖 sealed 空间版本；
   再把确认后的编辑区传给 Seedream 提高结构保持。
6. 公网比赛入口已经增加共享口令会话、API/AI 限流、AI 并发上限和总开关；
   `demo-user-001` 仍是共享演示身份。若从比赛演示升级为真实多用户产品，再引入
   账号身份隔离、内容安全、每用户图片配额、审计和备份恢复。

重做风险：

- 前端若继续把 `item/history/scene/removed/aiGenerated/price/score` 当后端字段，
  会形成第三套协议；必须通过 Adapter 映射。
- SQLite + 进程内队列只适合单进程 P0；扩容前要引入有租约的外部队列或
  数据库任务抢占。
- `node:sqlite` 在较旧 Node 不存在，运行环境必须满足 engines。
- 旧 AICard 只能表达聚合 InspirationProfile，完整动态约束以外层
  DesignRequest/PlanVersion snapshot 为准；若前端要求单 DTO 完整承载，发布
  AICard v2，不继续向 v1 塞隐式字段。
- 候选和预算调整中的预生成效果图不能声明商品一一对应；缺尺寸必须继续提示复测。

后续 Backlog：

- 建立至少 30 条有授权来源、尺寸和更新时间的商品目录。
- 引入真实内容检索与向量索引，但保留来源和更新时间。
- 多人家庭、跨设备同步、分享、真实执行反馈和交易均另立对象，不挤进 P0 模型。
