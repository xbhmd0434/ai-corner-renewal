# 视频框选视觉搜索与资产入库 API

> 状态：拟议契约，后端尚未实现
> 前端状态：交互 Demo 已实现；能力未启用时使用明确标注的本地候选
> 目标版本：`/api/v1`
> 最后更新：2026-07-25

## 1. 范围与完成标准

本接口只负责以下闭环：

```text
用户确认的视频帧局部图
→ VisualSearchQuery
→ Candidate[]
→ 用户确认一个 Candidate
→ ItemAsset
→ ModelGenerationRun
→ ModelVersion
```

它不负责下载整段抖音视频、自动替用户确认商品、交易、库存锁定，也不把“视觉相似”
描述为“准确同款”。

P0 完成标准：

1. 前端只上传用户明确确认的框选区域；
2. 创建查询后可轮询到成功、失败或取消终态；
3. 成功至少返回一个有来源标识的候选；
4. 用户确认候选后创建稳定 `ItemAsset`；
5. 同一确认请求幂等，不重复创建资产和模型任务；
6. 模型任务至少生成透明背景 2D 预览；3D 可作为后续输出能力；
7. 资产列表刷新或服务重启后仍能读取结果；
8. 删除资产时按引用关系清理查询图、派生图和模型文件。

## 2. 对象和所有权

| 对象 | 稳定 ID | 所有者 | 说明 |
| --- | --- | --- | --- |
| 私有查询图 | `media_id` | MediaService | 用户确认的裁剪图，默认临时保留 |
| 视觉查询 | `visual_search_query_id` | VisualSearchService | 一次异步召回，不等同于资产 |
| 候选 | `candidate_id` | VisualSearchService | 查询内稳定；不是全局商品身份 |
| 商品 | `product_id` | ProductCatalog | 有可靠目录匹配时才提供 |
| 单品资产 | `asset_id` | AssetService | 用户确认后的长期稳定身份 |
| 模型任务 | `model_generation_run_id` | ModelService | 一次生成或重试 |
| 模型版本 | `model_version_id` | ModelService | 不可变派生物，引用私有媒体/对象存储 |

关键约束：

- `Candidate` 不能直接写入资产库；必须经过用户确认。
- `product_id=null` 表示只有视觉候选，不能伪造商品目录事实。
- `ItemAsset` 与 `ModelVersion` 分开；重新建模创建新版本，不覆盖资产身份。
- 商品价格、链接、库存和来源只由后端目录返回，前端不得自行补全。
- `owner_id` 从认证上下文注入，客户端请求体禁止传入。

## 3. 能力发现

后端实现并可用后，在现有健康接口中增加：

```http
GET /api/health
```

```json
{
  "service": "ai-corner-renewal-orchestrator",
  "api_version": "v1",
  "features": {
    "visual_search": true,
    "visual_search_3d_model": false
  },
  "limits": {
    "visual_search_query_bytes": 5242880,
    "visual_search_max_candidates": 20
  }
}
```

前端只有看到 `features.visual_search=true` 才上传查询图并调用真实接口。未启用时直接
进入本地 Demo，不制造 404，也不留下未绑定媒体。

## 4. 查询图上传

沿用现有媒体接口：

```http
POST /api/v1/media
Content-Type: multipart/form-data
Idempotency-Key: <uuid>
```

字段：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `file` | image | 是 | JPEG/PNG/WebP，服务端校验真实签名 |
| `purpose` | string | 是 | 新增枚举 `visual_search_query` |
| `retention` | string | 是 | P0 固定 `temporary` |

前端上传的是裁剪图，不是 Data URL、完整视频或默认整帧。服务端继续清理 EXIF/文本
元数据，文件落入非静态私有目录，并只返回短时访问地址。

## 5. 创建视觉搜索

```http
POST /api/v1/visual-search/queries
Content-Type: application/json
Idempotency-Key: <uuid>
```

请求：

```json
{
  "schema_version": "1.0",
  "query_media_id": "media-01J...",
  "source_context": {
    "provider": "douyin_static_demo",
    "external_content_id": "video-2",
    "author_display": "@白了少年头",
    "timestamp_ms": 3214,
    "selection_bbox": {
      "x": 0.13,
      "y": 0.26,
      "width": 0.61,
      "height": 0.31
    }
  },
  "options": {
    "max_candidates": 12,
    "search_scope": ["same_item", "similar_item"],
    "category_hint": null
  }
}
```

坐标约定：

- `selection_bbox` 使用原始代表帧上的归一化坐标，范围 `0～1`；
- 原点在左上角，`x` 向右，`y` 向下；
- `x + width <= 1`、`y + height <= 1`；
- P0 最小面积建议为整帧的 `1.2%`；
- 查询媒体已经是裁剪图，bbox 用于来源审计与回放，不用于再次裁剪。

