# 模型与 Agent 接入边界

> 当前状态：Agent Plan 直连 `RoomProfile` 适配器已实现并通过 Mock 测试。
> 2026-07-25 已使用个人版专属 Key 完成文本鉴权，并以项目演示书桌图完成一次
> `source_mode=live` 的真实多模态调用；同日完成 Seedream 5.0 Lite 主方案真实
> image-to-image 与私有媒体读取验收。商品、教程、候选方案效果图、预算调整后
> 重绘和其余模型端口仍是 Demo 或待接入能力，不能把一张主效果图扩大描述成完整
> Live 产品链路。

## 1. 选择原则

- 能由确定性 API 完成的任务不调用 Agent。
- 空间/灵感事实提取使用多模态结构化输出模型。
- bbox 与 mask 使用检测、分割专用 API，不让大语言模型猜像素。
- 局部效果图使用 image-to-image / 指令编辑 API，不使用通用 Agent 绕一层。
- 只有“多步方案规划与解释”需要 Agent；其输出仍必须经过确定性校验。
- 价格、库存、尺寸、商品来源、预算、所有权、状态机和删除永远由后端代码拥有。

当前供应方建议以 2026-07 的可用模型为准：

| 端口 | 当前实现 | 建议接入 | 理由 |
| --- | --- | --- | --- |
| `RoomProfile` | Agent Plan/自有网关 adapter；Agent Plan 多模态已真调验收 | `Doubao-Seed-2.0 Lite`；复杂空间推理切 Pro | 多模态结构化提取，成本与能力平衡 |
| `asset_understanding` | `/api/v1` 仍是确定性 Demo adapter | 复用验收后的 `Doubao-Seed-2.0 Lite` adapter | 先打通同一个模型边界，不复制工作流 |
| `planning_agent` | 现有确定性 Workflow | `Doubao-Seed-2.0 Pro` | 只负责方案提议、解释和追问 |
| `render_edit` | Agent Plan `Doubao-Seedream-5.0-lite`；首次主方案已真调验收 | 后续增加 mask、候选按需生成和版本重绘 | 已实现原图编辑、私有保存和独立 Live/Fallback/Demo 标记 |
| `segmentation` | Demo bbox | 检测与分割专用模型 | 输出 bbox/mask，避免通用模型伪精确 |

模型版本会变。接入时把供应方 model/endpoint 写在部署配置和 Trace 中，不把它
固化成前端协议。火山引擎已将部分旧视觉理解算子建议迁移到
Doubao-Seed-2.0 Lite/Mini；当前个人套餐明确提供 Seedream 5.0 lite，且支持图片
编辑和多图参考：

- <https://www.volcengine.com/docs/6492/2275237>
- <https://www.volcengine.com/docs/82379/1795150>
- <https://www.volcengine.com/docs/82379/1829186>

## 2. 服务端配置

已实现的 Agent Plan RoomProfile 直连：

```dotenv
ROOM_ANALYZER_PROVIDER=agent_plan
AGENT_PLAN_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
AGENT_PLAN_API_KEY=
AGENT_PLAN_TEXT_MODEL=doubao-seed-2.0-lite
AGENT_PLAN_IMAGE_MODEL=doubao-seedream-5.0-lite
AGENT_PLAN_TIMEOUT_MS=30000
AGENT_PLAN_IMAGE_TIMEOUT_MS=90000
AGENT_PLAN_IMAGE_RESPONSE_LIMIT_BYTES=25165824
```

运行时会读取被 Git 忽略的 `.env.local`，但操作系统/部署平台环境变量优先。官方
Base URL 被代码固定到 `ark.cn-beijing.volces.com/api/plan/v3`，避免把专属 Key
误发给中转站。`npm run check:agent-plan` 只做一次低消耗文本鉴权验证；
`npm run check:agent-plan-room [可选图片路径]` 使用 PNG/JPEG/WebP 验收多模态
RoomProfile，默认图片是 `apps/web/assets/desk-before.png`。
`npm run check:agent-plan-image` 再走一次真实主方案生图和私有媒体读取；该检查会
消耗图片燃料值。

其余仍是冻结但未实现的端口：

```dotenv
ASSET_UNDERSTANDING_URL=
ASSET_UNDERSTANDING_API_KEY=
PLANNING_AGENT_URL=
PLANNING_AGENT_API_KEY=
RENDER_EDIT_URL=
RENDER_EDIT_API_KEY=
SEGMENTATION_URL=
SEGMENTATION_API_KEY=
```

