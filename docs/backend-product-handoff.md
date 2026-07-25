# AI 一角焕新：后端产品交接与 Agent / 代码责任边界

> 版本：1.0
> 更新日期：2026-07-25
> 面向角色：后端、Agent、视觉生成、前端联调、产品验收
> 当前优先级：第一链路——用户上传真实空间，由系统直接完成整理与焕新方案
> 当前成熟度：可持久联调原型；不是生产级空间设计、商品交易或 3D 重建系统

## 1. 后端本阶段要交付的不是“一个生图接口”

当前产品有两条业务链路：

1. **一角焕新**：用户不知道空间应该怎么布置，拍照后由系统整理、规划并新增家具；
   用户喜欢效果图中的商品后，可以继续进入抖音生态的商品承接。
2. **收藏与试摆**：用户从视频中收藏想要的物品，以 3D 资产进入个人仓库，再放进
   自己的场景。由于通用场景 3D 重建尚不成熟，当前只用“挂件放到包上”验证交互。

本轮后端只把第一链路做成可信闭环。第二链路继续保留 Demo，不得抢占第一链路的
模型、接口和联调资源。

第一链路的产品承诺是：

```text
上传一张真实家居照片
→ 系统理解空间用途、现有物品和可编辑区域
→ 在不改变建筑与现有家具几何的前提下制定布置方案
→ 整理松散物品，并在真实空位新增适量家具或软装
→ 生成“明显焕新”但仍然可信的效果图
→ 展示可追溯商品、预算、摆放说明和风险提示
→ 用户可以降预算、换风格、保存或继续购买
```

后端完成的标准不是“模型返回了一张图片”，而是：

- 原空间、拍摄机位、建筑结构和现有家具仍可识别为同一组对象；
- 新增内容来自一份通过校验的结构化方案；
- 商品事实来自商品库或明确标注的 Demo Catalog，不由模型编造；
- 效果图、商品清单、价格和摆放说明互相一致；
- 刷新或服务重启后，任务、方案、图片和来源仍可恢复；
- 失败时明确停在哪一阶段，不把 Demo、Fallback 或无效图片包装成 Live 成功。

## 2. 当前前端已经向用户表达了什么

正式联调前端是：

```text
apps/douyin-demo/douyin-static-demo/renewal.html
```

它已围绕以下稳定对象运行：

```text
Media
→ SpaceAsset
→ draft / sealed SpaceVersion
→ DesignRequest
→ GenerationRun
→ PlanAsset
→ PlanVersion
→ AICard 结果视图
```

前端当前已经具备：

- 从视频入口或直接上传入口进入同一焕新页面；
- 图片上传、空间资产创建、解析轮询和 SpaceVersion 确认；
- 预算、不打孔、宠物、租房、目标和备注提交；
- GenerationRun 阶段轮询和用户主动取消；
- 前后图、商品、步骤、校验报告和来源展示；
- 方案历史恢复；
- 降预算和换风格创建新 PlanVersion；
- Live、Fallback、Demo 的基础来源表达。

这些能力已经足够承接正式后端，不需要再建一套“Agent 专用页面”或让前端直接调用
多个模型接口。Agent 编排必须留在后端，前端只提交用户意图并消费阶段状态和结果。

当前前端还展示了两个原型能力：

| 能力 | 当前事实 | 后端本轮处理 |
| --- | --- | --- |
| 视频框选搜同款 | 前端框选、候选选择和 ItemAsset 写入已完成；候选仍是明确标注的本地 Demo | P1，不并入本轮第一链路 P0 |
| 包与挂件 3D 试摆 | 静态 Three.js 组合原型；真实模型任务、碰撞和持久 Composition 未接 | 保持 Demo，不作为第一链路完成条件 |

## 3. 当前后端的真实基础与关键差距

### 3.1 已有基础

当前后端已经实现：

- `/api/v1` 私有媒体、资产、空间版本、任务、运行、方案、偏好和事件接口；
- SQLite、稳定 ID、不可变输入快照、幂等、乐观锁和方案版本谱系；
- Agent Plan 空间理解适配器；
- Seedream 图片编辑适配器；
- 预算、不打孔、库存、宠物安全和部分尺寸规则；
- Live、Fallback、Demo 来源标记；
- 非持久 Prompt 实验台中的
  `原图 → LayoutPlan + ProductSlot → Seedream` 两阶段链路；
