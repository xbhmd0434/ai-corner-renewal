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

后端下一阶段的产品优先级、第一链路完成定义以及 Agent / 确定性代码责任边界，
统一以 `docs/backend-product-handoff.md` 为准。正式 GenerationRun 应从固定方案
模板迁移到 `SceneAssessment → LayoutPlan → ProductSlot → SelectedProduct →
RenderPromptSpec → EvaluationResult`，同时保留现有 `/api/v1` 资产、任务、运行和
方案版本接口。家具与建筑保持不能只依赖 Prompt，必须增加保护区域或严格的生成后
拒绝机制；商品、预算、状态、来源和发布门禁始终由代码拥有。

下一阶段产品重构蓝图见
`docs/raw-to-refined-rearchitecture-plan.md`。该文档把“毛坯 → 精装”定义为
局部空间从未经整理和搭配的原貌到完整软装结果，不扩张为硬装、施工或整屋承诺；
建议默认组合为 `transformation_strength=high` 与
`visual_density=restrained`，以“变化明显但新增克制”解决强反差与不过度繁复之间
的张力。计划保留现有 Asset/SpaceVersion/DesignRequest/GenerationRun/
PlanVersion 底座与 AICard v1 兼容视图，新增 DesignRequest/GenerationRun `1.1`
和 PlanVersion `renewal_manifest`，并把 Prompt Lab 的动态规划能力迁入持久正式
链路。以上均为待实施目标；当前运行行为和 API 成熟度仍以本节下表及“仍未实现”
清单为准。

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
| `apps/web/accessory-studio.html` | 运行时静态 3D MVP | Three.js 双模型试搭；本机混元 GLB、程序化降级、挂点/位姿/多视角、浏览器保存恢复 |
| `apps/web/prompt-lab.html` | 两阶段布置评测原型 | 上传并压缩家居单图、编辑规划 Prompt，后端先规划再调 Seedream；并排预览和下载，实验数据不持久化 |
| `apps/douyin-demo/douyin-static-demo/renewal.html` | 默认可持久联调集成原型 | 单核心卡片承载灵感、空间、约束、生成进度与结果；结果后已接“把这一角搬回家”商品发现与抖音购买/搜索承接；资产/历史为底部抽屉 |
| `/api/generate`、`/api/revise` | 向后兼容 | 请求和 AICard v1 响应不破坏；内部结果已持久化 |
| `/api/v1` | P0 可持久联调版 | 私有媒体、资产、任务、运行、方案版本、偏好和事件可用 |
| 真实模型 | Agent Plan + Seedream + 本机 Hunyuan shape 已验收 | 空间识别、主方案 image-to-image 与 Hunyuan3D-2mini shape-only GLB；候选方案/预算调整不重复生图，3D 纹理未接 |

已实现：

- 固定服务端 Demo actor：`demo-user-001`；客户端不能提交 `owner_id`。
- Node 内置 SQLite Repository、migration v1、WAL、事务和持久幂等记录。
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
- 25 个 `/api/v1` 操作使用 `packages/contracts/src/v1-route-manifest.js` 作为
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
- Agent Plan 专属 OpenAI 兼容网关 RoomProfile 适配器、固定官方 Base URL、低消耗
  鉴权脚本和同协议 fallback。
- Seedream 5.0 Lite 图片编辑适配器：只为首次生成的主方案调用一次，输入原图、
  结构保持约束、摆放规则与商品名；输出校验 Base64、MIME、文件签名、大小和真实
  图片结构后写入私有媒体。
