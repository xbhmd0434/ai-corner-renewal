# 一角焕新 · 第一链路 Prompt 工程总交接

## 1. 产品链路

本交接覆盖“一角焕新”的第一条完整产品链路：

```text
用户不知道这个角落应该如何布置
→ 上传一张真实家居照片
→ Agent 判断场景是否适用、空间用途、现有家具和可编辑区域
→ Agent 制定整理与新增方案
→ 生成可供商城检索的 ProductSlot
→ 检索并选择抖音商城真实商品
→ 将原图、确定方案和真实商品事实交给 Seedream
→ 生成家具布局不变、但具有明显焕新效果的图片
→ 用户查看效果、商品和执行建议
→ 用户购买、调整或重新生成
```

这条链路不依赖灵感参考图。它解决“用户不知道应该怎么布置”的问题。

项目的第二条链路是 3D 物品收藏与试摆，目前用“挂件放到包上”的 Demo 验证，
不在本文交接范围内。

## 2. 当前成熟度与架构差距

当前存在两套尚未统一的实现：

### 正式兼容链路

`POST /api/generate` 当前仍要求 `inspiration_input.style_key`，并使用：

```text
RoomProfile
→ 固定 planTemplates
→ Demo 商品目录
→ 确定性校验
→ Seedream
→ AICard / PlanVersion
```

优点是协议、预算、商品事实、持久化和版本谱系完整；缺点是布置方案不是根据当前
图片动态规划，仍是书桌 Demo 模板，也不符合“无灵感图自动焕新”的目标链路。

### 两阶段 Prompt 实验台

`POST /api/prompt-lab/render` 当前执行：

```text
单张家居图
→ 布置 Agent Prompt
→ LayoutPlan + ProductSlot
→ 规划 JSON 校验
→ RenderPrompt Builder
→ Seedream
→ 临时图片与规划响应
```

优点是已经验证“先规划、再生图”的方向；缺点是不持久化、不接真实商品、不进入
正式 GenerationRun/PlanVersion，也没有完整自动返修和视觉评测。

当前任务不是继续维护两套工作流，而是把实验台验证有效的 Prompt 工程逐步迁入
正式 `/api/generate` 编排，同时保留现有数据、隐私、预算和版本边界。

## 3. 完整 Prompt 工程分层

第一链路至少包含六个相互独立的 Prompt/规则层。不得把所有要求继续堆进一个
Seedream Prompt。

### 3.1 Scene Assessment：场景准入与事实提取

输入：

- 用户家居照片；
- 用户确认的参考尺寸、画质和限制。

输出目标：

- 是否属于住宅或日常家居空间；
- 场景类型和主要用途；
- 建筑固定结构；
- 所有现有家具和功能设备；
- 可整理的松散小物与明确垃圾；
- 可新增物品的真实空位和承重面；
- 门窗、柜门、抽屉、座位、操作面和通道；
- 光照方向；
- 不确定项和必须向用户确认的信息。

当前实现：

- `services/orchestrator/src/adapters/room-analyzer.js`
- 内部函数 `agentPlanPrompt()`
- 输出仍是受限 `RoomProfile v1`，本体偏书桌，ontology 需要泛化。

必须保持：

- 稳定 `room_id` 由后端所有；
- 模型不能估算用户未确认的厘米尺寸；
- 非家居、模糊、局部遮挡和无可靠承重面应返回 `needs_input`；
- 模型只提取事实，不在本阶段决定商品和方案。

建议目标对象：

```text
SceneAssessment
├─ scene_type / primary_function / admissibility
├─ fixed_structures[]
├─ existing_furniture[]
├─ functional_equipment[]
├─ loose_items[]
├─ clear_addition_zones[]
├─ supports[]
├─ clearances[]
├─ lighting
└─ uncertainties[] / needs_confirmation[]
```

### 3.2 Layout Planning：布置决策

输入：

- `SceneAssessment`；
- 用户预算、租房、宠物、保留物和目标；
- 可选的长期偏好。

输出：

- 当前最重要的空间问题；
- 家具几何锁定清单；
- 整理、清理和新增动作；
- 主视觉区与辅助区域；
- 色彩、材质和氛围策略；
- 商品槽位；
- 生图执行所需的完整事实。

当前实现：

- `services/orchestrator/src/prompts/prompt-lab-default.js`
- `PROMPT_LAB_DEFAULT_PROMPT`
- `layout-agent-v1.2.0`
- `services/orchestrator/src/adapters/layout-planner.js`

