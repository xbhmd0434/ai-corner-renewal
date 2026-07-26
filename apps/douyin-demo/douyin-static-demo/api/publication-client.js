/**
 * Publication Client (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 5.2 节路由：
 *   POST   /api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/publications
 *     operationId = createPublication
 *   GET    /api/v1/publications/{publication_id}
 *     operationId = getPublication
 *   DELETE /api/v1/publications/{publication_id}
 *     operationId = withdrawPublication
 *
 * 协议第 4 节：POST 创建/撤下必须带 Idempotency-Key；schema_version=1.0；
 * V2.1 新对象响应携带 contract_version="renewal-card/2.1"。
 * 协议 6.4：发布前必须先用现有 Plan PATCH 把 lifecycle 改为 saved。
 *
 * 该路由当前未在后端实现（health.features.plan_publication=false），
 * 调用方必须先经 `capabilityGate.require(V2_CAPABILITIES.PLAN_PUBLICATION)`，
 * 否则不得调用本客户端。capability 不可用时仅允许私人保存，禁用发布并解释原因。
 */

import {
  get,
  post,
  del,
  generateIdempotencyKey,
  createPendingOperation,
  completePendingOperation
} from "./http-client.js";

function segment(value) {
  return encodeURIComponent(String(value));
}

/**
 * 发布不可变方案快照。
 *
 * 协议 6.4 请求体：
 * ```json
 * {
 *   "schema_version": "1.0",
 *   "title": "我的原木暖光书桌",
 *   "cover_source": "plan_render",
 *   "source_attribution_acknowledged": true
 * }
 * ```
 *
 * @param {string} planAssetId
 * @param {string} planVersionId
 * @param {object} body
 * @param {string} body.title
 * @param {"plan_render"} [body.cover_source="plan_render"]
 * @param {boolean} [body.source_attribution_acknowledged=true]
 * @param {object} [options]
 * @returns {Promise<object>} - Publication（status=indexing|published|...）
 */
export async function createPublication(
  planAssetId,
  planVersionId,
  body,
  options = {}
) {
  if (!planAssetId) throw new TypeError("planAssetId is required");
  if (!planVersionId) throw new TypeError("planVersionId is required");
  if (!body || !body.title) {
    throw new TypeError("body.title is required for publication");
  }

  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, {
    type: "createPublication",
    planAssetId,
    planVersionId
  });

  try {
    const payload = {
      schema_version: "1.0",
      title: String(body.title).slice(0, 100),
      cover_source: body.cover_source || "plan_render",
      source_attribution_acknowledged:
        body.source_attribution_acknowledged !== false
    };
    return await post(
      `/api/v1/plans/${segment(planAssetId)}/versions/${segment(planVersionId)}/publications`,
      payload,
      { ...options, idempotencyKey }
    );
  } finally {
    completePendingOperation(idempotencyKey);
  }
}

/**
 * 查询发布/索引状态。用于刷新恢复与状态轮询。
 *
 * @param {string} publicationId
 * @param {object} [options]
 * @returns {Promise<object>} - Publication
 */
export async function getPublication(publicationId, options = {}) {
  if (!publicationId) throw new TypeError("publicationId is required");
  return get(`/api/v1/publications/${segment(publicationId)}`, options);
}

/**
 * 撤下发布。撤下立即从召回索引删除；私人 PlanAsset 不受影响。
 *
 * 协议第 4 节明确撤下属于资源状态变更，应带 Idempotency-Key。
 *
 * @param {string} publicationId
 * @param {object} [options]
 * @returns {Promise<object>} - Publication（status=withdrawn）或 204 空响应
 */
export async function withdrawPublication(publicationId, options = {}) {
  if (!publicationId) throw new TypeError("publicationId is required");
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, {
    type: "withdrawPublication",
    publicationId
  });

  try {
    return await del(
      `/api/v1/publications/${segment(publicationId)}`,
      { ...options, idempotencyKey }
    );
  } finally {
    completePendingOperation(idempotencyKey);
  }
}
