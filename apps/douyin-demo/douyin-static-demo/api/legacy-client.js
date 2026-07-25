/**
 * Legacy Client
 * 兼容现有 /api/health, /api/generate, /api/revise 接口
 * 用于验证 HTTP Client 和内部 AICard Adapter
 */

import { get, post, generateIdempotencyKey, createPendingOperation, completePendingOperation } from "./http-client.js";

/**
 * 检查健康状态
 * @returns {Promise<object>}
 */
export async function checkHealth() {
  return await get("/api/health");
}

/**
 * 生成 AICard（同步返回）
 * @param {object} requestBody - GenerateRequest
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - AICard
 */
export async function generateAICard(requestBody, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "generate", requestBody });

  try {
    const result = await post("/api/generate", requestBody, {
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
 * 修订方案（降低预算）
 * @param {object} requestBody - ReviseRequest
 * @param {object} options - 请求选项
 * @returns {Promise<object>} - AICard
 */
export async function revisePlan(requestBody, options = {}) {
  const idempotencyKey = generateIdempotencyKey();
  createPendingOperation(idempotencyKey, { type: "revise", requestBody });

  try {
    const result = await post("/api/revise", requestBody, {
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
 * 将 Legacy AICard 包装为临时 PlanVersionEnvelope
 * 用于统一结果适配
 * @param {object} aiCard - Legacy AICard
 * @returns {object} - PlanVersionEnvelope
 */
export function wrapLegacyAICard(aiCard) {
  return {
    plan_asset_id: null,
    plan_resource_version: null,
    plan_version: {
      plan_version_id: `legacy-${Date.now()}`,
      version: 1,
      design_request_snapshot: {},
      redactions: [],
      aicard: aiCard
    }
  };
}