- Prompt 实验台对现有家具的语义几何锁定、非法动作拦截和非家居截止。

### 3.2 产品主链路仍缺失的部分

当前正式 GenerationRun 与 Prompt 实验台没有统一：

| 环节 | 正式链路现状 | 产品差距 |
| --- | --- | --- |
| 场景理解 | 有 RoomProfile，但 ontology 偏书桌，事实粒度不足 | 不能稳定表达任意家居空间、支撑面、净空和不确定项 |
| 布置规划 | 正式 Workflow 仍以固定方案模板为主 | 不是根据用户当前图片动态设计 |
| ProductSlot | 实验台已输出，正式链路未消费 | 无法先定义需求再检索商品 |
| 商品 | 使用 Demo Catalog 固定事实 | 尚未接真实商城；效果图与可购买商品无法形成真实闭环 |
| Render Prompt | 正式链路与实验台有两套 Builder | 同一方案可能产生不同生图语义 |
| 几何保持 | 主要依赖自然语言 Prompt | 无保护 mask，无法承诺家具形状不变 |
| 结果评测 | 有结构化业务校验，没有正式图片 EvaluationResult | 几何破坏、少加物品或物理错误可能直接展示 |
| 持久化 | 正式任务和方案可持久化 | 实验台的 LayoutPlan、ProductSlot 和评测结果不进入正式谱系 |

因此，后端本轮最重要的工作是把实验台验证有效的动态规划迁入正式 GenerationRun，
并增加保护、商品约束和结果验收，而不是继续堆叠一个更长的 Seedream Prompt。

## 4. Agent 与确定性代码的责任边界

判断原则：

- 需要理解开放世界视觉语义、审美取舍或生成像素的任务，才交给 Agent / 模型；
- 涉及身份、权限、金额、库存、状态、硬约束和可验证规则的任务，必须由代码负责；
- Agent 可以提出候选，不能自行把候选变成事实；
- 所有 Agent 输出先通过 Schema 和代码校验，再进入下一阶段。

### 4.1 刚需 Agent / 模型的环节

| 环节 | 为什么必须使用 Agent / 模型 | Agent 输出 |
| --- | --- | --- |
| 场景语义理解 | 用户上传的是开放场景图片，空间用途、家具功能和松散物品无法靠固定规则穷举 | `SceneAssessment` 候选事实与置信度 |
| 布置与审美规划 | “哪里应该加什么、怎样看起来协调”属于多目标审美决策 | `LayoutPlan + ProductSlot[]` |
| 自然语言目标理解 | 用户可能输入“更温馨但不要太挤”等非结构化要求 | 受限目标标签和待确认项 |
| 商品软排序 | 多个商品都通过硬过滤后，需要比较风格、材质和视觉协调性 | 候选排序与解释；不能改商品事实 |
| 图片编辑生成 | 需要在真实照片中合成新增物、光影、透视和材质 | `RenderAsset` |
| 结果语义评测 | 需要判断是否仍是同一空间、是否明显焕新、计划是否完整执行 | 结构化视觉评测候选 |
| 失败后的规划返修 | 模型方案缺少视觉层次或摆放不完整时，需要在原方案基础上局部修订 | 只修改失败字段的新 LayoutPlan |

“刚需 Agent”不等于“让 Agent 自己决定是否发布”。Agent 只产生受限候选结果，
最终状态由代码根据校验结果推进。

### 4.2 可以用 Agent，但不是 P0 刚需

- 根据用户历史总结长期审美偏好；
- 生成更自然的方案解释、摆放文案和追问；
- 在真实商品候选中做个性化排序；
- 从达人内容中总结教程步骤；
- 对用户反馈做原因归类。

这些能力不得阻塞第一张可信效果图。没有 Agent 时，可以使用固定文案、规则排序或
暂不展示。

### 4.3 必须由代码拥有的环节