`202 Accepted`：

```json
{
  "schema_version": "1.0",
  "visual_search_query_id": "vsq-01J...",
  "status": "queued",
  "phase": "queued",
  "query_media_id": "media-01J...",
  "source_mode": null,
  "candidates": [],
  "error": null,
  "created_at": "2026-07-25T08:00:00.000Z",
  "updated_at": "2026-07-25T08:00:00.000Z"
}
```

## 6. 查询状态与候选

```http
GET /api/v1/visual-search/queries/{visual_search_query_id}
```

状态机：

```text
queued
→ running
→ succeeded | failed | cancelled
```

`running` 阶段：

```text
feature_extraction → category_detection → candidate_retrieval → reranking
```

成功响应：

```json
{
  "schema_version": "1.0",
  "visual_search_query_id": "vsq-01J...",
  "status": "succeeded",
  "phase": "completed",
  "query_media_id": "media-01J...",
  "source_mode": "live",
  "detected_subject": {
    "category_code": "desk_riser",
    "display_name": "桌面置物架",
    "attributes": {
      "primary_color": "light_wood",
      "material": "wood",
      "structure": "two_tier"
    }
  },
  "candidates": [
    {
      "candidate_id": "candidate-01",
      "product_id": "product-9821",
      "identity_level": "catalog_candidate",
      "name": "浅橡木双层桌上架",
      "category": "桌面置物架",
      "preview_media": {
        "media_id": "media-preview-01",
        "access_url": "/api/v1/media/media-preview-01/content?token=...",
        "expires_at": "2026-07-25T08:10:00.000Z"
      },
      "price": {
        "amount_cny": 159,
        "observed_at": "2026-07-25T08:00:01.000Z"
      },
      "similarity_score": 0.92,
      "match_reasons": ["浅木色与轮廓接近", "双层结构相似"],
      "source": {
        "source_type": "catalog",
        "provider": "authorized_demo_catalog",
        "label": "授权演示商品目录",
        "is_live": false
      }
    }
  ],
  "error": null,
  "created_at": "2026-07-25T08:00:00.000Z",
  "updated_at": "2026-07-25T08:00:01.200Z"
}
```

`identity_level`：

- `exact_verified`：目录有可验证的精确商品身份；
- `catalog_candidate`：目录候选，但未证明是同款；
- `visual_only`：只有视觉相似，`product_id` 必须为 `null`。

`similarity_score` 只用于当前查询排序，不作为可跨模型版本比较的质量分。前端必须同时
展示 `match_reasons` 和来源标签。

## 7. 确认候选并创建资产

```http
POST /api/v1/visual-search/queries/{visual_search_query_id}/selections
Content-Type: application/json
Idempotency-Key: <uuid>
```

请求：

```json
{
  "schema_version": "1.0",
  "candidate_id": "candidate-01",
  "asset_lifecycle": "saved",
  "modeling_mode": "preview_2d"
}
```

`modeling_mode`：

- `preview_2d`：P0 必须实现，抠图/透明背景与基本轮廓；
- `model_3d`：只有健康接口声明支持时才能请求；
- `none`：只保存商品/来源事实，不创建模型任务。

`201 Created`：

```json
{
  "schema_version": "1.0",
  "selection_id": "vss-01J...",
  "item_asset": {
    "asset_id": "item-01J...",
    "asset_type": "item",
    "lifecycle": "saved",
    "parse_state": "ready",
    "name": "浅橡木双层桌上架",
    "resource_version": 1,
    "product_ref": {
      "product_id": "product-9821",
      "candidate_id": "candidate-01",
      "identity_level": "catalog_candidate"
    }
  },
  "model_generation_run": {
    "model_generation_run_id": "model-run-01J...",
    "status": "queued",
    "output_kind": "preview_2d",
    "model_version_id": null
  },
  "deduplicated": false
}
```

后端事务边界：

1. 验证查询属于当前 actor 且已成功；
2. 验证候选来自该查询；
3. 固化候选名称、来源、商品引用和查询来源快照；
4. 创建或复用同一用户的 ItemAsset；
5. 绑定查询媒体，避免临时清理任务误删；
6. 创建模型任务；
7. 保存幂等结果后提交事务。

同一查询和候选重复确认，应返回第一次的资产和任务，`deduplicated=true`。不同
候选是不同确认操作，不得覆盖旧资产。

## 8. 模型任务

建议复用统一模型资源：

```http
GET  /api/v1/model-generation-runs/{model_generation_run_id}
POST /api/v1/model-generation-runs/{model_generation_run_id}/cancel
POST /api/v1/assets/{asset_id}/model-generation-runs
GET  /api/v1/assets/{asset_id}/model-versions
GET  /api/v1/assets/{asset_id}/model-versions/{model_version_id}
```

