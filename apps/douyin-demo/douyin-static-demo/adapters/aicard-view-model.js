/**
 * AICard ViewModel Adapter
 * 内部复用的纯 AICard 适配器
 */

import { API_BASE_URL } from "../api/http-client.js";

/**
 * 将 AICard 转换为 AICardViewModel
 * @param {object} aicard - AICard 原始数据
 * @returns {object} - AICardViewModel
 */
export function adaptAICard(aicard) {
  if (!aicard) return null;

  const {
    status,
    title,
    summary,
    plan,
    alternatives = [],
    products = [],
    tutorials = [],
    validation = {},
    applied_constraints,
    constraints,
    warnings,
    notices = [],
    redactions = [],
    follow_up = null,
    judge_trace,
    trace = [],
    source_mode,
    render
  } = aicard;
  const resolvedWarnings =
    warnings ||
    notices
      .filter((notice) => notice.level !== "info")
      .map((notice) => notice.message);

  return {
    status,
    title: title || plan?.title || "",
    summary: summary || plan?.summary || "",
    sourceMode: source_mode || null,
    sourceBadge: getSourceBadge(source_mode),
    beforeImage: resolveMediaRef(render?.before_ref),
    afterImage: resolveMediaRef(render?.after_ref),
    renderDisclaimer: render?.disclaimer || "",
    isAiGenerated: render?.is_ai_generated === true,
    plan: plan ? adaptPlan(plan) : null,
    alternatives: alternatives.map(adaptAlternative),
    products: products.map(adaptProduct),
    steps: (aicard.steps || plan?.steps || []).map(adaptStep),
    tutorials: tutorials.map(adaptTutorial),
    validation: adaptValidation(validation),
    appliedConstraints: adaptAppliedConstraints(
      applied_constraints || constraints
    ),
    warnings: resolvedWarnings,
    notices,
    redactions: redactions || [],
    followUp: follow_up,
    judgeTrace: judge_trace || trace || []
  };
}

/**
 * 获取来源标识
 * @param {string} sourceMode - source_mode
 * @returns {string} - 来源标识文本
 */
function getSourceBadge(sourceMode) {
  if (!sourceMode) return "";
  const badges = {
    demo: "Demo",
    live: "实时",
    fallback: "已降级"
  };
  return badges[sourceMode] || sourceMode;
}

/**
 * 适配媒体引用
 * @param {string} ref - 媒体引用
 * @returns {string|null} - 完整 URL 或占位符引用
 */
export function resolveMediaRef(ref) {
  if (!ref) return null;
  if (ref.startsWith("asset://redacted/")) {
    return null;
  }
  if (ref.startsWith("asset://")) {
    return null;
  }
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return ref;
  }
  if (ref.startsWith("./assets/")) {
    const filename = ref.slice("./assets/".length);
    return new URL(
      `/ai-corner-renewal/apps/web/assets/${encodeURIComponent(filename)}`,
      API_BASE_URL
    ).toString();
  }
  return new URL(ref, API_BASE_URL).toString();
}

/**
 * 适配方案
 * @param {object} plan - 原始 plan
 * @returns {object} - 适配后的 plan
 */
function adaptPlan(plan) {
  if (!plan) return null;
  return {
    id: plan.plan_id || plan.id || "",
    title: plan.title || "",
    description: plan.description || "",
    summary: plan.summary || plan.description || "",
    totalPriceCny: plan.total_price_cny || 0,
    renderRef: resolveMediaRef(plan.render_ref),
    render: plan.render
      ? {
          beforeRef: resolveMediaRef(plan.render.before_ref),
          afterRef: resolveMediaRef(plan.render.after_ref)
        }
      : null,
    products: (plan.products || []).map(adaptProduct),
    productIds: plan.product_ids || [],
    steps: (plan.steps || []).map(adaptStep),
    dataSources: plan.data_sources || [],
    assumptions: plan.assumptions || []
  };
}

function adaptAlternative(alternative) {
  if (!alternative) return null;
  if (alternative.plan) {
    return {
      ...adaptPlan(alternative.plan),
      products: (alternative.products || []).map(adaptProduct),
      validation: adaptValidation(alternative.validation),
      beforeImage: resolveMediaRef(alternative.render?.before_ref),
      afterImage: resolveMediaRef(alternative.render?.after_ref)
    };
  }
  return adaptPlan(alternative);
}

/**
 * 适配商品
 * @param {object} product - 原始 product
 * @returns {object} - 适配后的 product
 */
function adaptProduct(product) {
  if (!product) return null;
  return {
    productId: product.product_id || "",
    name: product.name || "",
    priceCny: product.price_cny || 0,
    image: resolveMediaRef(product.image_ref),
    tags: product.tags || [],
    score: product.score || 0,
    shop: product.shop || product.source?.label || "结构化演示商品库",
    reason: product.reason || "",
    dimensionsLabel: product.dimensions_label || "",
    installation: product.installation || "",
    availability: product.availability || null,
    matchReasons: product.match_reasons || [],
    dataSources: product.data_sources || (product.source ? [product.source] : [])
  };
}

/**
 * 适配步骤
 * @param {object} step - 原始 step
 * @returns {object} - 适配后的 step
 */
function adaptStep(step) {
  if (!step) return null;
  return {
    id: step.step_id || step.id || "",
    title: step.title || "",
    description: step.instruction || step.description || "",
    image: resolveMediaRef(step.image_ref),
    order: step.order || 0
  };
}

/**
 * 适配教程
 * @param {object} tutorial - 原始 tutorial
 * @returns {object} - 适配后的 tutorial
 */
function adaptTutorial(tutorial) {
  if (!tutorial) return null;
  return {
    id: tutorial.content_id || tutorial.id || "",
    title: tutorial.title || "",
    author: tutorial.author || "",
    reason: tutorial.reason || "",
    url: tutorial.jump_url || tutorial.url || "",
    duration: tutorial.duration || 0,
    thumbnail: resolveMediaRef(tutorial.thumbnail_ref)
  };
}

/**
 * 适配校验结果
 * @param {object} validation - 原始 validation
 * @returns {object} - 适配后的 validation
 */
function adaptValidation(validation) {
  if (!validation) return {};
  const checks = validation.checks || validation.issues || [];
  return {
    isValid:
      validation.is_valid === true ||
      ["pass", "needs_confirmation"].includes(validation.overall_status),
    overallStatus: validation.overall_status || null,
    issues: checks,
    checks,
    warnings: validation.warnings || [],
    score: validation.score || 0
  };
}

/**
 * 适配应用的约束
 * @param {object} constraints - 原始 applied_constraints
 * @returns {object} - 适配后的 constraints
 */
function adaptAppliedConstraints(constraints) {
  if (!constraints) return {};
  const hardConstraints = constraints.hard_constraints || [];
  return {
    budgetCny: constraints.budget_cny || null,
    noDrilling:
      constraints.no_drilling === true ||
      hardConstraints.includes("no_drilling"),
    petContext:
      constraints.pet_context ||
      (hardConstraints.includes("pet_safe") ? "pet_safe" : "none")
  };
}
