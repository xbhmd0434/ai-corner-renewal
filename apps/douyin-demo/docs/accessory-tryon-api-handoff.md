# 3D 挂件试搭 · 前后端接口交接

> 更新日期：2026-07-25
> 当前成熟度：前端运行时静态 MVP；本机 Hunyuan GLB 样例可预览；以下新增后端
> 资源与接口均尚未实现。
> 目的：先固定资产身份、任务状态、保存边界和验收口径，避免前端把两个模型合并
> 成一张图片或把浏览器临时状态误当成用户数据库。

## 1. 当前前端已经可以做什么

`douyin-static-demo/try-on.html` 的首版只依赖静态服务和浏览器：

- 包与挂件是两个独立 3D 对象。
- 可切换内置包/挂件、加载用户本地 GLB。
- 可选择包的推荐挂点，调整位置、角度、大小和视角。
- Composition v1 保存到 `localStorage`；不保存 GLB 二进制。
- 本机已有的 Hunyuan3D-2mini shape-only 小蓝鲸 GLB作为演示挂件。
- 模型缺失时使用程序化几何，并在界面标为 Demo。

当前前端不得声称已经实现：

- 视频圈选结果的真实分割、同款检索或全景图获取。
- 网页提交 Hunyuan 生成任务、查看真实进度或取消任务。
- 用户图片、GLB 或 Composition 已保存到后端数据库。
- 厘米级尺寸、软包形变、碰撞、承重或购买兼容性验证。

## 2. 对象边界

现有 `Asset(item)` 继续作为“用户的一件物品”稳定身份，不新增 `bag` 或 `charm`
资产类型。包/挂件是一次 Composition 中的角色，不是资产固有类型。

```text
MediaObject（原图 / 代表帧 / 派生 GLB）
  → Asset(item)
    → ModelGenerationRun（一次生成尝试）
      → ModelVersion（不可变 3D 结果）

Base ModelVersion（本次扮演包）
Attachment ModelVersion（本次扮演挂件）
  → CompositionAsset（稳定试搭身份）
    → CompositionVersion v1 → v2 → ...
```

必须保持：

- `Asset`：所有权、来源、生命周期和用户可理解名称。
- `ModelVersion`：不可变模型文件、单位、边界、连接点和生成来源。
- `CompositionVersion`：只引用两个 ModelVersion，保存挂点和位姿。
- GLB 存私有对象存储；SQLite 只保存引用和元数据。
- 合并 GLB 只能是显式导出副本，不能替代 Composition 的事实源。

## 3. 当前前端 Composition v1

浏览器键：

```text
douyin-accessory-composition-v1
```

结构：

```json
{
  "schema_version": "tryon-composition.v1",
  "base_model_id": "bag-cloud-01",
  "attachment_model_id": "charm-whale-01",
  "anchor_id": "right-ring",
  "transform": {
    "position": [0.92, 0.32, 0.7],
    "rotation": [0, 0, -0.12],
    "scale": 1
  },
  "view": "perspective",
  "source_context": {
    "kind": "video | library",
    "provider": "douyin_static_demo",
    "external_content_id": "video-1",
    "timestamp_ms": 0
  },
  "saved_at": "2026-07-25T00:00:00.000Z"
}
```

本结构目前只保证内置稳定 ID 可跨刷新恢复。本地文件选择得到的自定义 GLB 是
浏览器会话对象，刷新后必须重新选择；在后端 ModelVersion 落地前不能伪装成已保存。

## 4. 可复用的现有接口

以下现有 `/api/v1` 不需要为 3D 另起一套：

```text
POST /api/v1/media
POST /api/v1/assets                asset_type=item
GET  /api/v1/assets/{asset_id}
PATCH/DELETE /api/v1/assets/{asset_id}
```

建议流程：

1. 视频代表帧或用户拍摄图片先创建私有 MediaObject。
2. 创建/更新 `Asset(item)`，记录用户确认后的名称和来源。
3. 用 `asset_id + source_media_id` 创建模型生成任务。

视频只保存已确认的代表帧、时间戳和 `selection_bbox`；不能上传整段视频来替代明确
授权和对象选择。

## 5. 建议新增接口（尚未实现）

### 5.1 创建模型生成任务

```http
POST /api/v1/model-generation-runs
Idempotency-Key: <uuid>
Content-Type: application/json
```

```json
{
  "asset_id": "ast_item_01",
  "source_media_id": "med_source_01",
  "profile": "hunyuan3d-2mini-shape",
  "requested_output": {
    "format": "glb",
    "texture": false,
    "target_triangle_budget": 120000
  }
}
```

响应 `202`：

```json
{
  "schema_version": "model-generation-run.v1",
  "model_generation_run_id": "mgr_01",
  "asset_id": "ast_item_01",
  "status": "queued",
  "phase": "input_validation",
  "progress": 0,
  "created_at": "2026-07-25T00:00:00.000Z"
}
```

状态：

```text
queued
→ input_validation
→ preprocessing
→ model_loading
→ shape_generation
→ mesh_cleanup
→ packaging
→ succeeded | failed | cancelled
```

### 5.2 查询、取消和重试

