# 「搬进我家」V2.1 前端任务书

> 前置协议：`v2-parallel-development-contract.md`
> 工作目录：`apps/douyin-demo/douyin-static-demo`
> 目标成熟度：可持久联调的移动优先 P0，不是生产版抖音宿主
> 产品范围：根目录最新 V2.1 方案 FR-01～FR-19 中的 P0

## 1. 前端责任和禁区

前端负责核心卡片、交互状态、API 编排、Adapter、恢复、可访问性和来源表达。前端不
拥有商品事实、相关设计排序、发布权限、对象 ID、状态机推进或“同款”判断。

并行期间只修改：

```text
apps/douyin-demo/douyin-static-demo/**
apps/douyin-demo/tests/**
apps/douyin-demo/package.json（仅确有新增前端测试脚本时）
apps/douyin-demo/HANDOFF.md（由集成阶段统一处理更佳）
```

不要修改 `services/**`、`packages/contracts/**`、`docs/openapi.yaml`、根
`package.json` 或 lockfile。协议字段缺失时用 canonical fixture 阻塞该能力，不在
前端猜后端字段。

## 2. 目标前端模型

Store 至少拆成以下正交 slice：

```js
{
  entry: {
    inspirationAssetId,
    parseState,
    intentAnalysis,
    confirmedIntent
  },
  designContext: {
    epoch,
    designRequestId,
    selectedScene,
    selectedSpaceVersionId
  },
  generation: {},
  relatedDesigns: {},
  currentPlan: {},
  publication: {},
  implementation: {},
  ui: {
    mineExpanded,
    implementationSheetOpen,
    focusedHotspotId,
    toast
  }
}
```

不要继续用一个 `coreState` 表示所有子能力。`generation`、`relatedDesigns`、
`publication` 和 `implementation` 必须独立失败、恢复和重试。

## 3. 工作包

### FE-00：锁定基线和契约夹具

依赖：集成负责人给出包含当前 Product Discovery 改动的基线 Commit SHA。

任务：

- 记录实际基线 SHA、Node 版本、前端端口和后端端口；
- 读取 canonical fixture，不复制一份前端私有协议；
- 为五个新增能力写 feature flag 路由；
- 建立 API DTO → ViewModel 的 Adapter 入口。

验收：

- 后端完全关闭时，页面可选择使用“协议演示数据”，并持续显示 Demo；
- feature=false 时不请求不存在的接口；
- 当前 67 项前端测试在开始开发前仍通过。

### FE-01：视频入口与意图确认

覆盖：FR-01、FR-02、FR-03。

任务：

- 保留现有暂停、定帧、框选和最小面积校验；
- 创建/恢复 InspirationAsset，展示 `parsing / needs_confirmation / ready / failed`；
- 分开组件意图和风格意图 ViewModel；
- 不确定时显示两个候选，用户一次确认；
- 纠正后调用 intent confirmation，不在本地改写 Agent 结果；
- 进入卡片时携带 `inspirationAssetId` 与 confirmed intent。

必须覆盖：

- 组件确认、风格确认、用户纠正、圈选太小、图片模糊、解析失败、重试、迟到解析；
- 来源视频缩略图、时间点和一句摘要；
- 相关帖子二次识别回流时复用最近场景，但仍创建新的 DesignRequest。

完成标准：

- 未确认意图不能开始生成；
- 组件和风格的主意图在 Store 中互斥；
- 页面刷新只恢复业务 ID，不保存原帧 Base64 或短时 URL。

### FE-02：核心卡片和“我的”

覆盖：FR-04～FR-07。

任务：

- 按“识别内容条 → 当前场景条 → 我的 → 效果图 → 结果动作 → 相关设计”排版；
- “我的”默认收起，点击同一入口展开/收起；
- 在展开区分场景资产与收藏组件；P0 以场景切换为主；
- 没有用户场景时显示明确标注的 AI 示例场景和“上传我的场景”；
- 选择新场景后自动收起，更新场景条并触发换场景流程；
- 真实上传沿用 Media → Asset → sealed SpaceVersion。

组合矩阵：

| 场景 | 灵感 | 结果 |
| --- | --- | --- |
| AI 示例 | 组件 | 可生成，持续提示上传真实场景 |
| AI 示例 | 风格 | 可生成，持续提示上传真实场景 |
| 用户场景 | 组件 | 正常 |
| 用户场景 | 风格 | 正常 |
| 场景解析中/失败 | 任意 | 禁止拿旧版本生成，提供恢复 |
| 空资产列表 | 任意 | 示例场景兜底，不出现空白页 |

完成标准：

- 390×844 首屏只突出灵感、场景、效果图位置和唯一主操作；
- 示例场景不显示成“我的上传”；
- 上传、取消、保存、刷新恢复均无脏预览 URL。

### FE-03：设计上下文与双 run 并发

覆盖：FR-07～FR-10。

任务：

- 用 confirmed InspirationAsset + sealed SpaceVersion 创建 DesignRequest；
- P0 请求固定 `constraints={}`，不显示预算、宠物、不打孔和手动风格控制；
- 成功创建请求后，并发创建 GenerationRun 和 RelatedDesignRun；
- 为每次场景/意图组合创建 `design_context_epoch`；
- 所有异步写回同时校验 epoch、design_request_id 和对应 run ID；
- Generation 和 Related Design 分开轮询、分开停止、分开重试；
- 页面隐藏时暂停 UI 轮询，恢复可见立即 GET。

完成标准：

- Related Design 先成功时可先展示，Generation 继续运行；
- 任一 run 失败不会把另一方结果清空；
- 快速连续切换两次场景，两个旧响应都不能覆盖当前卡片；
- 网络断开重连只恢复旧 run，不自动 POST 第二个 initial。