- 独立 Prompt 实验台使用版本化 `layout-agent-v1.2.0` 布置规划模板。模板把
  所有现有家具设为几何锁定对象，禁止规划移动、替换、删除、缩放或重绘家具，
  只允许整理松散小物、移除明确垃圾和在现有空位新增物品；默认采用明显焕新
  强度，以功能、主辅视觉区和氛围三个层次组织通常 3～5 个商品槽位。页面上传
  PNG/JPEG/WebP 后压缩为受限 JPEG，文本视觉模型先输出经过边界校验的
  `LayoutPlan + ProductSlot`，服务端 Builder 再编译 Seedream 指令。非家居场景
  返回 `needs_input`，规划失败不会继续消耗图片调用；成功后返回规划、商品槽位、
  模型、耗时和图片。该路径不创建媒体、资产、任务或方案版本。
- 空间识别来源与效果图来源在 Web 分开显示；图片失败只降级效果图，结构化方案
  继续返回。
- Web 会把后端返回的 `/api/v1/media/...` 私有媒体相对地址解析到 API
  `8787`，而不是错误请求 Web 静态端口 `8765`；这是 `0.5.1` 的破图修复。
- Web 图片压缩、真实生成、AICard 映射、来源证据、结构化错误、重新生成和
  `revise(300)`。
- 独立 3D 试搭实验室：包与挂件始终为两个资产；支持资产切换、三个挂点、拖拽、
  X/Y 微调、旋转、缩放、立体/正面/右侧/背面视角和视觉适配提示。
- 试搭方案通过 `localStorage` 保存 `baseModelId + attachmentModelId + anchorId +
  transform + view`；保存后替换模型仍可恢复，重置不删除上次保存。
- 恢复 3D 试搭时会校验 schema、视角、挂点、三维变换和缩放范围；保存记录引用
  的本地 GLB 已不存在时，保留合法摆放状态并明确回退为演示模型，避免空场景或
  无效变换污染当前状态。
- 浏览器可直接读取本地 GLB 且不上传，当前视角可导出 PNG。仓库内若存在
  `apps/web/assets/models/little-blue-whale-v1-shape.glb`，页面默认加载本机混元
  样例；缺失或加载失败时明确降级为程序化小蓝鲸。
- 本机 Hunyuan3D-2mini 适配器使用独立
  `D:\LittleBlueWhale3D\.venv-hunyuan3d` 与离线缓存，不污染项目通用 Python；
  已完成 3.8 GB 权重装载和生成命令 `--dry-run` 验收。
- Agent Plan 自由文本可见标签到稳定空间/区域代码的保守归一化。
- 抖音前端 67 项自动测试、后端/协议/3D 自动测试、真实 Seedream 闭环检查与
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
- 3D 图片生成还不是 Web 后台任务：网页只做输入说明和本地 GLB 导入，真实生成
  通过 `npm.cmd run generate:3d` 执行。生成队列、进度、取消、失败重试、模型
  元数据和 Composition 尚未进入 SQLite `/api/v1`。
- 当前包模型是程序化演示几何；混元挂件是 shape-only、无纹理样例。视觉提示不是
  物理适配结论，尚无厘米级尺寸校准、软包形变、碰撞、挂件承重或 AR。
- 没有真实账号鉴权、限流、公网上传滥用防护、多租户或多人家庭。
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

3D 试搭当前是前端 MVP 对象，不应伪装成已持久化后端模型：

```text
BaseModel（包，独立）
AttachmentModel（挂件，独立）
  → Composition v1
      baseModelId
      attachmentModelId
      anchorId
      transform(position / rotation / scale)
      view
      savedAt
```

`apps/web/data/accessory-demo-data.js` 是当前演示身份、推荐挂点和默认组合的事实源；
`room-remix-accessory-composition-v1` 是浏览器保存键。Composition 不保存合并网格，
也不复制 GLB。生产演进对象应为：

```text
CaptureSet
  → ModelGenerationRun
    → ModelVersion(GLB 引用、bounds、dimensions、anchors、source/provenance)
      → CompositionAsset
        → CompositionVersion(两个 ModelVersion 引用 + transform + view)
```

上面第二组只是明确的目标模型，当前 Repository、migration 和 `/api/v1` 尚未实现，
接入时不得直接把大体积 GLB 或图片 Base64 塞进 SQLite JSON。