| 规则 | 代码职责 |
| --- | --- |
| 文件与媒体 | 类型、真实签名、大小、去元数据、私有存储、短时访问、删除 |
| 身份与权限 | actor、资源所有权、鉴权、访问控制、审计 |
| 状态机 | Asset、SpaceVersion、GenerationRun、PlanVersion 的合法转换 |
| 稳定身份 | 所有业务 ID、版本号、父子谱系和不可变快照 |
| 幂等与并发 | Idempotency-Key、重复请求重放、resource_version 冲突 |
| 用户硬约束 | 预算、不打孔、宠物安全、保留项、编辑区和明确尺寸 |
| 商品事实 | SKU、product_id、标题、价格、库存、尺寸、链接、来源和授权图片 |
| 商品硬过滤 | 预算、库存、安装、尺寸、宠物和类目限制 |
| 布置边界 | 动作白名单、家具不可修改、ProductSlot 数量、支撑面和净空引用 |
| Prompt 编译 | 把已确认结构化事实编译为唯一版本的 RenderPromptSpec |
| 保护区域 | 建筑与家具 mask、可编辑 mask、区域交并和越界判断 |
| Provider 治理 | 超时、重试次数、响应上限、熔断、成本和取消语义 |
| 来源真实性 | Live、Fallback、Demo 和商品来源的判定 |
| 结果门禁 | 哪些校验失败必须拒绝图片，哪些只提示用户复测 |
| AICard 组装 | 从可信领域对象投影前端 DTO，不让模型直接拼最终响应 |
| 日志与指标 | 阶段耗时、错误码、模型版本、Prompt 版本和调用次数；不记录原图和 Key |

### 4.4 必须采用“Agent + 代码”双层的规则

#### 家具与布局保持

- Agent：识别家具语义、轮廓、功能和遮挡关系；
- 代码：为家具分配稳定局部 ID，保存保护区域，禁止规划动作修改这些 ID；
- 图像模型：只在允许区域执行新增；
- 代码与视觉评测模型：生成后比较保护区域，决定通过、返修或拒绝。

仅在 Prompt 中写“不要改变家具”不等于产品上能保证家具不变。若当前图片 Provider
不支持 mask，后端必须选择以下一种诚实方案：

1. 接支持局部编辑 mask 的图片接口；
2. 使用分割、局部生成和合成管线；
3. 保留整图编辑，但生成后执行严格对比，不合格不向用户展示；
4. 在能力未完成前，把文案从“保证不变”降为“尽量保持”，不得虚假承诺。

#### “焕然一新”

- Agent：决定功能层、主视觉层和氛围层分别新增什么；
- 代码：要求至少覆盖两个有效区域，并检查层次是否完整；
- Agent：在空间有限时说明为什么减少新增物；
- 代码：限制新增数量和类目重复，防止只放两个收纳盒或无限堆物。

建议的默认规划门槛：

```text
renewal_strength = visible
2～3 个有效覆盖区域
通常 3～5 个 ProductSlot
至少包含 functional / focal / atmosphere 中的两个层次
家具修改动作 = 0
未计划新增物 = 0
```

这不是要求每张图机械添加五件商品。若安全空位不足，Agent 可以返回
`space_limited=true`，代码接受更少槽位，但必须带可验证原因。

#### 物理合理性

- Agent：识别可能的支撑面、开合关系、通道和操作区；
- 代码：校验新增物必须引用已识别的 support 与 placement zone；
- Agent：对尺度、遮挡和使用场景做语义检查；
- 代码：对已知尺寸、bbox、mask、通道交叉和禁止区做硬判断；
- 尺寸未知时返回 `needs_confirmation`，不能由模型猜厘米数。

## 5. 第一链路的正式后端工作流

前端继续只创建一个 DesignRequest 和一个 GenerationRun。以下阶段由后端内部编排：

```text
1. validate_input
2. assess_scene
3. confirm_constraints
4. plan_layout
5. validate_plan
6. retrieve_products
7. validate_products
8. build_render_spec
9. render_image
10. evaluate_render
11. package_plan
```

### 5.1 `validate_input`

代码完成：

- 校验媒体所有权、SpaceVersion 是否 sealed；
- 校验目标、预算和明确硬约束；
- 判断是否有必要的参考尺寸；
- 冻结 DesignRequest 输入快照；
- 非法输入直接返回结构化 4xx，不调用任何模型。

### 5.2 `assess_scene`