现有硬边界：

- 现有家具的数量、位置、朝向、轮廓、尺寸、结构、颜色和材质锁定；
- action 只允许 `organize_loose_items`、`remove_trash`、`add`；
- 1～8 个动作，最多 5 个 ProductSlot；
- 非家居或信息不足返回 `needs_input`；
- 规划不合法时不得调用 Seedream。

现有问题：

- “明显焕新、功能/视觉/氛围三层、通常 3～5 个槽位”仍是自然语言软要求；
- 后端只校验动作类型和上限，没有校验审美完整度；
- 未实现规划自动返修；
- 规划仍直接读取原图，没有复用更完整的 SceneAssessment。

### 3.3 ProductSlot：商品需求定义

`ProductSlot` 不是商品，它是检索条件：

```text
slot_id
category
purpose
quantity
size_constraint
color
material
style_keywords
placement
support
clearance_constraints
commerce_search_queries
```

Prompt 只能生成需求，不得生成：

- 品牌；
- SKU；
- 价格；
- 库存；
- 商品链接；
- “抖音同款”等未经检索的结论。

当前实验台已经输出 ProductSlot，但正式 `workflow.js` 仍直接从
`data/demo-catalog.js` 选择固定商品。

### 3.4 Product Retrieval & Grounding：真实商品约束

该阶段原则上不是自由生成 Prompt，而是“检索 + 确定性过滤 + 可选模型排序”：

```text
ProductSlot
→ 商城召回
→ 尺寸/预算/库存/安装/宠物安全硬过滤
→ 视觉与用途排序
→ SelectedProduct
```

真实商品事实必须来自商城接口。模型只能解释匹配理由，不能更改价格、尺寸、库存
或商品身份。

正确生图顺序是：

```text
先定义 ProductSlot
→ 再检索 SelectedProduct
→ 再把真实商品图、尺寸和允许简化的视觉特征交给 Seedream
```

禁止先生成一个虚构家具，再搜索“相似商品”冒充闭环。

当前未接真实抖音商城。`workflow.js`、`demo-catalog.js` 和
`packages/validation` 只验证 Demo 商品事实。

### 3.5 RenderPromptSpec：生图执行

输入：

- 原始家居图；
- SceneAssessment；
- 已通过校验的 LayoutPlan；
- SelectedProduct 事实和授权商品参考图；
- 用户硬约束。

输出：

- 唯一、确定、可追溯的 Seedream 指令。

当前有两套 Builder：

1. `services/orchestrator/src/adapters/render-generator.js` 中的
   `renderPrompt()`，服务正式兼容链路；
2. `services/orchestrator/src/prompts/prompt-lab-default.js` 中的
   `buildLayoutRenderPrompt()`，服务两阶段实验台。

迁入正式链路时应合并为单一 Builder，输入结构化 `RenderPromptSpec`，禁止路由、
前端和 Service 继续拼接第二套字符串。

生图硬规则：

- 原图是不可改动底图；
- 建筑和现有家具几何锁定；
- 只执行已通过规划与商品校验的动作；
- 不得新增计划外物品；
- 新增物必须落在指定空位和承重面；
- 不得阻挡开合、操作、就坐或通行；
- 比例、透视、遮挡、光照、接触阴影和反射一致；
- 放不下就省略低优先级新增物，不能修改原家具强行容纳。

限制：当前 Seedream 调用是整图编辑，没有保护 mask。Prompt 只能语义约束，不能
保证原家具像素级不变。若产品要求“保证”，必须增加家具/结构保护 mask 或局部
图层合成，不能继续只调 Prompt。

### 3.6 Evaluation & Repair：结果评测与返修

必须分别评测规划和图片，不能只看最终图片平均分。

规划硬校验建议：

```text
renewal_strength = visible
coverage_zones >= 2
product_slots = 3～5，除非 space_limited=true
functional/focal/atmosphere 三层均存在
不能全部属于单一收纳类别
重复功能单元必须有整体覆盖策略
家具修改动作必须为 0
```

第一次不合格时允许一次结构化返修：

```text
原始 LayoutPlan + 明确失败项
→ 规划模型只修订失败字段
→ 再次运行确定性校验
```

第二次仍失败则停止，不调用 Seedream。

图片评测至少包含：