```text
GET  /api/v1/model-generation-runs/{run_id}
POST /api/v1/model-generation-runs/{run_id}/cancel
POST /api/v1/model-generation-runs/{run_id}/retries
```

成功结果：

```json
{
  "status": "succeeded",
  "progress": 100,
  "result": {
    "model_version_id": "modv_01"
  }
}
```

失败必须返回稳定 `error.code`，至少覆盖：

```text
invalid_source_image
subject_not_isolated
gpu_unavailable
gpu_out_of_memory
generation_timeout
mesh_packaging_failed
model_provider_unavailable
```

### 5.3 模型版本

```text
GET /api/v1/model-versions/{model_version_id}
GET /api/v1/assets/{asset_id}/model-versions
```

```json
{
  "schema_version": "model-version.v1",
  "model_version_id": "modv_01",
  "asset_id": "ast_item_01",
  "version": 1,
  "format": "glb",
  "unit": "meter",
  "bounds": {
    "min": [-0.4, -0.5, -0.2],
    "max": [0.4, 0.5, 0.2]
  },
  "dimensions_mm": {
    "width": null,
    "height": null,
    "depth": null,
    "source": "unknown"
  },
  "anchors": [
    {
      "anchor_id": "connector",
      "name": "挂件连接点",
      "position": [0, 0.5, 0],
      "rotation": [0, 0, 0],
      "source": "user_confirmed"
    }
  ],
  "mesh": {
    "triangle_count": 98240,
    "has_texture": false,
    "access_url": "/api/v1/media/med_glb_01?purpose=model-preview&token=..."
  },
  "source": {
    "provider": "hunyuan3d-2mini",
    "source_media_id": "med_source_01",
    "model_generation_run_id": "mgr_01"
  },
  "created_at": "2026-07-25T00:00:00.000Z"
}
```

`dimensions_mm.source=unknown` 时只能做视觉预览；前端不得显示真实适配或厘米级比例。

### 5.4 Composition

```text
POST /api/v1/compositions
GET  /api/v1/compositions
GET  /api/v1/compositions/{composition_asset_id}
POST /api/v1/compositions/{composition_asset_id}/versions
PATCH /api/v1/compositions/{composition_asset_id}
DELETE /api/v1/compositions/{composition_asset_id}
```

创建：

```json
{
  "name": "小蓝鲸 × 云朵包",
  "base_model_version_id": "modv_bag_01",
  "attachment_model_version_id": "modv_charm_01",
  "anchor_id": "right-ring",
  "transform": {
    "position": [0.92, 0.32, 0.7],
    "rotation": [0, 0, -0.12],
    "scale": 1
  },
  "view": "perspective",
  "source_context": {
    "provider": "douyin_static_demo",
    "external_content_id": "video-1",
    "timestamp_ms": 0
  }
}
```

调整位置、换挂件或换包会创建新的不可变 CompositionVersion；收藏、标题和归档只
PATCH CompositionAsset，不为 UI 状态创建版本。

## 6. HTTP、所有权和隐私

- 创建任务、任务重试、Composition 和 CompositionVersion 必须带
  `Idempotency-Key`。
- ModelVersion、Composition 所有读取必须显式校验 actor；跨用户统一返回 404。
- 模型访问 URL 必须短时签名并绑定 actor、media、purpose、expiry。
- 日志不得记录原图、GLB 字节、Base64、签名 URL、用户自由文本或供应方正文。
- 删除 Asset 先撤销媒体访问；仍被 CompositionVersion 引用的模型按历史脱敏策略
  处理，不能静默悬空。
- 本机 Hunyuan 默认离线读取缓存。正式商用前复核模型许可证及商品图片、商标、
  肖像和视频代表帧授权。

## 7. 前端接入顺序与验收

### 阶段 A：当前静态 MVP

- 推荐流 AI 入口可选择“放进空间”或“挂到包上”。
- 3D 页面显示两个独立模型并可调整、保存、恢复。
- Hunyuan GLB 缺失时显示 Demo 降级，不出现空画布。
- 验收：桌面手机壳与 390px 移动宽度无溢出；浏览器控制台无错误。

### 阶段 B：真实生成任务

- 图片先走现有私有 Media/Asset。
- 创建 ModelGenerationRun、轮询、取消、失败重试。
- succeeded 后以签名 URL 加载 ModelVersion。
- 验收：刷新可恢复 run；进程重启后 queued/running 可恢复；OOM 有明确建议。

### 阶段 C：用户数据库

- CompositionAsset/Version 替代 `localStorage` 事实源。
- 覆盖预览/保存/取消/恢复、空组合、换包/换挂件、旧本地结构迁移。
- 验收：换设备可见；删除和权限边界可验证；模型仍保持独立。

## 8. 前端降级规则

- 后端无新接口：继续静态资产 + `localStorage`，显示“本地演示”。
- GLB 加载失败：程序化几何，显示“演示几何”，不能标为 Hunyuan。
- 生成失败：保留用户原图和上次成功 ModelVersion，不清空 Composition。
- 模型尺寸未知：显示“视觉试搭”，不计算真实适配分。
- 自定义本地 GLB：显示“仅本次会话”，保存按钮必须提示刷新后需重新载入。