Prompt 实验台是明确的非持久评测对象，不加入上述方案谱系：

```text
PromptTemplate（稳定版本 layout-agent-v1.2.0）
+ BrowserSourceImage（一次页面会话）
+ PromptDraft（localStorage，仅文本）
→ LayoutPlan + ProductSlot（文本视觉模型、仅当前响应）
→ RenderPromptSpec（确定性 Builder）
→ PromptLabRun（Seedream 同步调用，不入库）
→ BrowserResultImage（一次页面会话，可手动下载）
```

更换原图会清空旧结果；修改 Prompt 后旧结果标为 stale，重新生成成功才成为当前
结果。刷新后原图与结果清空，Prompt 文本可从浏览器恢复。不存在 Apply/Cancel、
服务端历史或重启恢复；这与正式 `GenerationRun/PlanVersion` 有意隔离。

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
- 3D 前端：`accessory-demo-data.js` 拥有演示资产和挂点；
  `accessory-studio.js` 拥有 Three.js 场景、预览态和 Composition 本地序列化。
- Hunyuan 适配器：`generate-hunyuan-shape.py` 只负责图片到 shape-only GLB，
  不拥有用户、资产、授权、挂点或 Composition 业务状态。

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

3D 试搭前端状态：

```text
default / restored
  → 替换包或挂件、选挂点、拖动、旋转、缩放、切视角
  → dirty preview
  → save → localStorage saved

dirty preview → reset → default（已保存版本仍在）
dirty preview → restore → last saved
```

- 载入 `.glb` 是浏览器会话内资产；浏览器不会把文件上传或持久化二进制。刷新后
  自定义 GLB 需要用户重新选择，当前保存恢复只保证内置稳定模型 ID。
- 自动混元样例与程序化降级共享 `charm-whale-01` 业务身份，但
  `renderSource` 必须说明本次究竟显示本机 GLB 还是演示几何。
- 图片生成当前状态只到“前端校验完成/给出本机命令”；没有伪造 queued/running/
  completed。后续接后端时必须为 `ModelGenerationRun` 增加真实队列状态、取消、
  失败重试和重启恢复。
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
- `src/v1-route-manifest.js`：38 个 `/api/v1` 操作（V1 底座 29 + V2.1 新增 9）的方法、
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
- `src/services/asset-service.js`：资产、匹配、解析任务、空间版本、删除。
- `src/services/design-service.js`：Preference 与不可变 DesignRequest。
- `src/services/plan-service.js`：GenerationRun、现有 Workflow、方案谱系、调整和
  旧接口持久兼容。V2.1 分支只输出主效果图并计算 `implementation_source_roles`。
- `src/services/related-design-service.js`：V2.1 独立 RelatedDesignRun 状态机、
  DemoDouyin 与 LocalPublication 双 Provider、迟到运行按 context_fingerprint 丢弃。
- `src/services/publication-service.js`：V2.1 Publication 不可变发布对象、
  异步本地索引、`index_failed` 重试与撤下语义；不复制私有渲染到公开索引。
- `src/services/commerce-handoff-service.js`：V2.1 CartIntent 校验、宿主 Bridge
  未接入时降级 search_bundle，token 短时 opaque。
- `src/services/event-service.js`：白名单、最小化事件。
- `src/services/prompt-lab-service.js`：实验请求、Prompt/图片校验、非持久结果和
  两阶段编排、安全错误映射；规划不是 `ready` 时不能调用图片模型，也不能写
  Repository 或 MediaService。
- `src/workflow.js`：已有确定性生成内核；不能再复制第二套工作流。
- `src/adapters/room-analyzer.js`：RoomProfile Agent Plan 直连与自有 HTTP 网关；
  稳定身份/用户确认尺寸不交给模型，响应必须过同一协议校验。