Agent 输入：

- 授权空间图片；
- 用户明确提供的尺寸；
- 不包含商品、预算策略和生图指令。

建议输出：

```text
SceneAssessment
├─ admissibility
├─ scene_type / primary_function
├─ fixed_structures[]
├─ existing_furniture[]
├─ functional_equipment[]
├─ loose_items[]
├─ supports[]
├─ editable_zones[]
├─ protected_zones[]
├─ clearances[]
├─ lighting
└─ uncertainties[] / needs_confirmation[]
```

代码门禁：

- 非家居、图片模糊、遮挡严重、无可靠支撑面时停止；
- 模型不能提供用户未确认的厘米尺寸；
- 每个区域和现有对象必须有本次 SpaceVersion 内稳定 ID；
- SceneAssessment 不做商品和审美决策。

### 5.3 `confirm_constraints`

代码合并约束，优先级固定为：

```text
用户本次明确输入
> sealed SpaceVersion 的确认结果
> 用户长期显式偏好
> Agent 推断
> 系统默认
```

Agent 推断不能覆盖用户明确选择。冲突或关键缺失时，GenerationRun 进入
`needs_input`，返回具体问题；不得一边要求确认，一边继续消费 Seedream。

### 5.4 `plan_layout`

Agent 只读取：

- SceneAssessment；
- 用户目标和硬约束；
- 可选审美偏好；
- 系统规定的动作与槽位 ontology。

允许的动作：

```text
organize_loose_items
remove_confirmed_trash
add_product_slot
```

禁止：

```text
move_existing_furniture
replace_existing_furniture
delete_existing_furniture
resize_existing_furniture
redesign_architecture
```

输出必须是结构化 `LayoutPlan + ProductSlot[]`，不能直接输出 Seedream 自由文本。

### 5.5 `validate_plan`

代码校验：

- 动作只引用 SceneAssessment 中存在的对象和区域；
- 现有家具修改动作数为 0；
- 所有新增物都有 placement、support 和净空约束；
- ProductSlot 类目、数量和覆盖层次满足本轮产品门槛；
- 不能用多个同类收纳盒冒充完整焕新；
- 预算分配区间不超过用户预算；
- 失败时最多允许一次结构化规划返修。

第二次仍不通过则停止，不调用商品或图片模型。

### 5.6 `retrieve_products`

正确顺序：

```text
ProductSlot
→ 商城或 Demo Catalog 召回
→ 代码硬过滤
→ 可选 Agent 软排序
→ SelectedProduct
```

P0 比赛版可以继续使用 Demo Catalog，但必须做到：

- 每个商品有稳定 ID、真实样例图片、价格、尺寸、库存和来源；
- 前端明确标注 Demo 商品；
- 模型不能自行创造品牌、链接、价格或库存；
- 未找到匹配商品时，槽位标记 `unfulfilled`，不能生成虚构商品再伪装可购买。

真实抖音商城接入属于商品闭环完成条件，但不是动态规划、保护区域和图片评测的前置
条件。后端可以先在相同 `ProductCatalog` 接口下使用 Demo Adapter。

### 5.7 `build_render_spec`

后端只保留一个 RenderPrompt Builder。输入为：

- 原始 SpaceVersion 图片；
- SceneAssessment；
- 已通过校验的 LayoutPlan；
- SelectedProduct 与授权商品图；
- protected/editable mask；
- 用户硬约束；
- Prompt、模型和参数版本。

Builder 是确定性代码，不再让前端、路由和不同 Service 分别拼字符串。

生成的 `RenderPromptSpec` 至少能追溯：

```text
prompt_version
scene_assessment_version
layout_plan_version
selected_product_ids
protected_region_ids
editable_region_ids
provider_model
provider_parameters
```

### 5.8 `render_image`

图片模型只负责执行已确定的方案，不得重新选择商品或移动家具。

Provider 调用必须具备：

- 独立于规划模型的超时；
- AbortSignal；
- 响应字节和 MIME 上限；
- Base64、真实文件签名和图片结构校验；
- 单次主方案调用计数；
- 不自动为未打开的候选方案和预算调整重复生图；
- 原图、商品图、完整 Prompt 和供应商正文不进入普通日志。

