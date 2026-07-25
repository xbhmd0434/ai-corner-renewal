/**
 * V1 Client
 * 封装 /api/v1 标准接口
 * 符合 HANDOFF.md 6.2 新版 P0 目标接口
 */

import { get, post, patch, del, upload, generateIdempotencyKey, createPendingOperation, completePendingOperation, API_BASE_URL } from "./http-client.js";

/**
 * ==================== 媒体接口 ====================
 */

/**
 * 上传私有图片
 * @param {File} file - 图片文件
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - { media_id, access_url }
 */
export async function uploadMedia(file, options = {}) {
  const {
    purpose = "space_source",
    retention = "temporary",
    ...requestOptions
  } = options;
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "uploadMedia", fileName: file.name });

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", purpose);
    formData.append("retention", retention);

    const result = await upload("/api/v1/media", formData, {
      ...requestOptions,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
    return result;
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}

/**
 * 展示私有图片
 * @param {string} mediaId - media_id
 * @param {string} token - 访问令牌
 * @returns {string} - 完整访问 URL
 */
export function getMediaUrl(mediaId, token) {
  return `${API_BASE_URL}/api/v1/media/${mediaId}/content?token=${token}`;
}

/**
 * 取消未使用上传
 * @param {string} mediaId - media_id
 * @param {object} options - 请求选项
 * @returns {Promise<void>}
 */
export async function deleteMedia(mediaId, options = {}) {
  return await del(`/api/v1/media/${mediaId}`, options);
}

/**
 * ==================== 资产接口 ====================
 */

/**
 * 创建空间/灵感/单品资产
 * @param {object} body - 资产创建请求
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - Asset
 */
export async function createAsset(body, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "createAsset", body });

  try {
    const result = await post("/api/v1/assets", body, {
      ...options,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
    return result;
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}

/**
 * 获取资产列表
 * @param {object} params - 查询参数
 * @param {string} [params.type] - 资产类型: space/inspiration/item
 * @param {string} [params.lifecycle] - 生命周期: temporary/saved/archived
 * @param {string} [params.parse_state] - 解析状态
 * @param {string} [params.sort_by] - 排序字段
 * @param {number} [params.limit] - 数量限制
 * @param {object} options - 请求选项
 * @returns {Promise<object[]>} - Asset[]
 */
export async function listAssets(params = {}, options = {}) {
  const url = new URL("/api/v1/assets", API_BASE_URL);
  const normalized = {
    asset_type: params.asset_type ?? params.type,
    lifecycle: params.lifecycle,
    parse_state: params.parse_state,
    sort: params.sort ?? (params.sort_by ? "recent" : undefined),
    compatible_with_asset_id: params.compatible_with_asset_id,
    cursor: params.cursor,
    limit: params.limit
  };
  Object.entries(normalized).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return await get(url.pathname + url.search, options);
}

/**
 * 获取资产详情
 * @param {string} assetId - asset_id
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - Asset
 */
export async function getAsset(assetId, options = {}) {
  return await get(`/api/v1/assets/${assetId}`, options);
}

/**
 * 更新资产（重命名/确认/保存/归档）
 * @param {string} assetId - asset_id
 * @param {object} body - 更新内容
 * @param {number} resourceVersion - resource_version
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - Asset
 */
export async function updateAsset(assetId, body, resourceVersion, options = {}) {
  return await patch(
    `/api/v1/assets/${assetId}`,
    {
      schema_version: "1.0",
      resource_version: resourceVersion,
      changes: body
    },
    options
  );
}

/**
 * 删除资产
 * @param {string} assetId - asset_id
 * @param {object} options - 请求选项
 * @returns {Promise<void>}
 */
export async function deleteAsset(assetId, options = {}) {
  return await del(`/api/v1/assets/${assetId}`, options);
}

/**
 * 解析失败重试
 * @param {string} assetId - asset_id
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - ParseRun
 */
export async function retryParseAsset(assetId, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "retryParse", assetId });

  try {
    const result = await post(`/api/v1/assets/${assetId}/parse-runs`, {}, {
      ...options,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
    return result;
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}

/**
 * ==================== 空间版本接口 ====================
 */

/**
 * 更新空间照片（创建新 SpaceVersion）
 * @param {string} spaceAssetId - space_asset_id
 * @param {object} body - SpaceVersion 创建请求
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - SpaceVersion
 */
export async function createSpaceVersion(spaceAssetId, body, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "createSpaceVersion", spaceAssetId });

  try {
    const result = await post(`/api/v1/assets/${spaceAssetId}/versions`, body, {
      ...options,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
    return result;
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}

/**
 * 确认空间解析（seal）
 * @param {string} spaceAssetId - space_asset_id
 * @param {string} spaceVersionId - space_version_id
 * @param {object} body - 更新内容（含 seal=true）
 * @param {number} resourceVersion - resource_version
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - SpaceVersion
 */
export async function confirmSpaceVersion(spaceAssetId, spaceVersionId, body, resourceVersion, options = {}) {
  return await patch(
    `/api/v1/assets/${spaceAssetId}/versions/${spaceVersionId}`,
    {
      schema_version: "1.0",
      resource_version: resourceVersion,
      changes: body
    },
    options
  );
}

/**
 * 查看空间版本列表
 * @param {string} spaceAssetId - space_asset_id
 * @param {object} options - 请求选项
 * @returns {Promise<object[]>} - SpaceVersion[]
 */
export async function listSpaceVersions(spaceAssetId, options = {}) {
  return await get(`/api/v1/assets/${spaceAssetId}/versions`, options);
}

/**
 * ==================== 设计任务接口 ====================
 */

/**
 * 创建统一设计任务
 * @param {object} body - DesignRequest
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - DesignRequest
 */
export async function createDesignRequest(body, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "createDesignRequest", body });

  try {
    const result = await post("/api/v1/design-requests", body, {
      ...options,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
    return result;
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}

/**
 * 查看任务快照
 * @param {string} designRequestId - design_request_id
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - DesignRequest
 */
export async function getDesignRequest(designRequestId, options = {}) {
  return await get(`/api/v1/design-requests/${designRequestId}`, options);
}

/**
 * ==================== 生成任务接口 ====================
 */

/**
 * 开始/重试生成
 * @param {string} designRequestId - design_request_id
 * @param {object} body - GenerationRun 创建请求
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - GenerationRun
 */
export async function createGenerationRun(
  designRequestId,
  body = { schema_version: "1.0", reason: "initial" },
  options = {}
) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "createGenerationRun", designRequestId });

  try {
    const result = await post(`/api/v1/design-requests/${designRequestId}/runs`, body, {
      ...options,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
    return result;
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}

/**
 * 轮询生成状态
 * @param {string} generationRunId - generation_run_id
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - GenerationRun
 */
export async function getGenerationRun(generationRunId, options = {}) {
  return await get(`/api/v1/generation-runs/${generationRunId}`, options);
}

/**
 * 取消生成
 * @param {string} generationRunId - generation_run_id
 * @param {object} options - 请求选项
 * @returns {Promise<void>}
 */
export async function cancelGenerationRun(generationRunId, options = {}) {
  return await post(`/api/v1/generation-runs/${generationRunId}/cancel`, {}, options);
}

/**
 * ==================== 方案接口 ====================
 */

/**
 * 获取方案历史
 * @param {object} params - 查询参数
 * @param {string} [params.space_asset_id] - 空间资产 ID
 * @param {string} [params.status] - 状态
 * @param {object} options - 请求选项
 * @returns {Promise<object[]>} - PlanAsset[]
 */
export async function listPlans(params = {}, options = {}) {
  const url = new URL("/api/v1/plans", API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return await get(url.pathname + url.search, options);
}

/**
 * 获取方案谱系
 * @param {string} planAssetId - plan_asset_id
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - PlanAsset
 */
export async function getPlan(planAssetId, options = {}) {
  return await get(`/api/v1/plans/${planAssetId}`, options);
}

/**
 * 获取方案版本详情
 * @param {string} planAssetId - plan_asset_id
 * @param {string} planVersionId - plan_version_id
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - PlanVersionEnvelope
 */
export async function getPlanVersion(planAssetId, planVersionId, options = {}) {
  return await get(`/api/v1/plans/${planAssetId}/versions/${planVersionId}`, options);
}

/**
 * 降预算/换风格（创建新版本）
 * @param {string} planAssetId - plan_asset_id
 * @param {object} body - PlanRevision 请求
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - GenerationRun
 */
export async function createPlanRevision(planAssetId, body, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "createPlanRevision", planAssetId });

  try {
    const result = await post(`/api/v1/plans/${planAssetId}/revisions`, body, {
      ...options,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
    return result;
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}

/**
 * 更新方案状态（保存/选定/执行状态）
 * @param {string} planAssetId - plan_asset_id
 * @param {object} body - 更新内容
 * @param {number} resourceVersion - resource_version
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - PlanAsset
 */
export async function updatePlan(planAssetId, body, resourceVersion, options = {}) {
  return await patch(
    `/api/v1/plans/${planAssetId}`,
    {
      schema_version: "1.0",
      resource_version: resourceVersion,
      changes: body
    },
    options
  );
}

/**
 * ==================== 用户偏好接口 ====================
 */

/**
 * 读取显式偏好
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - Preferences
 */
export async function getPreferences(options = {}) {
  return await get("/api/v1/me/preferences", options);
}

/**
 * 修改显式偏好
 * @param {object} body - 更新内容
 * @param {number} resourceVersion - resource_version
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - Preferences
 */
export async function updatePreferences(body, resourceVersion, options = {}) {
  return await patch(
    "/api/v1/me/preferences",
    {
      schema_version: "1.0",
      resource_version: resourceVersion,
      changes: body
    },
    options
  );
}

/**
 * ==================== 事件接口 ====================
 */

/**
 * 批量发送漏斗事件
 * @param {object[]} events - 事件列表
 * @param {object} options - 请求选项
 * @returns {Promise<void>}
 */
export async function sendEventsBatch(events, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "sendEvents", count: events.length });

  try {
    await post("/api/v1/events/batch", { schema_version: "1.0", events }, {
      ...options,
      idempotencyKey
    });
    completePendingOperation(idempotencyKey);
  } catch (error) {
    completePendingOperation(idempotencyKey);
    throw error;
  }
}