这些变量目前故意为空，代码不会因为存在一个 URL 就宣称能力已验收。接入完成还
必须有一次真实调用证据、响应 Schema 验证、耗时、失败原因和降级测试。

## 3. 接口契约

### 3.1 `RoomProfile` / `asset_understanding`

输入只允许：

- `asset_id` / `space_version_id`；
- 当前请求内读取的私有图片字节或短时供应方可读地址；
- 参考尺寸、资产类型、用户已明确确认的字段；
- 目标输出 Schema 名称与版本。

输出转换为：

```json
{
  "source_mode": "live",
  "parse_state": "needs_confirmation",
  "attributes": {
    "scene_type": "desk_corner",
    "editable_regions": [],
    "detected_objects": [],
    "uncertainties": []
  },
  "provider_trace": {
    "provider": "volcengine-ark",
    "model": "deployment-specific",
    "latency_ms": 0
  }
}
```

供应商原始响应不能写入数据库、日志或透传前端。

`fixed_elements` 与 `editable_zones` 不是展示文案，而是规划器消费的稳定代码。
Agent Plan prompt 只允许受控枚举，服务端仍会把中英文可见标签保守归一化；未识别
标签进入 `uncertainties / needs_confirmation`，不得因模型自由文本扩大可编辑区。

### 3.2 `planning_agent`

只接收脱敏的 `DesignRequest.input_snapshot`、受控商品候选和规则校验反馈，不接收
原图字节。输出为 `PlanProposal`，再由 `packages/validation` 复算预算、尺寸、
安装、库存和安全。模型写出的价格或库存一律丢弃。

### 3.3 `render_edit`

这是已实现的具体图像编辑任务，直接调用 Agent Plan 专属端点
`POST /images/generations`：

```text
原空间图 + RoomProfile 固定结构 + 主方案摆放规则 + 商品名 + 结构保持指令
→ 一张 Base64 图片结果
```

请求固定关闭组图，只生成首次选中的主方案。成功字节会校验 JSON 响应大小、
Base64、MIME、文件签名和上传上限，再进入 `SourceIngestionService` 的
`generated_render` 私有媒体；持久 AICard 只保存逻辑 `media_id` 引用，读取时才
签发短时 URL。媒体绑定空间资产，空间删除时派生图也进入清理/脱敏边界。

若编辑失败但结构化方案有效，主方案保留预生成 Demo 图并增加
`render_*` warning，不把整个 run 误报为 500。`AICard.source_mode` 仍只代表
RoomProfile 来源；图片来源读取 `render.is_demo_asset` 和
`data_sources[kind=render_generation]`。

当前不向 Seedream 发送供应方商品图或 mask；候选方案和预算调整也不自动重绘，
避免一次交互消耗多张额度。后续应由用户显式触发按需生成。

正式焕新流水线直接执行两阶段规划与生图，并写入受控领域对象：

```text
已封存 SpaceVersion + confirmed_intent + 用户约束
→ 文本视觉模型输出 LayoutPlan + ProductSlot
→ 服务端 Builder 编译只读生图指令
→ Seedream 编辑原图
→ RenderEvaluator 验收
→ 私有媒体 + GenerationRun + PlanVersion 持久化
```

规划与渲染模板事实源是 `src/prompts/renewal-v2.js`，执行入口是
`FormalRenewalPipeline`。服务端对规划 JSON 做边界校验、过滤 SourceComponent
同品类重复项并注入确定性整理动作后才构造 Seedream 指令；规划失败时不调用图片
模型，视觉验收不通过时最多修复一次。旧 Prompt 实验台及专用 API 已移除。

### 3.4 `segmentation`

输出必须是 0～1 bbox 和与原图同空间的 mask。用户确认的是独立状态；模型更新
不能覆盖 sealed SpaceVersion。接入模型后仍保留 Canvas 手工确认。

## 4. 验收门

每个端口接入后分别满足：

1. 正常、超时、5xx、非法 JSON、Schema 不符、超大响应都有测试；
2. Demo / Live / Fallback 标签与实际来源一致；
3. 原图、密钥、供应商正文不进入日志、Trace、事件或 AICard；
4. 关闭端点后仍能完整演示确定性 Demo；
5. 至少记录一次授权主案例的 model、耗时和结果证据；当前 2026-07-25 验收输出
   `image/jpeg` 286,836 字节并通过私有 URL 读取；
6. 任何模型输出都不能绕过 Repository 所有权或 `packages/validation`。