### 5.9 `evaluate_render`

结果不能直接从 Provider 写入 ready PlanVersion。先产生 `EvaluationResult`：

| 维度 | 失败等级 |
| --- | --- |
| 同一空间和同一机位 | 硬失败 |
| 建筑结构保持 | 硬失败 |
| 现有家具数量、位置、轮廓和结构保持 | 硬失败 |
| 新增物有可信支撑、比例、透视、遮挡和接触阴影 | 硬失败或需确认 |
| 不阻挡门窗、柜门、座位、操作面和通道 | 硬失败 |
| 没有计划外新增物 | 硬失败 |
| LayoutPlan 执行完整度 | 硬失败或返修 |
| SelectedProduct 外观一致度 | 商品闭环下为硬失败 |
| 焕新可见度与整体协调 | 软评分，但低于阈值不能标为推荐方案 |

返修策略：

- 规划不合格：最多返修一次 LayoutPlan；
- 图片仅有局部执行问题：最多返修一次 Render；
- 家具几何或建筑结构被破坏：优先拒绝结果，不用“更美观”抵消硬失败；
- 第二次仍失败：GenerationRun 失败或返回无效果图的结构化方案，不制造假成功图。

### 5.10 `package_plan`

代码把可信对象投影成 PlanVersion 和 AICard：

- 空间诊断；
- 保留项；
- 本次整理和新增动作；
- 效果图；
- SelectedProduct 清单；
- 预算；
- 摆放步骤；
- ValidationReport；
- EvaluationResult 摘要；
- Live、Fallback、Demo 与各数据来源。

模型不能直接输出最终 AICard。

## 6. 数据对象与持久化建议

现有稳定对象继续保留，不为 Prompt 实验随意重建：

```text
SpaceAsset
→ SpaceVersion
→ DesignRequest
→ GenerationRun
→ PlanAsset
→ PlanVersion
```

第一链路新增的中间对象：

| 对象 | P0 持久化建议 | 所有者 |
| --- | --- | --- |
| SceneAssessment | 保存为 GenerationRun 阶段快照，成功后随 PlanVersion 可追溯 | Scene Analyzer + Schema |
| LayoutPlan | 保存不可变快照 | Layout Planner + Plan Validator |
| ProductSlot | 跟随 LayoutPlan 保存 | Layout Planner |
| ProductCandidate | 可只保存入选候选与筛除原因摘要 | Product Catalog |
| SelectedProduct | 必须跟随 PlanVersion 保存商品事实快照 | Product Catalog |
| RenderPromptSpec | 保存版本、输入引用和参数；不保存含隐私的完整拼接正文 | Render Builder |
| RenderAsset | 私有 Media + PlanVersion 引用 | MediaService |
| EvaluationResult | 必须保存，绑定具体 RenderAsset | Evaluator |

P0 不要求立刻为每个对象新建数据库表。可以先使用带 Schema 版本的阶段 JSON 快照，
但必须保证：

- 重启后可以恢复；
- PlanVersion 能追溯到对应快照；
- 不用可变对象覆盖旧方案；
- Prompt 版本、模型版本和来源可查询；
- 原图、Base64、API Key 和供应商原始正文不进入快照。

## 7. 面向当前前端的接口要求

### 7.1 外部接口保持稳定

前端继续使用现有 `/api/v1`：

```text
POST /api/v1/media
POST/PATCH/GET /api/v1/assets...
POST /api/v1/design-requests
POST /api/v1/design-requests/{id}/runs
GET  /api/v1/generation-runs/{id}
POST /api/v1/generation-runs/{id}/cancel
GET  /api/v1/plans...
POST /api/v1/plans/{id}/revisions
PATCH /api/v1/plans/{id}
```

不要增加 `POST /agent/plan`、`POST /seedream` 等前端直连模型接口。内部阶段可以拆成
Service 或队列任务，但对前端仍表现为一个 GenerationRun。

### 7.2 GenerationRun 必须让前端知道的状态

前端需要的不是模型思维过程，而是产品阶段：

```text
input_validation
space_analysis
constraint_resolution
layout_planning
product_matching
rendering
render_validation
packaging
```

轮询响应至少稳定提供：

