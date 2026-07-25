# 架构与数据边界

## 目标

产品要把“内容中的喜欢”转化为“适合真实空间的可执行方案”。系统不能只生成一张效果图，还要保留空间事实、用户限制、商品来源和校验依据。

## 核心链路

```text
抖音画面 / 用户空间 / 自然语言
→ 灵感理解 + 空间理解 + 约束理解
→ 商品与内容候选召回
→ 多方案规划
→ 局部效果图
→ 结构、预算、尺寸、库存和安全校验
→ AICard
→ 保存、调整、购买、教程和分享
```

## 核心对象

### RoomProfile

稳定的空间身份：

```json
{
  "room_id": "demo-room-001",
  "room_type": "desk_corner",
  "reference_width_cm": 120,
  "fixed_elements": ["wall", "window", "desk", "chair"],
  "editable_zones": ["desktop", "wall_leaning_zone"],
  "lighting": { "direction": "left", "confidence": 0.82 },
  "uncertainties": ["desk_depth", "socket_position"],
  "needs_confirmation": ["desk_depth"]
}
```

### InspirationProfile

一次灵感理解结果：

```json
{
  "inspiration_id": "demo-inspiration-warm",
  "source_type": "demo",
  "style": ["japanese_natural"],
  "colors": ["oat_white", "light_oak"],
  "materials": ["wood", "linen"],
  "transferable_elements": ["clamp_lamp", "desk_riser", "leaning_board"],
  "excluded_elements": ["drilled_wall_shelf"]
}
```

### UserConstraints

当前任务条件：

```json
{
  "budget_cny": 500,
  "hard_constraints": ["no_drilling", "keep_desk", "keep_chair"],
  "soft_preferences": ["clean_but_lived_in"],
  "goals": ["organization", "ambient_lighting"]
}
```

### ProductCandidate

独立商品事实对象。价格、尺寸、安装方式、库存和来源只在这里维护；
`DesignPlan` 只保存 `product_ids`，不能复制一份价格或库存：

```json
{
  "product_id": "prod-compact-file-rack",
  "name": "立式文件架",
  "price_cny": 69,
  "dimensions_cm": {
    "width": 32,
    "depth": null,
    "height": null
  },
  "installation": "freestanding",
  "availability": {
    "status": "demo_available",
    "source_type": "demo",
    "checked_at": "2026-07-25T00:00:00+08:00"
  }
}
```

### DesignPlan

独立、可版本化的方案：

```json
{
  "plan_id": "plan-compact-req-demo-001-v1",
  "room_id": "demo-room-001",
  "version": 1,
  "title": "高效收纳版",
  "total_price_cny": 328,
  "product_ids": [],
  "placements": [],
  "steps": [],
  "render_ref": "demo-after-warm",
  "assumptions": ["desk_depth_at_least_55cm"]
}
```

### ValidationReport

校验事实与不确定性：

```json
{
  "report_id": "validation-plan-compact-req-demo-001-v1-v1",
  "plan_id": "plan-compact-req-demo-001-v1",
  "plan_version": 1,
  "overall_status": "needs_confirmation",
  "checks": [
    {
      "code": "budget",
      "status": "pass",
      "message": "所选商品未超过预算"
    },
    {
      "code": "dimensions",
      "status": "warn",
      "message": "部分尺寸需要购买前复测"
    }
  ],
  "warnings": ["measure_desk_depth_before_purchase"]
}
```

### AICard

前端组合视图，只引用上述对象，不反向成为事实来源。顶层
`plan / validation / products / render` 表示推荐组合；`alternatives[]`
表示其他完整组合。`needs_input` 状态允许尚无可执行方案。

## 模块所有权

```text
apps/web
└─ 负责展示和交互，不拥有预算、尺寸和安全规则

packages/contracts（已实现）
└─ 拥有所有核心对象 Schema

packages/validation（已实现）
└─ 拥有确定性校验规则

services/orchestrator（已实现比赛 P0）
├─ SQLite Repository、私有媒体与 actor 所有权
├─ Asset / SpaceVersion / DesignRequest / GenerationRun / PlanVersion
└─ 编排 Demo/Live 空间理解、Seedream 主效果图、规则校验、AICard 与失败降级

adapters/private（不进入公开仓库）
└─ 真实抖音内容、商品和账号接口
```

