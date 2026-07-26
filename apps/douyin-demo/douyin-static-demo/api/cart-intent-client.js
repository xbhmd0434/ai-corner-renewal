/**
 * Cart Intent Client (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 5.2 节路由：
 *   POST /api/v1/product-discovery-runs/{product_discovery_run_id}/cart-intents
 *     operationId = createCartIntent
 *
 * 协议第 4 节：POST 必须带 Idempotency-Key；schema_version=1.0；
 * V2.1 新对象响应携带 contract_version="renewal-card/2.1"。
 * 协议 6.5：CartIntent 只生成宿主交接，不是订单；前端不得根据商品 ID 拼链接。
 *
 * 该路由当前未在后端实现（health.features.cart_batch_handoff=false），
 * 调用方必须先经 `capabilityGate.require(V2_CAPABILITIES.CART_BATCH_HANDOFF)`，
 * 否则不得调用本客户端。capability 不可用时只保留逐项 CommerceAction，
 * 不显示“一键加入购物车”成功。
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
 * 校验选中项并生成宿主交接 token。
 *
 * 协议 6.5 请求体：
 * ```json
 * {
 *   "schema_version": "1.0",
 *   "items": [
 *     { "list_item_id": "implementation-item-001", "match_id": "match-001", "quantity": 1 }
 *   ]
 * }
 * ```
 *
 * 响应 action.type ∈ `douyin_cart_batch | search_bundle | unavailable`。
 * `unavailable` 时前端不得显示“已加入购物车”，只能逐项处理。
 *
 * @param {string} productDiscoveryRunId
 * @param {object} body
 * @param {Array} body.items - [{ list_item_id, match_id, quantity }]
 * @param {object} [options]
 * @returns {Promise<object>} - CartIntent
 */
export async function createCartIntent(productDiscoveryRunId, body, options = {}) {
  if (!productDiscoveryRunId) {
    throw new TypeError("productDiscoveryRunId is required");
  }
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    throw new TypeError("body.items must be a non-empty array");
  }

  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, {
    type: "createCartIntent",
    productDiscoveryRunId
  });

  try {
    const items = body.items.map((item) => ({
      list_item_id: String(item.list_item_id),
      match_id: String(item.match_id),
      quantity: Math.max(1, Number(item.quantity) || 1)
    }));
    const payload = {
      schema_version: "1.0",
      items
    };
    return await post(
      `/api/v1/product-discovery-runs/${segment(productDiscoveryRunId)}/cart-intents`,
      payload,
      { ...options, idempotencyKey }
    );
  } finally {
    completePendingOperation(idempotencyKey);
  }
}