- 同一空间与同一机位；
- 家具几何保持；
- 计划执行完整度；
- 计划外新增物；
- 承重、碰撞、尺度和光影；
- 通道与操作区；
- 焕新可见度；
- SelectedProduct 外观一致度。

家具几何破坏、功能不可用、非家居误生成和伪造商品均为硬失败。

## 4. 对象与所有权

建议第一链路使用以下稳定对象：

```text
SpaceAsset / sealed SpaceVersion
→ DesignRequest
→ SceneAssessment
→ LayoutPlan
→ ProductSlot
→ ProductCandidate[]
→ SelectedProduct[]
→ RenderPromptSpec
→ RenderAsset
→ PlanVersion
→ EvaluationResult
```

所有权：

- SceneAssessment 只负责事实；
- LayoutPlan 只负责设计决策；
- ProductSlot 只负责商品需求；
- 商城 Adapter 拥有真实商品事实；
- 确定性代码拥有预算、安全、尺寸、库存和约束校验；
- RenderPrompt Builder 只翻译已确认事实；
- Seedream 只执行，不重新做设计决策；
- Repository/PlanService 拥有持久化、版本、actor 和恢复语义。

Prompt 不得拥有价格、库存、用户身份、媒体权限、状态迁移和真实来源标记。

## 5. 现有代码地图

### Prompt 与模型

| 文件 | 当前职责 |
| --- | --- |
| `services/orchestrator/src/adapters/room-analyzer.js` | RoomProfile 视觉事实提取 Prompt 与 Provider |
| `services/orchestrator/src/adapters/layout-planner.js` | LayoutPlan 文本视觉调用、解析和硬边界 |
| `services/orchestrator/src/prompts/prompt-lab-default.js` | 布置 Prompt、版本、实验台 Render Builder |
| `services/orchestrator/src/adapters/render-generator.js` | 正式/实验台 Seedream 调用与正式 Render Prompt |
| `services/orchestrator/src/services/prompt-lab-service.js` | 非持久两阶段编排 |

### 正式方案与商品

| 文件 | 当前职责 |
| --- | --- |
| `services/orchestrator/src/workflow.js` | RoomProfile、固定方案、Demo 商品、校验和 Seedream 编排 |
| `services/orchestrator/src/data/demo-catalog.js` | 灵感、固定模板、Demo 商品和默认 RoomProfile |
| `services/orchestrator/src/services/plan-service.js` | GenerationRun、PlanAsset/Version 持久化与旧接口桥接 |
| `packages/validation/src/index.js` | 预算、安装、尺寸、库存、宠物和结构化约束 |
| `packages/contracts/src/index.js` | GenerateRequest、RoomProfile、AICard 等协议校验 |

### 配置与接线

| 文件 | 当前职责 |
| --- | --- |
| `services/orchestrator/src/config.js` | 模型、超时、响应和媒体限制 |
| `services/orchestrator/src/platform.js` | Adapter/Service 依赖接线 |
| `services/orchestrator/src/server.js` | HTTP 路由、请求体限制和错误投影 |
| `.env.example` | 非秘密配置示例 |

## 6. 推荐迁移顺序

### Gate 1：冻结结构化协议

先定义 `SceneAssessment`、`LayoutPlan`、`ProductSlot`、
`RenderPromptSpec` 和 `EvaluationResult`。补充夹具和纯校验测试，不调用真实模型。

完成标准：同一输入对象可以稳定构造 Prompt；非法家具动作、伪造商品和不完整方案
被代码拒绝。

### Gate 2：合并场景理解和布置规划

让 Layout Planner 消费 SceneAssessment，而不是再次自由识图；原图只用于核对
可见证据。保留 `needs_input`。

完成标准：非家居、模糊、无承重面和信息不足不会进入商品或生图阶段。

### Gate 3：接 ProductSlot 和 Demo 商品检索

先使用现有 Demo Catalog 验证槽位召回、硬过滤、SelectedProduct 和方案版本。

完成标准：模型不能创造商品事实；所有选中商品通过预算和结构化校验。

### Gate 4：统一 RenderPrompt Builder

删除正式/实验台的双 Builder，使用同一 `RenderPromptSpec`。

完成标准：同一 PlanVersion 可追溯到唯一 Prompt 版本、SelectedProduct 和渲染参数。

### Gate 5：规划返修与视觉评测

增加一次规划返修；建立图片硬失败和人工评分记录。

完成标准：不完整规划不会调用 Seedream；几何破坏不能被美观分掩盖。

