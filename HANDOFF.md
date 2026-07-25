# AI 一角焕新 · 工程交接

本文是项目的持续工程事实来源。代码、配置、架构、行为、数据边界、构建或发布
流程变化时，必须把变化抽象到对应章节，不能只追加聊天式日志。

## 1. 当前状态与成熟度

当前源码版本为 `0.5.1`，事实源是本仓库；`apps/douyin-demo` 与后端已经进入
同一源码树。仓库外同名副本不再是交付或协作事实源。

| 运行面 | 成熟度 | 当前事实 |
| --- | --- | --- |
| `apps/web` | 运行时 Live 集成原型 | 离线样例/灵感读取 `REMIX_DATA`；完整流程调用 `health/generate/revise` 并展示 LIVE/FALLBACK/DEMO |
| `apps/web/accessory-studio.html` | 运行时静态 3D MVP | Three.js 双模型试搭；本机混元 GLB、程序化降级、挂点/位姿/多视角、浏览器保存恢复 |
| `apps/douyin-demo/douyin-static-demo/renewal.html` | 默认可持久联调集成原型 | 视频/上传入口、资产、空间封存、任务、运行、方案历史和结果已接 `/api/v1`；旧 `me.js` Mock 已退出主路径 |
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
- Agent Plan 专属 OpenAI 兼容网关 RoomProfile 适配器、固定官方 Base URL、低消耗
  鉴权脚本和同协议 fallback。
- Seedream 5.0 Lite 图片编辑适配器：只为首次生成的主方案调用一次，输入原图、
  结构保持约束、摆放规则与商品名；输出校验 Base64、MIME、文件签名、大小和真实
  图片结构后写入私有媒体。
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
- 62 项后端/协议/3D 自动测试、46 项抖音前端测试、真实 Seedream 闭环检查与
  一键可读后端示例。
- 仓内抖音前端已提供同源静态/API 代理和一键启动；前端正式主链路为
  `video context 或 media upload → Asset → sealed SpaceVersion → DesignRequest
  → GenerationRun → PlanVersion`，商品价格和校验结论只读后端字段。

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
```

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

### `packages/contracts`

- `schemas/aicard-v1.schema.json`：前端结果 DTO。
- `schemas/generate-request-v1.schema.json`、`revise-request-v1.schema.json`：
  旧兼容请求。
- `schemas/platform-v1.schema.json`：Media、Asset、SpaceVersion、DesignRequest、
  GenerationRun、PlanVersionEnvelope、Preference、EventBatchResult 聚合协议。
- `src/index.js`：旧协议零依赖运行时断言。

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
  旧接口持久兼容。
- `src/services/event-service.js`：白名单、最小化事件。
- `src/workflow.js`：已有确定性生成内核；不能再复制第二套工作流。
- `src/adapters/room-analyzer.js`：RoomProfile Agent Plan 直连与自有 HTTP 网关；
  稳定身份/用户确认尺寸不交给模型，响应必须过同一协议校验。
- `src/adapters/asset-understanding.js`：当前确定性解析 adapter。
- `src/adapters/model-ports.js`：真实模型/精细 API 的空端口和能力说明。
- `test/v1-platform.test.js`：CORS、幂等、媒体、空间封存、生成、调整和重启。

### 前端与示例

- `apps/web/index.html`、`styles.css`、`app.js`：空间焕新兼容 AICard 页面；右上角
  进入 3D 试搭页。
- `apps/web/accessory-studio.html`、`.css`、`.js`：独立 Three.js 3D 编辑器；
  负责场景、双模型、GLB 导入、挂点/位姿、视角、PNG 导出和 Composition
  `localStorage`。
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
- `apps/douyin-demo/HANDOFF.md`：前端对象边界、页面状态、运行方式、
  已实现范围和分阶段验收事实源。
- `examples/run-backend-demo.mjs`：使用临时 SQLite 验证旧兼容结果进入持久历史。
- `examples/aicard.demo.json`：AICard v1 稳定渲染夹具。

## 5. HTTP API 与兼容策略

保留：

```text
GET  /api/health
POST /api/generate
POST /api/revise
```

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
```