- `src/adapters/layout-planner.js`：Prompt 实验台的文本视觉布置规划；限制 1～8
  个动作和最多 5 个商品槽位，拒绝超大、非法或缺字段的模型 JSON。
- `src/adapters/asset-understanding.js`：当前确定性解析 adapter。
- `src/adapters/render-generator.js`：正式主方案与 Prompt 实验台共用 Seedream
  请求、响应上限、图片签名和供应方错误分类；实验台使用独立包装，不改变 AICard。
- `src/prompts/prompt-lab-default.js`：布置 Agent 模板、版本与确定性
  `LayoutPlan → RenderPromptSpec` Builder 的事实源。
- `docs/first-workflow-prompt-engineering-handoff.md`：第一链路完整 Prompt 工程
  主交接入口，覆盖场景准入、布置规划、商品槽位、真实商品约束、生图、评测、
  返修及迁入正式 `/api/generate` 的顺序。
- `docs/backend-product-handoff.md`：从当前抖音前端和产品闭环出发的后端正式
  交接，定义本轮 P0、Agent/代码边界、正式 GenerationRun 阶段、接口承诺和产品
  验收标准；后端排期与联调优先读取本文。
- `docs/sensitive-bundle-manifest.md`：完整敏感交接包的包含范围、不可恢复响应和
  Key/用户图片/数据库的传输安全说明。
- `src/adapters/model-ports.js`：真实模型/精细 API 的空端口和能力说明。
- `test/v1-platform.test.js`：CORS、幂等、媒体、空间封存、生成、调整和重启。

### 前端与示例

- `apps/web/index.html`、`styles.css`、`app.js`：空间焕新兼容 AICard 页面；右上角
  进入 3D 试搭页。
- `apps/web/accessory-studio.html`、`.css`、`.js`：独立 Three.js 3D 编辑器；
  负责场景、双模型、GLB 导入、挂点/位姿、视角、PNG 导出和 Composition
  `localStorage`。
- `apps/web/prompt-lab.html`、`.css`、`.js`：独立 Prompt 评测页；管理空、图片
  准备、就绪、生成中、成功、失败和 stale 结果状态。只把 Prompt 文本写入
  `localStorage`，图片不写入浏览器持久存储。
- `apps/web/data/accessory-demo-data.js`：3D 演示资产、挂点、视角和默认
  Composition；新增模型身份或挂点先改这里并补测试。
- `apps/web/assets/models/`：浏览器预览 GLB 的本地交接目录；二进制被 Git 忽略，
  `README.md` 保留使用边界。
- `scripts/serve.mjs`：静态 Web、`/vendor/three/*` 本地模块映射和只读
  `/api/runtime/hunyuan` 运行状态；它不是业务后端。
- `scripts/run-hunyuan.mjs`：定位专用 Python 并转发 CLI 参数。
- `scripts/generate-hunyuan-shape.py`：Hunyuan3D-2mini 离线 shape-only GLB
  适配器；默认 30 steps、guidance 5、octree 192、200000 chunks。
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
  候选选择、轻量建模与完成页；`api/visual-search-client.js` 负责能力发现和拟议
  `/api/v1/visual-search/**`，未启用时不上传查询图。
- `apps/douyin-demo/HANDOFF.md`：前端对象边界、页面状态、运行方式、
  已实现范围和分阶段验收事实源。
- `examples/run-backend-demo.mjs`：使用临时 SQLite 验证旧兼容结果进入持久历史。
- `examples/aicard.demo.json`：AICard v1 稳定渲染夹具。

## 5. HTTP API 与兼容策略

保留：

```text
GET  /api/health
GET  /api/openapi.json
POST /api/generate
POST /api/revise
```

本地 Prompt 评测接口：

```text
GET  /api/prompt-lab
POST /api/prompt-lab/render
```

