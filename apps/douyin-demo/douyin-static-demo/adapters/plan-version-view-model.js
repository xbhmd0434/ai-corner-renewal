/**
 * PlanVersion ViewModel Adapter
 * 将 PlanVersionEnvelope 转换为 PlanResultViewModel
 * 符合 HANDOFF.md 8. PlanVersion 与 AICard 展示适配
 */

import { adaptAICard } from "./aicard-view-model.js";

/**
 * 将 PlanVersionEnvelope 转换为 PlanResultViewModel
 * @param {object} envelope - PlanVersionEnvelope
 * @returns {object} - PlanResultViewModel
 */
export function adaptPlanVersionEnvelope(envelope) {
  if (!envelope) return null;

  const {
    plan_asset_id,
    plan_resource_version,
    plan_version
  } = envelope;

  const aicard = plan_version?.aicard || {};
  const adaptedAICard = adaptAICard(aicard);

  const viewModel = {
    status: aicard.status || "unknown",
    planAssetId: plan_asset_id || null,
    planVersionId: plan_version?.plan_version_id || null,
    version: plan_version?.version || 1,
    planResourceVersion: plan_resource_version || null,
    sourceBadge: adaptedAICard?.sourceBadge || "",
    title: adaptedAICard?.title || "",
    summary: adaptedAICard?.summary || "",
    beforeImage: adaptedAICard?.beforeImage || null,
    afterImage: adaptedAICard?.afterImage || null,
    renderDisclaimer: adaptedAICard?.renderDisclaimer || "",
    isAiGenerated: adaptedAICard?.isAiGenerated === true,
    totalPriceCny: adaptedAICard?.plan?.totalPriceCny || 0,
    primaryPlan: adaptedAICard?.plan || null,
    alternatives: adaptedAICard?.alternatives || [],
    products: adaptedAICard?.products || [],
    steps: adaptedAICard?.steps || [],
    tutorials: adaptedAICard?.tutorials || [],
    validation: adaptedAICard?.validation || {},
    appliedConstraints: adaptedAICard?.appliedConstraints || {},
    warnings: adaptedAICard?.warnings || [],
    notices: adaptedAICard?.notices || [],
    redactions: plan_version?.redactions || [],
    followUp: adaptedAICard?.followUp || [],
    judgeTrace: adaptedAICard?.judgeTrace || {},
    designRequestSnapshot: plan_version?.design_request_snapshot || {},
    canSave: !!plan_asset_id,
    canRevise: !!plan_asset_id,
    canSelectVersion: !!plan_asset_id
  };

  return viewModel;
}

/**
 * 处理 plan=null 的情况
 * @param {object} envelope - PlanVersionEnvelope（plan_version.aicard 存在但 plan=null）
 * @returns {object} - PlanResultViewModel
 */
export function adaptPlanNullEnvelope(envelope) {
  if (!envelope) return null;

  const aicard = envelope.plan_version?.aicard || {};
  const adaptedAICard = adaptAICard(aicard);

  return {
    status: aicard.status || "needs_input",
    planAssetId: null,
    planVersionId: envelope.plan_version?.plan_version_id || null,
    version: 1,
    planResourceVersion: null,
    sourceBadge: adaptedAICard?.sourceBadge || "",
    title: adaptedAICard?.title || "",
    summary: adaptedAICard?.summary || "",
    beforeImage: adaptedAICard?.beforeImage || null,
    afterImage: null,
    renderDisclaimer: adaptedAICard?.renderDisclaimer || "",
    isAiGenerated: adaptedAICard?.isAiGenerated === true,
    totalPriceCny: 0,
    primaryPlan: null,
    alternatives: [],
    products: [],
    steps: [],
    tutorials: [],
    validation: adaptedAICard?.validation || {},
    appliedConstraints: adaptedAICard?.appliedConstraints || {},
    warnings: adaptedAICard?.warnings || [],
    notices: adaptedAICard?.notices || [],
    redactions: envelope.plan_version?.redactions || [],
    followUp: adaptedAICard?.followUp || [],
    judgeTrace: adaptedAICard?.judgeTrace || {},
    designRequestSnapshot: envelope.plan_version?.design_request_snapshot || {},
    canSave: false,
    canRevise: false,
    canSelectVersion: false
  };
}

/**
 * 判断是否为 plan=null 的情况
 * @param {object} envelope - PlanVersionEnvelope
 * @returns {boolean} - 是否为 plan=null
 */
export function isPlanNull(envelope) {
  if (!envelope?.plan_version?.aicard) return false;
  return envelope.plan_version.aicard.status === "needs_input" && !envelope.plan_version.aicard.plan;
}

/**
 * 统一入口：根据不同情况选择适配方式
 * @param {object} envelope - PlanVersionEnvelope
 * @returns {object} - PlanResultViewModel
 */
export function adaptPlanResult(envelope) {
  if (!envelope) return null;

  if (isPlanNull(envelope)) {
    return adaptPlanNullEnvelope(envelope);
  }

  return adaptPlanVersionEnvelope(envelope);
}

/**
 * 获取显示价格
 * @param {number} priceCny - 价格（整数元）
 * @returns {string} - 格式化后的价格
 */
export function formatPrice(priceCny) {
  if (priceCny === null || priceCny === undefined) return "";
  return `¥${priceCny}`;
}

/**
 * 获取显示总价
 * @param {number} totalPriceCny - 总价（整数元）
 * @returns {string} - 格式化后的总价
 */
export function formatTotalPrice(totalPriceCny) {
  if (totalPriceCny === null || totalPriceCny === undefined || totalPriceCny === 0) return "";
  return `¥${totalPriceCny}`;
}

/**
 * 获取状态显示文本
 * @param {string} status - AICard.status
 * @returns {string} - 状态文本
 */
export function getStatusText(status) {
  const statusMap = {
    ready: "优化完成",
    fallback_ready: "优化完成（已降级）",
    needs_input: "需要补充信息",
    running: "生成中",
    failed: "生成失败",
    cancelled: "已取消"
  };
  return statusMap[status] || "未知";
}

/**
 * 获取状态样式类
 * @param {string} status - AICard.status
 * @returns {string} - CSS 类名
 */
export function getStatusClass(status) {
  const classMap = {
    ready: "status-ready",
    fallback_ready: "status-fallback",
    needs_input: "status-warning",
    running: "status-running",
    failed: "status-error",
    cancelled: "status-cancelled"
  };
  return classMap[status] || "status-unknown";
}