### FE-04：效果图、保存和发布

覆盖：FR-09、FR-12。

任务：

- 效果图为页面主视觉，持续标注“AI 效果示意”和真实 source mode；
- PlanAsset 默认是 draft；点击保存时用 `resource_version` PATCH 为 saved；
- 保存成功才显示“一键发布”；
- 发布前提供封面、标题和来源说明预览；
- 发布调用 Publication API，展示 indexing/published/index_failed；
- `publication_already_exists` 打开已有发布，不重复发帖；
- 保存失败、索引失败、撤下分别处理。

完成标准：

- “保存”与“发布”是两个明确动作，不能一个按钮同时完成；
- 未点击发布的方案不会出现“公开”文案；
- `index_failed` 时私人保存状态仍为成功；
- 切换历史 PlanVersion 时 Publication 状态按版本隔离。

### FE-05：相关设计双来源内容流

覆盖：FR-10、FR-11、FR-13、FR-14。

任务：

- 同一列表展示 `douyin` 与 `user_publication`，卡片必须有来源标签；
- 只显示后端返回的 `reason_labels`，不在前端重新推断推荐理由；
- 单路降级显示真实降级原因；
- ready/partial/empty/failed/cancelled 分别有视图；
- 通过 `open_action` 打开抖音内容或内部 Publication；
- 打开内容后的圈选重新进入 FE-01，不丢用户场景资产。

完成标准：

- 两种来源均能由 fixture 验收；
- `open_action=unavailable` 不拼 URL；
- 空结果不使用通用“网络错误”文案；
- 相关设计卡片不抢占效果图主视觉。

### FE-06：“实施”底部整套清单

覆盖：FR-15～FR-19。

任务：

- “实施”是效果图区域唯一主按钮；
- 只有点击“实施”才 list/get/create ProductDiscoveryRun；
- 底部面板默认展示整套 `implementation_list`；
- 按后端 `sort_group + sort_index` 展示，不在前端自行改来源顺序；
- 显示视频圈选/原视频商品/AI 方案补充、数量、位置、匹配类型和参考总价；
- 支持取消勾选、切换后端给出的替代 match、查看单品；
- 一键加入调用 CartIntent，再根据 action 交给宿主 Bridge；
- `cart_batch_handoff=false` 时只保留逐项 CommerceAction。

完成标准：

- 组件意图 fixture 的圈选组件固定第 1 项；
- 风格意图 fixture 的原视频商品排在 AI 补充之前；
- 重复商品合并数量由后端结果体现，前端不二次合并；
- CartIntent 失败或不可用时绝不显示“已加入购物车”；
- 关闭面板不取消服务端 run，再打开可恢复。

### FE-07：恢复、可访问性、事件和回归

覆盖：完整 P0。

任务：

- sessionStorage 只保存协议列出的业务 ID；
- 为按钮、抽屉、底部面板、热点和状态区补语义、焦点返回和键盘路径；
- 支持 `prefers-reduced-motion`；
- 对 390×844、430×900、1440×900 做视觉回归；
- 事件只提交白名单 ID 与枚举；本地 fixture 不发 Live 事件；
- 清理旧 V1 页面中会误导用户的预算/约束入口和商品发现自动启动。

完成标准：

- 刷新、后端重启、网络断开、快速换场景和浏览器后退均可恢复；
- 无横向溢出、无控制台错误、无未处理 Promise；
- 屏幕阅读器能分辨 Demo/Fallback/Live、AI 示例场景和私人/公开状态；
- `npm.cmd run check:douyin` 与集成检查通过。

## 4. 前端建议文件边界

```text
renewal/
├─ renewal-store.js                 # 只保存领域/UI 状态
├─ design-context-controller.js     # epoch、双 run、恢复
├─ publication-controller.js
├─ implementation-controller.js
├─ components/
│  ├─ inspiration-context.js
│  ├─ mine-panel.js
│  ├─ result-section.js
│  ├─ related-designs.js
│  └─ implementation-sheet.js
api/
├─ v1-client.js
├─ related-design-client.js
├─ publication-client.js
└─ product-discovery-client.js
adapters/
├─ inspiration-intent-view-model.js
├─ related-design-view-model.js
├─ publication-view-model.js
└─ implementation-list-view-model.js
```

不要求机械重命名现有文件；关键是 Controller 不渲染、组件不读原始 DTO、Store 不
拥有后端规则。

## 5. 前端交付物

- V2.1 核心卡片及全部状态；
- 四类新 API Client 与 Adapter；
- canonical fixture 驱动测试；
- 场景切换迟到响应回归；
- 组件/风格、真实/示例场景、双来源相关设计和实施清单测试；
- 移动/桌面浏览器验收记录；
- 前端 HANDOFF 中的当前行为、状态模型、恢复方式、测试和限制更新。

## 6. 可复制给前端开发对话的任务

> 基于已冻结的 `docs/v2-parallel-development-contract.md` 和当前基线 Commit，
> 完成 `docs/v2-frontend-tasks.md` 的 FE-00～FE-07。只修改
> `apps/douyin-demo/**`，所有后端 DTO 必须经过 Client + Adapter；用 canonical
> fixtures 完成独立验收。不要修改后端、共享 Schema、OpenAPI、根依赖或 lockfile，
> 不要自行推断商品、排序、发布权限和购买 URL。每完成一个工作包先跑前端测试；最终
> 覆盖 390×844 与 1440×900、刷新恢复、快速换场景迟到响应和所有失败/空状态。