### Gate 6：迁入正式 `/api/generate`

将动态规划接入 GenerationRun/PlanVersion，保留兼容 AICard 投影。

完成标准：刷新和重启后方案、商品和图片可恢复；实验台与正式链路不再产生不同
Prompt 语义。

### Gate 7：真实商城与商品参考图

接入抖音商城召回、事实过滤和授权商品图。

完成标准：效果图中的可购买物品可以追溯到 SelectedProduct；未匹配槽位明确标记，
不能伪装可购买。

## 7. 固定评测集

至少使用以下案例：

| 案例 | 规划验收 | 生图验收 |
| --- | --- | --- |
| 宿舍多书桌/床位 | 重复单元整体覆盖，3～5 槽位 | 家具几何不变，明显焕新 |
| 卧室床头 | 照明、收纳、氛围三层 | 床和床头柜不变 |
| 客厅空角 | 主辅视觉区与商品尺寸合理 | 不移动沙发，不堵通道 |
| 杂乱书桌 | 设备与家具保留，只整理松散物 | 操作区连续可用 |
| 小玄关 | 柜门、门口和通道约束明确 | 新增物不越界 |
| 厨房台面 | 水电、热源和操作面约束明确 | 不重绘柜体与设备 |
| 有宠物空间 | 材质和稳定性进入硬过滤 | 不出现有毒/易倾倒物 |
| 低预算 | 槽位缩减有明确优先级 | 不生成未选商品 |
| 非家居教室 | `needs_input` | Seedream 调用数为 0 |
| 无安全空位 | `space_limited` 与证据 | 不强行塞入商品 |
| 模糊/局部图 | `needs_input` | 不调用商品和生图 |
| Provider 超时/非法 JSON | 安全错误与最多一次返修 | 不产生假成功图 |

记录：

- 各阶段 Prompt/Schema/模型版本；
- SceneAssessment、LayoutPlan、SelectedProduct 快照；
- 各阶段耗时、调用次数和失败原因；
- 家具几何保持、功能可用性、计划执行完整度；
- 焕新可见度、物理真实性、商品一致性；
- 是否发生 fallback、返修或省略低优先级商品。

## 8. 隐私、成本与失败语义

- 原图、商品授权图、Prompt、模型原始响应和 Base64 不进入日志或 Trace；
- API Key 只在服务端；
- 规划失败或 `needs_input` 不得调用 Seedream；
- 商品检索失败不得用模型伪造商品；
- 自动返修最多一次；
- 候选方案和预算调整不应自动重复生图，必须用户显式触发；
- 浏览器中止不保证已发出的 Provider 调用停止；
- Live、Fallback 和 Demo 必须按真实来源标记。

## 9. 本地运行与测试

启动：

```powershell
npm.cmd run start:classic
```

实验台：

```text
http://127.0.0.1:8765/prompt-lab.html
```

核心测试：

```powershell
node --test `
  services/orchestrator/test/room-analyzer.test.js `
  services/orchestrator/test/layout-planner.test.js `
  services/orchestrator/test/prompt-lab-service.test.js `
  services/orchestrator/test/render-generator.test.js `
  services/orchestrator/test/workflow.test.js `
  packages/validation/test/validation.test.js `
  packages/contracts/test/contracts.test.js
```

完整回归：

```powershell
npm.cmd run check
```

真实模型测试必须人工单次触发，不做自动批量调用。

## 10. 当前完成标准与下一负责人目标

当前已实现：

- 文本视觉 RoomProfile；
- 非持久两阶段规划 → 生图纵切片；
- 家具几何语义锁定；
- 非家居截止；
- ProductSlot 原型；
- Seedream 安全适配；
- 正式方案/商品/预算/持久化基础设施。

尚未实现：

- 泛化 SceneAssessment；
- 规划审美硬校验和一次自动返修；
- ProductSlot → SelectedProduct 的正式检索；
- 真实抖音商品接口；
- 商品图参与 Seedream；
- 单一 RenderPromptSpec Builder；
- 保护 mask；
- 两阶段能力迁入正式 `/api/generate`；
- 结构化 EvaluationResult。

下一负责人不是只修改一段 Prompt，而是负责第一链路完整 Prompt 工程的协议、版本、
校验、返修和评测。每次 Prompt 变化必须说明影响的对象、模型调用数、失败状态和
固定评测结果，并更新本文和项目根 `HANDOFF.md`。