GET 返回布置 Agent Prompt、版本、规划/生图模型、管线、限制和隐私声明。POST
复核 Prompt、Data URL、Base64、MIME、图片签名和大小后，先调用文本视觉规划；
只有合法 `ready` 方案才编译并调用 Seedream。成功响应中的 `layout_plan`、
`product_slots` 和结果 Data URL
只发回当前浏览器。该接口不是 `/api/v1` 生产契约，不持久化、不幂等、不创建
领域对象；每次 POST 消耗一次规划调用，且只有规划通过时才消耗图片额度。

已实现 `/api/v1`：

```text
POST/GET/DELETE  /api/v1/media...
POST/GET/PATCH/DELETE /api/v1/assets...
POST/GET/PATCH   /api/v1/assets/{space}/versions...
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
`docs/model-integration.md`；视频视觉搜索拟议契约见
`docs/visual-search-api.md`。后端实现前，`/api/v1/visual-search/**` 不属于已实现
接口列表。

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
  文件、38 个操作、幂等 Header、Schema 引用和示例不漂移。

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
| `AGENT_PLAN_LAYOUT_TIMEOUT_MS` | `90000` | 两阶段实验台布置规划独立超时 |
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
| `HUNYUAN_PYTHON` | `D:\LittleBlueWhale3D\.venv-hunyuan3d\Scripts\python.exe` | 专用 GPU Python；只由本地生成命令使用 |
| `HUNYUAN_CACHE_DIR` | `D:\LittleBlueWhale3D\.model-cache` | Hunyuan3D-2mini Hugging Face 离线模型缓存 |

`ASSET_UNDERSTANDING_*`、`PLANNING_AGENT_*`、`RENDER_EDIT_*` 和
`SEGMENTATION_*` 是故意留空的接入位，当前代码不会仅因写入 URL 就宣称能力
可用。具体模型建议、输入输出和验收门见 `docs/model-integration.md`。

`.env`、`.env.local`、数据库、WAL、上传媒体和密钥不能提交；`.gitignore`
已忽略 `.env*`（保留模板）和 `data/`。

Three.js 是当前唯一前端运行依赖，固定为 `three@0.180.0`。`serve.mjs` 仅把
`node_modules/three` 映射到 `/vendor/three/`，浏览器不依赖 CDN；修改版本后必须
重新执行桌面/移动端 WebGL 验收。Hunyuan 的 torch、CUDA、Pillow 和 `hy3dgen`
继续留在专用 venv，不得安装进 Codex 全局 Python 或 Node 项目。

## 7. 数据、隐私与安全

- SQLite 保存 owner、稳定 ID、状态、版本、时间和 JSON 类型快照。
- 数据库 migration 版本是 1；启动自动验证并创建 Demo actor/seed。
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
- 商品发现事件仅允许共享协议列出的稳定 ID、`commerce_action_type` 与
  `source_type`，不得发送 query、bbox、URL、自由文本或 after 图；本地离线 Demo
  不发送事件。
- Prompt 实验台的请求图片、编辑 Prompt 和结果 Base64 也不得进入日志、事件、
  Trace、AICard、SQLite 或 `data/private-media`；服务端只记录无 query 的固定路由、
  状态、来源和耗时。结果通过同步 JSON 返回后由浏览器持有。
- Agent Plan 专属 Base URL 固定到官方主机，禁止改成中转站；只发送请求内 data
  URL 或 HTTPS 图片，本地路径、`client://` 与私有逻辑引用不会外发。
- Asset 与 Media 使用显式 binding/ref count；删除只物理清理 ref count 归零媒体。
- 删除资产先撤销访问，再清媒体；历史 PlanVersion 保留非媒体事实并投影 redaction。
- EventService 只接受 14 个白名单事件和受控短属性。
- 用户图片不用于模型训练；接入供应方前必须确认其保留策略。
- 3D 页“载入 GLB”和图片预览使用浏览器 `File`/Blob URL，不上传到 API；页面关闭
  后 Blob URL 失效。`localStorage` 只保存模型 ID 和数字变换，不保存图片或 GLB。
- `generate:3d` 默认设置 `HF_HUB_OFFLINE=1`，只读取本机模型缓存；传
  `--allow-download` 才允许模型库联网。生成 GLB 可能保留用户物体的可识别几何，
  因此默认被 Git 忽略，不能放入公共静态目录作为生产存储。
- 当前本机混元样例复制到静态目录只用于本地验证，生产应将用户图片和生成模型
  迁到私有对象存储、短时签名访问和删除/保留策略下。使用 Hunyuan 权重或第三方
  商品图片做商业交付前必须复核许可证、肖像/商标和素材授权。

仍有重要安全边界：

- 当前固定 Demo actor 不是鉴权。
- 没有限流或内容安全滥用防护。
- 因此 `ORCHESTRATOR_HOST` 必须保持回环；不得直接公网绑定。

## 8. 本地运行、测试、构建和交付

使用 Node.js `>=22.5`；推荐当前验证过的 Node 24。Three.js 是固定第三方依赖，
首次拉取或 `node_modules` 缺失时必须先 `npm.cmd install`。Windows 若拦截
`npm.ps1`，使用 `npm.cmd`。

```powershell
Set-Location 'C:\Users\xbhmd\Desktop\大区赛\ai-corner-renewal'
npm.cmd install
npm.cmd run check
npm.cmd run demo:backend
```

当前预期：

```text
276 项唯一自动测试（208 项后端/协议/3D + 68 项抖音前端）
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
- Prompt 实验台：`http://127.0.0.1:8765/prompt-lab.html`
- 3D 试搭：`http://127.0.0.1:8765/accessory-studio.html`
- API：`http://127.0.0.1:8787`
- 状态库：`./data/ai-corner-renewal.sqlite`
- 私有媒体：`./data/private-media`

启动器会探测端口：兼容的现有 `8787` 后端会被复用；默认 `8765` 被占时会从
`8766` 起选择空闲前端端口。显式指定的 `WEB_PORT` / `API_PORT` 不会被替换。

本机 Hunyuan3D-2mini 生成：

```powershell
# 只验证输入、输出、专用环境和缓存路径；不加载模型
npm.cmd run generate:3d -- --input .\path\item.png --output .\apps\web\assets\models\item.glb --dry-run

# 真正生成 shape-only GLB；4060 8GB 默认约 2–5 分钟/件
npm.cmd run generate:3d -- --input .\path\item.png --output .\apps\web\assets\models\item.glb
```

- 图片优先透明背景、单物体、完整轮廓；PNG/JPEG/WebP 均可。
- 默认 30 steps、octree 192。显存不足先关闭其他 GPU 应用；仍失败再试
  `--octree-resolution 128 --num-chunks 100000`。
- 首次模型装载实测约 93 秒并占用 3.77 GiB 显存；这是装载时间，不等于完整生成
  时间。shape-only 没有纹理，结果可在 3D 页“载入 GLB”检查。
- 项目不自动安装或更新 Hunyuan 专用环境；其他机器通过 `.env.local`/进程环境
  覆盖 `HUNYUAN_PYTHON` 和 `HUNYUAN_CACHE_DIR`。

没有构建步骤或 `dist`；源码就是交付物。修改后端要重启 API，修改静态页面要
重启 Web。候选交付顺序：

1. `npm.cmd run check`
2. `npm.cmd run demo:backend`
3. 启动 API 并检查 `/api/health`
4. 走一遍 `/api/v1` 种子空间 → DesignRequest → run → plan → revision
5. 重启 API，重新读取资产、run 和方案历史
6. 上传/删除一张测试图，确认旧短时 URL 失效
7. 关闭真实 Provider，确认 fallback
8. 记录版本、Commit SHA、部署地址和离线源码

未经用户明确要求，不提交、推送、开 PR 或部署。

### 公网部署状态与既定方案

公网比赛部署的唯一执行方案见根目录 `DEPLOYMENT_PLAN.md`。该方案已经冻结为：
Zeabur Server 上的单 Docker 服务、单 HTTPS 域名，正式入口为
`apps/douyin-demo/douyin-static-demo`，Node 同端口提供静态页面和 `/api`，
SQLite 与私有媒体挂载 `/app/data`，真实 Agent Plan / Seedream 只由服务端调用，
云端不运行 Hunyuan3D。

这仍是**计划而不是当前实现**。截至 2026-07-26，Zeabur 新项目已不能使用旧共享
集群，需要购买或绑定 Server；购买是按月固定费用并默认自动续费。当前代码仍以固定
Demo actor 运行、没有真实鉴权和限流，而且 `loadConfig()` 会拒绝非回环 host，
因此不得直接公网绑定。部署改造必须在后端并行任务形成稳定 Commit 后单独进行，
先补访问口令会话、AI 限流/总开关、单端口静态托管、`PORT` 读取、Docker 和持久化
重启测试。所有门槛通过前，不购买 Zeabur Server，也不在当前未提交工作区混入部署
代码。

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

`npm.cmd run check` 当前覆盖 276 项唯一自动测试：208 项后端/协议/3D 测试与
68 项抖音前端 Builder、Adapter、视觉框选、商品发现和状态语义测试。根检查随后调用前端专用检查，
额外完成全部前端脚本语法校验。

- 4 个 JSON Schema 可解析与内部 `$ref`；13 个 V2.1 canonical fixture 逐字段通过
  `platform-v1.schema.json` 与排序/降级/空态断言。
- OpenAPI 3.1 覆盖共享清单中的 38 个 `/api/v1` 操作（V1 底座 29 + V2.1 新增 9），
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
- 3D Composition 默认结构只保存双资产引用和变换，不含合并网格。
- 3D 资产/挂点稳定 ID 唯一、默认视角存在、推荐挂点坐标处于编辑范围。

2026-07-25 手工浏览器验收（以下 Prompt 实验台截图证据属于两阶段改造前版本；
当前两阶段版本以自动测试和本地 HTTP 冒烟为准，尚未消耗真实额度重跑）：

- Prompt 实验台 1440×1000：后端显示
  `doubao-seedream-5.0-lite · 可调用`，默认 Prompt 1017 字，测试图压缩为
  1300×882 / 107 KB，按钮进入可用状态；Mock 成功响应显示模型、1.8s 耗时与下载
  入口，页面无控制台错误。390×844 无横向溢出，上传、Prompt、原图、结果依次
  排列。浏览器验收拦截了生成 POST，没有额外消耗燃料值。
- 1440×1000：Three.js/WebGL 初始化成功，本地模块无 CDN，画布 800×678；程序化
  包与本机 5,351,904 字节混元 GLB 同屏，阴影和四个视角正常。
- 花朵挂件 → 提手挂点 → X=0.31 → 110% → 右侧视角保存；切换星星后恢复，模型、
  数值、缩放、视角和保存状态一致。
- 390×844：页面无横向溢出，画布 390×470，原主页“挂件试搭”入口可见且不挤压
  日志按钮。
- `GET /api/runtime/hunyuan` 返回 `ready`，Python、权重和样例三个布尔值均为
  true；`/vendor/three/build/three.module.js` 返回 200、603113 字节。
- `npm.cmd run generate:3d ... --dry-run` 解析到本机专用 Python、离线缓存、30
  steps 和 octree 192；另一次直接离线装载权重成功，GPU 为 RTX 4060 Laptop。

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
- Prompt 实验台当前没有服务端 run 历史、取消、并发配额、内容安全或 A/B 评分
  报告；浏览器中止请求不保证已经发出的供应方调用停止。它只能在回环地址作为
  人工评测工具使用，不能直接公网发布。
- 两阶段布置当前只接入非持久 Prompt 实验台；正式 `/api/generate` 仍使用
  `planTemplates` 与 Demo 商品目录。真实商城检索、SKU 选择及真实商品参考图进入
  Seedream 尚未实现，不能把 `ProductSlot` 当成已存在商品。
- 真实 Hunyuan 单图生成的耗时/峰值显存回归、坏图/透明图/多物体输入和 OOM 故障
  注入；当前只自动测 Composition 数据约束，完整 Three.js 交互仍是手工浏览器验收。

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
- 根目录 `npm.cmd start` 单仓烟雾测试已验证实际自动选择端口后，推荐流、健康
  代理和 `/vendor/three/` 均返回 200。
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
   `examples/contracts/renewal-v2/` canonical fixture 与 `/api/v1` 全部 38 条路由。
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

3D 试搭下一阶段（继续本方向时按顺序）：

1. 在 `/api/v1` 新增 `ModelGenerationRun` 后台任务和 `ModelVersion` 元数据，上传图
   走私有媒体，不让浏览器执行系统命令；验收为创建任务、轮询、取消、失败重试和
   进程重启恢复均可验证。
2. 为包模型增加厘米级 bounds、可编辑挂点和用户确认；为挂件增加 connector 原点。
   先做到同单位、稳定原点和三类包挂点，再谈“适配分数”。
3. 增加 `CompositionAsset/Version` 持久化 API，保存两个 ModelVersion 引用与
   transform；覆盖预览/保存/取消/恢复、换包/换挂件、空组合和旧版本迁移。
4. 对 Hunyuan 输出做网格清理、法线修复、面数压缩和浏览器预算；为商品材质增加
   单独的贴图/材质链路。8 GB 本机不要直接启用官方高显存纹理管线。
5. 最后才接“视频圈选 → 搜同款/全景图 → 生成”。先用明确授权的静态商品图验收
   生成质量、来源和删除闭环，不把搜索结果图片默认视为可存储素材。

最优先：

1. 在已接通的抖音宿主前端补齐 Asset 重命名/保存/归档/删除/重试，以及
   PlanRevision、版本切换和 PlanAsset 用户状态；继续只消费协议，不读取
   `services/**`。
2. 按 `docs/visual-search-api.md` 实现 VisualSearchQuery、候选确认、2D
   ModelGenerationRun/ModelVersion、媒体引用与删除闭环；前端框选和规范化 bbox
   已完成，但当前候选仍是明确标注的本地 Demo。
3. 继续使用
   已验收的 `auto + agent_plan` RoomProfile，并在界面如实展示
   `source_mode=live/fallback`。
4. 把候选方案和预算调整的效果图改成显式“点击后按需生成”；不要自动一次生成
   三张，也不要把旧主图复用后标成新版本 Live。
5. bbox/mask 接检测与分割专用 API，并保留用户确认，不覆盖 sealed 空间版本；
   再把确认后的编辑区传给 Seedream 提高结构保持。
6. 公网前替换固定 actor，增加认证、限流、内容安全、每用户图片配额、审计和备份
   恢复。

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
- 两个 3D 模型不能为了截图方便在领域层合并；合并只可作为明确的导出副本，
  Composition 的事实源始终是双模型引用和变换。
- 当前 94/100 等“视觉适配提示”是可解释演示启发式，不是模型测量或安全结论；
  未接真实尺寸前禁止命名为兼容性评分。
- 5 MB Hunyuan 样例已有约 30 万三角面历史记录；手机端批量展示前必须做 decimate、
  LOD/懒加载和显存预算，不能把单模型流畅等同于橱窗列表可扩展。

后续 Backlog：

- 建立至少 30 条有授权来源、尺寸和更新时间的商品目录。
- 引入真实内容检索与向量索引，但保留来源和更新时间。
- 多人家庭、跨设备同步、分享、真实执行反馈和交易均另立对象，不挤进 P0 模型。