状态：

```text
queued → running → succeeded | failed | cancelled
```

2D P0 的 `ModelVersion` 至少保存：

```json
{
  "model_version_id": "model-version-01J...",
  "asset_id": "item-01J...",
  "version": 1,
  "kind": "preview_2d",
  "state": "ready",
  "preview_media_id": "media-derived-01",
  "bounds_px": {
    "width": 1024,
    "height": 768
  },
  "dimensions_cm": null,
  "provenance": {
    "visual_search_query_id": "vsq-01J...",
    "candidate_id": "candidate-01",
    "generator": "segmentation-provider-name",
    "generator_version": "v1"
  },
  "created_at": "2026-07-25T08:00:04.000Z"
}
```

3D 版本必须额外保存单位、包围盒、原点、朝向、网格/贴图引用和许可证信息。厘米尺寸
未知时保持 `null`，不能从视频像素推算。

## 9. 取消、删除与保留

视觉查询取消：

```http
POST /api/v1/visual-search/queries/{visual_search_query_id}/cancel
```

- 前端关闭页面只中止本地轮询，不默认取消服务端任务；
- 用户明确取消搜索才调用 cancel；
- 未确认且超过保留时间的查询图可清理；
- 已确认候选的查询图通过资产/模型引用继续受保护；
- 删除 ItemAsset 时先撤销媒体访问，再按引用计数清理派生媒体和模型文件；
- 查询审计可保留不含原图的最小来源事实。

## 10. 错误与幂等

| HTTP | `error.code` | 场景 |
| --- | --- | --- |
| 404 | `visual_search_query_not_found` | 不存在、无权访问或已删除 |
| 409 | `visual_search_query_not_ready` | 查询未成功就确认候选 |
| 409 | `idempotency_key_reused` | 同 key 不同请求指纹 |
| 413 | `visual_search_query_too_large` | 裁剪图超过限制 |
| 415 | `unsupported_media_type` | 非 JPEG/PNG/WebP |
| 422 | `selection_bbox_invalid` | bbox 越界或面积过小 |
| 422 | `candidate_not_in_query` | 候选不属于当前查询 |
| 429 | `visual_search_rate_limited` | 用户查询频率或并发超限 |
| 502 | `visual_search_provider_failed` | 上游检索失败 |
| 504 | `visual_search_provider_timeout` | 上游超时 |

错误响应沿用项目统一结构：

```json
{
  "schema_version": "1.0",
  "request_id": "request-01J...",
  "error": {
    "code": "candidate_not_in_query",
    "message": "候选不属于当前视觉查询",
    "details": null
  }
}
```

创建媒体、视觉查询、候选确认、模型任务和取消动作均要求 `Idempotency-Key`。查询
状态 GET 不需要幂等键。

## 11. 前端当前接入方式

相关文件：

```text
apps/douyin-demo/douyin-static-demo/
├─ visual-search/
│  ├─ main.js
│  ├─ model.js
│  ├─ fixtures.js
│  └─ styles.css
└─ api/
   └─ visual-search-client.js
```

当前状态：

- 暂停、入口出现、定帧、拖动框选、最小面积校验和整帧兜底已实现；
- 搜索中、候选选择、轻量建模、完成页已实现；
- 后端未声明能力时使用固定本地候选，并固定显示“本地 Demo 候选”；
- 用户确认后优先用现有 `/api/v1/assets` 创建可持久 ItemAsset；
- 后端不可用时只写 `douyin-visual-assets-v1` 浏览器降级记录，页面不会声称已云端保存；
- 真实视觉查询、候选来源图和 ModelVersion 等待本文接口实现。

前端不会因为真实接口失败而把失败响应标为 Live。真实服务不可用时的 Demo 候选与
服务端模型失败后的 fallback 必须分别表达。

## 12. 后端落地顺序

1. 扩展 media purpose、健康能力和上传限制；
2. 增加 Query/Candidate Repository 表与 migration；
3. 实现确定性授权 Demo catalog adapter，先跑通状态和来源；
4. 实现 POST/GET/cancel、幂等和 actor 隔离；
5. 扩展 ItemAsset 的 `product_ref` 与 `model_version_ids` 协议；
6. 实现 selection 事务与 2D ModelGenerationRun；
7. 补媒体引用计数、删除和重启恢复；
8. 最后替换真实向量检索/商品目录 adapter；
9. 3D 生成独立验收，不阻塞 P0 的 2D 资产闭环。

最小自动测试至少覆盖：bbox 边界、非法 media purpose、查询幂等、查询状态机、跨
actor 404、候选不属于查询、确认幂等、服务重启恢复、临时媒体清理、资产删除级联、
上游超时和 Demo/Live/Fallback 来源标识。
