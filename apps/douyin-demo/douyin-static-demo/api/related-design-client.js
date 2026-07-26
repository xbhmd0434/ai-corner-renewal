/**
 * Related Design Client (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 5.2 节路由：
 *   POST   /api/v1/design-requests/{design_request_id}/related-design-runs
 *     operationId = createRelatedDesignRun
 *   GET    /api/v1/design-requests/{design_request_id}/related-design-runs
 *     operationId = listRelatedDesignRuns
 *   GET    /api/v1/related-design-runs/{related_design_run_id}
 *     operationId = getRelatedDesignRun
 *   POST   /api/v1/related-design-runs/{related_design_run_id}/cancel
 *     operationId = cancelRelatedDesignRun
 *
 * 协议第 4 节：POST 创建/取消必须带 Idempotency-Key；异步创建返回 202；
 * schema_version=1.0；V2.1 新对象响应携带 contract_version="renewal-card/2.1"。
 *
 * 该路由当前未在后端实现（health.features.related_designs=false），
 * 调用方必须先经 `capabilityGate.require(V2_CAPABILITIES.RELATED_DESIGNS)`，
 * 否则不得调用本客户端。capability 不可用时改用 canonical fixture。
 */

import {
  API_BASE_URL,
  get,
  post,
  generateIdempotencyKey,
  createPendingOperation,
  completePendingOperation
} from "./http-client.js";

function segment(value) {
  return encodeURIComponent(String(value));
}

/**
 * 创建相关设计运行。与 GenerationRun 并发、独立成功或失败，互不阻塞。
 *
 * 协议 6.3 请求体：
 * ```json
 * {
 *   "schema_version": "1.0",
 *   "reason": "initial",
 *   "options": { "limit": 12, "sources": ["douyin", "user_publication"] }
 * }
 * ```
 *
 * @param {string} designRequestId
 * @param {object} [body]
 * @param {string} [body.reason="initial"]
 * @param {object} [body.options] - { limit, sources }
 * @param {object} [options]
 * @returns {Promise<object>} - RelatedDesignRun
 */
export async function createRelatedDesignRun(
  designRequestId,
  body = { schema_version: "1.0", reason: "initial" },
  options = {}
) {
  if (!designRequestId) throw new TypeError("designRequestId is required");
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, {
    type: "createRelatedDesignRun",
    designRequestId
  });

  try {
    return await post(
      `/api/v1/design-requests/${segment(designRequestId)}/related-design-runs`,
      body,
      { ...options, idempotencyKey }
    );
  } finally {
    completePendingOperation(idempotencyKey);
  }
}

/**
 * 列出某 DesignRequest 下的相关设计运行，用于刷新恢复。
 * 协议 7.3：恢复时先 GET/List，不自动创建第二个 initial。
 *
 * @param {string} designRequestId
 * @param {object} [params] - { limit, cursor, sort }
 * @param {object} [options]
 * @returns {Promise<object>} - { items: RelatedDesignRun[] }
 */
export async function listRelatedDesignRuns(
  designRequestId,
  params = {},
  options = {}
) {
  if (!designRequestId) throw new TypeError("designRequestId is required");
  const url = new URL(
    `/api/v1/design-requests/${segment(designRequestId)}/related-design-runs`,
    API_BASE_URL
  );
  const normalized = {
    sort: params.sort ?? "recent",
    limit: params.limit ?? 5,
    cursor: params.cursor
  };
  for (const [key, value] of Object.entries(normalized)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return get(url.pathname + url.search, options);
}

/**
 * 轮询相关设计运行完整结果。
 *
 * @param {string} relatedDesignRunId
 * @param {object} [options]
 * @returns {Promise<object>} - RelatedDesignRun
 */
export async function getRelatedDesignRun(relatedDesignRunId, options = {}) {
  if (!relatedDesignRunId) throw new TypeError("relatedDesignRunId is required");
  return get(
    `/api/v1/related-design-runs/${segment(relatedDesignRunId)}`,
    options
  );
}

/**
 * 明确取消相关设计运行。
 *
 * @param {string} relatedDesignRunId
 * @param {object} [options]
 * @returns {Promise<object>} - RelatedDesignRun（status=cancelled）
 */
export async function cancelRelatedDesignRun(relatedDesignRunId, options = {}) {
  if (!relatedDesignRunId) throw new TypeError("relatedDesignRunId is required");
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, {
    type: "cancelRelatedDesignRun",
    relatedDesignRunId
  });

  try {
    return await post(
      `/api/v1/related-design-runs/${segment(relatedDesignRunId)}/cancel`,
      { schema_version: "1.0" },
      { ...options, idempotencyKey }
    );
  } finally {
    completePendingOperation(idempotencyKey);
  }
}
