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

### DesignPlan

独立、可版本化的方案：

```json
{
  "plan_id": "plan-compact-v1",
  "room_id": "demo-room-001",
  "version": 1,
  "title": "高效收纳版",
  "total_price_cny": 328,
  "products": [],
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
  "plan_id": "plan-compact-v1",
  "budget": "pass",
  "structure": "pass",
  "availability": "demo_pass",
  "dimensions": "needs_confirmation",
  "warnings": ["measure_desk_depth_before_purchase"]
}
```

### AICard

前端组合视图，只引用上述对象，不反向成为事实来源。

## 模块所有权

```text
apps/web
└─ 负责展示和交互，不拥有预算、尺寸和安全规则

packages/contracts（规划）
└─ 拥有所有核心对象 Schema

packages/validation（规划）
└─ 拥有确定性校验规则

services/orchestrator（规划）
└─ 编排模型、检索、生成和校验

adapters/private（不进入公开仓库）
└─ 真实抖音内容、商品和账号接口
```

## 演进顺序

1. 当前浏览器演示数据。
2. 把核心对象提取为 JSON Schema。
3. 用 HTTP 接口替换空间理解，保持 `RoomProfile` 不变。
4. 接入演示商品数据库和独立校验包。
5. 接入局部图像编辑并保留生成前后结构检查。
6. 最后接入真实内容、商品和用户服务。

每次只替换一个模块，通过稳定对象隔离变化，避免模型、页面和业务规则同时重写。