- `status`、`phase`、`progress`；
- `retryable`；
- `needs_input` 与结构化缺失字段；
- 安全的 `error.code` 和用户可读说明；
- 成功后的 `plan_asset_id`、`plan_version_id`；
- 各阶段真实 `source_mode`，不能在运行开始时提前标为 Live。

### 7.3 PlanVersion 必须支持前端解释结果

结果至少包含：

- 为什么判断当前空间存在这些问题；
- 明确保留了哪些家具与设备；
- 整理了什么、新增了什么；
- 每个新增物摆在哪里、依赖哪个支撑面；
- 商品是否为真实商城、授权样例或 Demo；
- 预算、尺寸和风险校验；
- 图片是否通过几何、物理和一致性评测；
- 哪些信息仍需用户复测；
- 本次版本相对父版本修改了什么。

### 7.4 Revision 边界

当前前端 P0 已有“降预算”和“换风格”。后端必须：

- 创建新的 GenerationRun 和 PlanVersion；
- 父版本继续可读；
- 重新运行商品和预算校验；
- 明确图片是否沿用父版本；
- 没有重新生图时，不能让前端误以为图片已经反映新商品；
- 用户显式要求更新效果图时，才发起新的图片调用。

“替换单个商品”和“只重新生图”可以作为 P1 Revision 类型，不阻塞本轮。

### 7.5 接口文档交付

现有 Markdown 交接足够理解项目，但不够独立联调。后端本轮应补：

- 与实际路由一致的 `openapi.yaml`；
- 每个接口的请求、响应、Header、查询参数和状态码；
- 结构化错误码；
- 幂等与 resource_version 规则；
- 正常、needs_input、fallback、cancelled 和 failed 示例；
- 可导入 Apifox/Postman 的契约；
- CI 校验 OpenAPI 与核心 Schema、路由不漂移。

## 8. 必须覆盖的产品状态

| 状态 | 后端行为 | 前端结果 |
| --- | --- | --- |
| 正常家居图 | 完整运行 | 展示可信方案与效果图 |
| 无灵感参考 | 只使用空间、目标和约束 | 仍可生成，这是第一链路正常入口 |
| 非家居场景 | SceneAssessment 截止 | `needs_input`，不调用商品和图片模型 |
| 模糊或遮挡严重 | 要求补拍 | 保留资产，不显示假方案 |
| 无安全空位 | 返回 `space_limited` | 可以给整理建议，不强行新增家具 |
| 尺寸未知 | 标记复测项 | 方案可预览，但商品适配不能标“已通过” |
| 低预算 | 缩减槽位或追问 | 不生成超预算商品 |
| 商品无匹配 | 保留 unfulfilled slot | 不伪造可购买商品 |
| 规划非法 | 最多一次返修 | 不调用 Seedream |
| 图片破坏家具 | 拒绝或最多一次返修 | 不展示为 ready |
| Provider 超时/限流 | 结构化失败或诚实 fallback | 可以重试，不展示内部正文 |
| 用户取消 | 停止后续阶段 | 进入 cancelled；迟到结果不能覆盖 |
| 页面刷新 | 从 Repository 恢复 | 继续轮询或恢复历史结果 |
| 服务重启 | queued/running 按既定策略恢复 | 不丢失已完成 PlanVersion |
| 预算调整 | 新建子版本 | 父版本仍可切回 |

## 9. P0 验收样例

固定样例不能只保留一张宿舍图。至少覆盖：

1. 宿舍多床位与多书桌；
2. 杂乱书桌；
3. 卧室床头；
4. 客厅空角；
5. 小玄关；
6. 厨房台面；
7. 有宠物空间；
8. 无安全空位；
9. 非家居场景；
10. 模糊、裁切或严重遮挡；
11. 低预算；
12. Provider 超时和非法 JSON。

每个案例记录：

- 输入 SpaceVersion 与明确授权；
- 用户约束；
- SceneAssessment、LayoutPlan、ProductSlot、SelectedProduct；
- Prompt / Schema / 模型版本；
- 各阶段耗时与调用次数；
- 家具与建筑是否保持；
- 计划是否完整执行；
- 焕新可见度；
- 物理合理性；
- 商品一致性；
- 是否发生返修、Fallback 或 needs_input。