Web 静态服务另有一个只读本机诊断端点：

```text
GET /api/runtime/hunyuan
→ status + engine + profile + pythonReady + weightsReady + sampleReady
```

它只返回布尔能力，不返回本机绝对路径、用户文件或密钥；不要把它混入公开
Orchestrator `/api/v1` 契约。生产模型生成端点尚未实现。

完整路径和字段基线见 `docs/backend-next-phase-handoff.md`；模型边界见
`docs/model-integration.md`。

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
| `AGENT_PLAN_IMAGE_TIMEOUT_MS` | `90000` | Seedream 单次图片请求超时 |
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
108 项唯一自动测试（62 项后端/协议/3D + 46 项抖音前端）
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

## 9. 自动测试覆盖

`npm.cmd run check` 当前覆盖 108 项唯一自动测试：62 项后端/协议/3D 测试与
46 项抖音前端 Builder、Adapter 和状态语义测试。根检查随后调用前端专用检查，
额外完成全部前端脚本语法校验。

- 4 个 JSON Schema 可解析与内部 `$ref`。
- 旧 45 项 AICard、规则、Live/Fallback、HTTP 和内存 Store 回归。
- Agent Plan 官方主机约束、模型名配置、本地环境优先级、OpenAI 兼容多模态请求、
  稳定 `room_id` 所有权、自由标签到受控区域代码的归一化、本地图片拒绝、401
  脱敏和 fallback。
- Seedream 专属 `/images/generations` 请求体、单图模式、响应上限、Base64/MIME/
  文件签名校验、401 脱敏、失败降级、主方案替换和候选方案不误标 Live。
- 真实效果图保存后绑定空间资产、AICard 内部逻辑引用到短时私有 URL 的投影，以及
  私有媒体端点读取。
- `/api/v1` CORS PATCH/DELETE/Idempotency-Key 预检。
- Demo seed、创建幂等重放和 key 冲突。
- 私有 PNG 上传、签名访问、空间解析、draft 封存和删除级联。
- DesignRequest、九阶段 run、首次方案、300→200 预算调整。
- 600 元方案换成 `green` 风格、新 PlanVersion 与空间硬约束继承。
- PlanVersion ID/AICard ID 一致、父版本不变、总价不超预算。
- SQLite 关闭重开后方案谱系与两个版本可读。
- 3D Composition 默认结构只保存双资产引用和变换，不含合并网格。
- 3D 资产/挂点稳定 ID 唯一、默认视角存在、推荐挂点坐标处于编辑范围。

2026-07-25 手工浏览器验收：

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
- 真实 Hunyuan 单图生成的耗时/峰值显存回归、坏图/透明图/多物体输入和 OOM 故障
  注入；当前只自动测 Composition 数据约束，完整 Three.js 交互仍是手工浏览器验收。

仓内抖音前端另有：

- `npm.cmd run check:douyin`：46 项 Builder、Asset/Plan Adapter 和状态语义测试；
- `npm.cmd run check:douyin-integration`：用临时 SQLite 跑通真实图片上传、资产解析封存、
  DesignRequest、GenerationRun 和 PlanVersion，不读写本目录正式 `data`；
- 430×900 Chrome 浏览器实测视频入口、真实 PNG、私有媒体、生成和方案详情均无
  控制台错误。
- 根目录 `npm.cmd start` 单仓烟雾测试已验证实际自动选择端口后，推荐流、健康
  代理和 `/vendor/three/` 均返回 200。

## 10. 已知限制与下一步

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
2. 为视频入口增加用户确认的代表帧和规范化 bbox；当前只保存视频元数据并创建
   temporary Inspiration，不能宣称已提取具体物品。
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
