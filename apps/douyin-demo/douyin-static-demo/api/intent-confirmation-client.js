/**
 * Intent Confirmation Client (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 5.2 节路由：
 *   POST /api/v1/assets/{asset_id}/intent-confirmations
 *     operationId = confirmInspirationIntent
 *
 * 协议第 4 节：POST 必须带 Idempotency-Key；schema_version=1.0；
 * V2.1 新对象响应额外携带 contract_version="renewal-card/2.1"。
 *
 * 该路由当前未在后端实现（health.features.renewal_intent_v2=false），
 * 调用方必须先经 `capabilityGate.require(V2_CAPABILITIES.RENEWAL_INTENT_V2)`，
 * 否则不得调用本客户端。capability 不可用时改用 canonical fixture。
 */

import {
  post,
  generateIdempotencyKey,
  createPendingOperation,
  completePendingOperation
} from "./http-client.js";

function segment(value) {
  return encodeURIComponent(String(value));
}

/**
 * 用户确认/纠正组件或风格意图。
 *
 * 协议 6.1 请求体：
 * ```json
 * {
 *   "schema_version": "1.0",
 *   "resource_version": 2,
 *   "intent_type": "component",
 *   "summary": "奶油白陶瓷花瓶"
 * }
 * ```
 * `intent_type` 仅允许 `component | style`。
 *
 * @param {string} assetId - InspirationAsset ID
 * @param {object} body - { resource_version, intent_type, summary }
 * @param {number} body.resource_version - 当前 InspirationAsset.resource_version
 * @param {"component"|"style"} body.intent_type
 * @param {string} [body.summary]
 * @param {object} [options]
 * @returns {Promise<object>} - 更新后的 InspirationAsset（含 confirmed_intent）
 */
export async function confirmInspirationIntent(assetId, body, options = {}) {
  if (!assetId) throw new TypeError("assetId is required");
  if (!body || !body.resource_version) {
    throw new TypeError("resource_version is required for intent confirmation");
  }
  if (body.intent_type !== "component" && body.intent_type !== "style") {
    throw new TypeError("intent_type must be 'component' or 'style'");
  }

  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, {
    type: "confirmInspirationIntent",
    assetId
  });

  try {
    const payload = {
      schema_version: "1.0",
      resource_version: Number(body.resource_version),
      intent_type: body.intent_type,
      summary: typeof body.summary === "string" ? body.summary : ""
    };
    return await post(
      `/api/v1/assets/${segment(assetId)}/intent-confirmations`,
      payload,
      { ...options, idempotencyKey }
    );
  } finally {
    completePendingOperation(idempotencyKey);
  }
}