当前 HTTP 边界：

```text
GET  /api/health
POST /api/generate
POST /api/revise
POST/GET/PATCH/DELETE /api/v1/media|assets|design-requests|generation-runs|plans
GET/PATCH /api/v1/me/preferences
POST /api/v1/events/batch
```

`revise` 通过 `request_id + plan_id` 找回持久 AICard，创建新版本方案。
每次 generate/revise 都生成请求级唯一 `plan_id`，校验报告随方案快照唯一；
目录中的 `plan-warm-v1` 等只作为内部模板基名，不是可跨请求复用的业务 ID。
v1 revise 只接受低于父方案总价的目标预算，并复用父卡 RoomProfile 及其来源时间；
它不会重新调用空间分析。
`0.3.0` 起真实进程使用 SQLite 保存任务、run、方案谱系、版本和旧接口卡片；
服务重启可恢复读取。`InMemoryCardStore` 仅保留给旧 Workflow 单元测试和显式注入
场景，不再拥有真实进程的业务事实。

空间理解有三个可替换实现：

- Demo：本地固定 `RoomProfile`，显式标记 `source_mode=demo`。
- Agent Plan：官方专属 OpenAI 兼容网关调用 `Doubao-Seed-2.0 Lite`，模型只返回
  可见事实候选；`room_id` 和用户确认尺寸由本地代码装配。
- HTTP 网关：环境变量配置团队自有网关；超时、网络或非法协议自动返回
  同版本 `fallback` AICard。

Agent Plan 地址固定到官方 `/api/plan/v3`，只发送 data URL/HTTPS 图片；自有 HTTP
网关只允许服务端配置的 HTTPS 地址（无密钥回环开发地址除外）。两者都禁止重定向、
限制响应大小并运行 RoomProfile 协议校验。全局 Demo 模式不能被客户端参数升级为
Live。

Provider 只拥有“提取空间事实候选”的职责。预算、不打孔、保留家具、尺寸、库存和
宠物安全始终由 `packages/validation` 复核。

图片生成由独立 `render-generator` 适配器负责，不复用 RoomProfile 的
`source_mode`。首次生成只为选中的主方案调用一次 Agent Plan
`/images/generations`；结果进入 `generated_render` 私有媒体并绑定空间资产，
持久卡只保存逻辑引用，响应投影为短时签名 URL。候选方案和预算调整仍保留 Demo
图。图片失败只增加 `render_*` warning，不推翻已通过确定性校验的结构化方案。

Agent Plan 的可见事实文本不能直接成为规划规则。适配器把
`fixed_elements / editable_zones` 归一为受控代码（例如 `desk`、`desktop`、
`wall_leaning_zone`），未知标签只进入不确定项；规划器只消费受控代码。这样模型用
中文描述“桌面物品摆放区”时不会破坏稳定区域身份，也不能凭自由文本扩大可编辑边界。

## 演进顺序

1. 当前浏览器演示数据。
2. 已完成：核心对象、请求和 AICard JSON Schema。
3. 已完成：演示商品目录、独立校验包和旧三个兼容 HTTP API。
4. 已完成：可配置自有 HTTP/Agent Plan 空间理解适配器与同 Schema 降级。
5. 已完成：SQLite、私有媒体、资源化 `/api/v1`、异步 run 和持久方案版本。
6. 已完成：前端通过单一 AICard Adapter 接入兼容接口，并完成 Agent Plan
   浏览器端到端真实调用与 ¥300 调整。
7. 已完成：Agent Plan Seedream 5.0 Lite 主方案 image-to-image、私有媒体保存和
   独立图片来源标记。
8. 下一步：把前端兼容调用迁到持久 `/api/v1`，再增加 mask 和候选/版本按需重绘。
9. 最后接入真实内容、商品、鉴权和用户服务。

每次只替换一个模块，通过稳定对象隔离变化，避免模型、页面和业务规则同时重写。