第一链路 P0 的硬验收：

- 12 个案例均无协议崩溃；
- 非家居、模糊和无有效空位不会误调 Seedream；
- 已有家具修改动作始终为 0；
- 几何破坏不能以高审美分通过；
- 正常案例不再只新增一两个重复收纳盒；
- 结果中的商品、价格和来源均可追溯；
- 相同 PlanVersion 可恢复相同的结构化事实；
- Prompt、原图、Base64、Key 和供应商正文不进入普通日志。

## 10. 后端实施优先级

### P0-A：正式链路动态化

把 `SceneAssessment → LayoutPlan → ProductSlot` 迁入 GenerationRun，替换固定
planTemplates 对当前图片的主导地位。

完成标准：不带灵感参考、只上传空间并填写目标，也能得到针对该图的结构化方案；
刷新后方案仍存在。

### P0-B：结构保护和结果门禁

增加 protected/editable region、统一 RenderPromptSpec 和 EvaluationResult。

完成标准：家具或建筑被明显改变的结果不会进入 ready；“保持布局”不再只靠一句
Prompt。

### P0-C：商品约束闭环

先统一 ProductCatalog Adapter，再接 Demo Catalog，最后替换为真实商城 Adapter。

完成标准：效果图新增物都对应 SelectedProduct 或明确的 unfulfilled slot；模型不能
编造商品事实。

### P0-D：可恢复、可解释、可联调

保存中间快照、版本和评测摘要，完善运行状态、错误码、成本指标和 OpenAPI。

完成标准：前端可以解释等待、失败、来源和版本变化；后端同学之外的人可以只根据
接口文档完成联调。

### P1：视频视觉搜索

实现 `VisualSearchQuery → Candidate → 用户确认 → ItemAsset → 2D/3D ModelVersion`。
在 `GET /api/health` 声明能力前，前端继续使用明确标注的本地 Demo。

### P2：通用 3D 场景与组合

实现真实模型任务、Composition、碰撞、尺寸和多视角。当前“包 + 挂件”只作为交互
验证，不得反向要求第一链路引入通用 3D 场景重建。

## 11. 后端交付物

本轮后端交付应包括：

- 正式 GenerationRun 中的第一链路编排；
- SceneAssessment、LayoutPlan、ProductSlot、SelectedProduct、
  RenderPromptSpec、EvaluationResult Schema；
- 唯一 RenderPrompt Builder；
- Prompt、模型和 Schema 版本记录；
- 保护区域或严格的生成后拒绝机制；
- Demo ProductCatalog Adapter 及未来真实商城 Adapter 接口；
- 正常与异常固定评测集；
- `/api/v1` OpenAPI；
- 自动测试、真实模型单次验收脚本和成本记录；
- 更新后的根 `HANDOFF.md`。

后端不需要本轮交付：

- 通用整屋 3D 重建；
- 真实交易、支付或订单；
- 自动抓取完整抖音视频；
- 全量用户长期审美 Agent；
- 多人家庭协作；
- 生产级公网鉴权与多租户。

## 12. 产品验收时只问五件事

1. 这是针对用户这张图做出的方案，还是固定模板？
2. 原家具和建筑是否真的被保护，而不是只写在 Prompt 里？
3. 新增物是否来自经过校验的 ProductSlot 和商品事实？
4. 图片、清单、预算和版本是否一致且可恢复？
5. 失败、Demo 和 Fallback 是否被如实表达？

这五项有任意一项无法回答，第一链路都不能标记为完成。

## 13. 相关事实来源

- `docs/first-workflow-prompt-engineering-handoff.md`：第一链路 Prompt 分层与现状；
- `docs/backend-next-phase-handoff.md`：当前 `/api/v1` 对象、接口与状态；
- `apps/douyin-demo/HANDOFF.md`：前端真实入口、状态机和联调边界；
- `packages/contracts/schemas/*.json`：当前机器协议；
- `packages/validation/src/index.js`：确定性业务校验；
- `services/orchestrator/src/server.js`：实际 HTTP 路由；
- `services/orchestrator/src/workflow.js`：当前正式方案编排；
- `services/orchestrator/src/services/prompt-lab-service.js`：当前两阶段实验链路。
