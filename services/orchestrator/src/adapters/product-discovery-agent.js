import { randomUUID } from "node:crypto";
import { products as demoProducts } from "../data/demo-catalog.js";

/**
 * ProductDiscoveryProvider Port
 *
 * Prompt 负责人后续实现 Live Provider 时必须遵守此接口：
 *
 * async discover({ image, context, limits, requestedMode }) {
 *   return {
 *     sourceType: "live",
 *     provider: "provider-name",
 *     model: "model-name",
 *     promptVersion: "prompt-version",
 *     subjects: []
 *   };
 * }
 */

/**
 * UnconfiguredProductDiscoveryProvider
 * - 不发送网络请求
 * - 返回 product_discovery_not_configured
 * - Service 决定是否 fallback
 */
export class UnconfiguredProductDiscoveryProvider {
  async discover() {
    const error = new Error("Product Discovery Agent 尚未配置");
    error.code = "product_discovery_not_configured";
    error.statusCode = 502;
    throw error;
  }
}

/**
 * PlanGroundedDiscoveryProvider
 *
 * 读取当前 PlanVersion 的 placements 和 products，构造 bbox=null 的 subjects。
 * 只使用已有 plan product_id；搜索词来自可信品类和名称的受限拼接。
 * 返回 sourceType=fallback、strategy=plan_grounded。
 */
export class PlanGroundedDiscoveryProvider {
  constructor({ repository, now = () => new Date() } = {}) {
    this.repository = repository;
    this.now = now;
  }

  async discover({ context, limits }) {
    const maxSubjects = Math.min(limits?.maxSubjects || 6, 8);

    const subjects = [];
    const seenLabels = new Set();

    // 从 PlanVersion 获取 plan data
    let planVersion;
    try {
      // 尝试通过 context 中的 planVersionId 查找 PlanVersion
      planVersion = context.planVersion;
    } catch {
      // 如果无法获取，返回空
    }

    // 从 AICard 的 placements 和 products 构造 subjects
    const aicard = context.aicard || planVersion?.aicard || {};
    const plan = aicard.plan || {};
    const planProducts = aicard.products || [];
    const placements = plan.placements || [];
    const productIds = plan.product_ids || [];

    // 为每个 placement 创建 subject
    for (const placement of placements) {
      if (subjects.length >= maxSubjects) break;

      const product = planProducts.find((p) => p.product_id === placement.product_id)
        || demoProducts[placement.product_id];

      if (!product) continue;

      const label = product.name || `方案商品 ${placement.product_id}`;
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      const searchQueries = [product.name].filter(Boolean);
      if (product.category) {
        searchQueries.push(`${product.name} ${product.category}`);
      }

      subjects.push({
        subject_ref: `subject_pg_${subjects.length + 1}`,
        label,
        category_code: product.category || "uncategorized",
        bbox: null,  // plan-grounded 时 bbox 必须为 null
        appearance: {
          colors: [],
          materials: [],
          style_keywords: []
        },
        placement_hint: placement.zone || placement.instruction || "",
        confidence: null,
        commerce_search_queries: searchQueries.slice(0, 3)
      });
    }

    // 如果没有 placements，从 product_ids 构造
    if (subjects.length === 0) {
      for (const productId of productIds) {
        if (subjects.length >= maxSubjects) break;

        const product = planProducts.find((p) => p.product_id === productId)
          || demoProducts[productId];
        if (!product) continue;

        const label = product.name || `方案商品 ${productId}`;
        if (seenLabels.has(label)) continue;
        seenLabels.add(label);

        subjects.push({
          subject_ref: `subject_pg_${subjects.length + 1}`,
          label,
          category_code: product.category || "uncategorized",
          bbox: null,
          appearance: {
            colors: [],
            materials: [],
            style_keywords: []
          },
          placement_hint: "",
          confidence: null,
          commerce_search_queries: [product.name].filter(Boolean).slice(0, 3)
        });
      }
    }

    return {
      sourceType: "fallback",
      strategy: "plan_grounded",
      provider: null,
      model: null,
      promptVersion: null,
      subjects
    };
  }
}

/**
 * Agent 输出校验器
 *
 * 后端必须：
 * - 校验 JSON、字段长度、数组上限和 bbox
 * - 为 subject 分配服务端稳定 ID
 * - 拒绝 Agent 输出的任何 product_id、价格、库存、店铺和链接
 * - 对 search query 做长度和字符规范化
 * - 不信任 Agent 的 category 或 confidence
 */
const FORBIDDEN_AGENT_FIELDS = [
  "product_id", "sku", "price", "price_cny", "stock", "inventory",
  "shop", "store", "link", "url", "buy", "purchase"
];

const MAX_SUBJECTS = 8;
const MAX_QUERIES_PER_SUBJECT = 3;
const MAX_LABEL_LENGTH = 200;
const MAX_QUERY_LENGTH = 200;
const MAX_APPEARANCE_ITEMS = 10;
const MAX_APPEARANCE_ITEM_LENGTH = 50;

export function validateAgentOutput(output, maxSubjects = MAX_SUBJECTS) {
  const issues = [];

  if (!output || typeof output !== "object") {
    return { valid: false, error: "Agent 输出必须是对象", subjects: [] };
  }

  if (output.schema_version !== "1.0") {
    issues.push("schema_version 必须为 1.0");
  }

  if (!Array.isArray(output.subjects)) {
    return { valid: false, error: "subjects 必须是数组", subjects: [], issues };
  }

  if (output.subjects.length > maxSubjects) {
    issues.push(`subjects 数量 ${output.subjects.length} 超过上限 ${maxSubjects}`);
  }

  const validSubjects = [];
  const seenRefs = new Set();

  for (const [index, subject] of output.subjects.entries()) {
    const path = `subjects[${index}]`;
    if (!subject || typeof subject !== "object") {
      issues.push(`${path} 必须是对象`);
      continue;
    }

    // 检查禁止字段
    for (const field of FORBIDDEN_AGENT_FIELDS) {
      if (subject[field] !== undefined) {
        issues.push(`${path} 包含禁止字段 ${field}（Agent 不能输出商品事实）`);
      }
    }

    // 检查必要字段
    if (!subject.subject_ref || typeof subject.subject_ref !== "string") {
      issues.push(`${path}.subject_ref 必须是非空字符串`);
      continue;
    }
    if (seenRefs.has(subject.subject_ref)) {
      issues.push(`${path}.subject_ref 重复`);
      continue;
    }
    seenRefs.add(subject.subject_ref);

    // 校验 label
    if (typeof subject.label !== "string" || !subject.label.trim()) {
      issues.push(`${path}.label 必须是非空字符串`);
    } else if (subject.label.length > MAX_LABEL_LENGTH) {
      issues.push(`${path}.label 长度超过 ${MAX_LABEL_LENGTH}`);
    }

    // 校验 category_code
    if (typeof subject.category_code !== "string" || !subject.category_code.trim()) {
      issues.push(`${path}.category_code 必须是非空字符串`);
    }

    // 校验 bbox
    if (subject.bbox !== null) {
      if (typeof subject.bbox !== "object") {
        issues.push(`${path}.bbox 必须是对象或 null`);
      } else {
        const { x, y, width, height } = subject.bbox;
        for (const [coord, val] of [["x", x], ["y", y]]) {
          if (typeof val !== "number" || val < 0 || val > 1) {
            issues.push(`${path}.bbox.${coord} 必须在 0..1 范围内`);
          }
        }
        for (const [dim, val] of [["width", width], ["height", height]]) {
          if (typeof val !== "number" || val <= 0 || val > 1) {
            issues.push(`${path}.bbox.${dim} 必须 > 0 且 ≤ 1`);
          }
        }
      }
    }

    // 校验 appearance
    if (subject.appearance) {
      for (const key of ["colors", "materials", "style_keywords"]) {
        if (Array.isArray(subject.appearance[key])) {
          if (subject.appearance[key].length > MAX_APPEARANCE_ITEMS) {
            issues.push(`${path}.appearance.${key} 超过 ${MAX_APPEARANCE_ITEMS} 项`);
          }
          for (const item of subject.appearance[key]) {
            if (typeof item === "string" && item.length > MAX_APPEARANCE_ITEM_LENGTH) {
              issues.push(`${path}.appearance.${key} 项过长`);
              break;
            }
          }
        }
      }
    }

    // 校验 search queries
    if (!Array.isArray(subject.commerce_search_queries)) {
      issues.push(`${path}.commerce_search_queries 必须是数组`);
    } else {
      if (subject.commerce_search_queries.length > MAX_QUERIES_PER_SUBJECT) {
        issues.push(`${path} 的 search queries 超过 ${MAX_QUERIES_PER_SUBJECT} 个`);
      }
      for (const [qi, query] of subject.commerce_search_queries.entries()) {
        if (typeof query !== "string" || !query.trim()) {
          issues.push(`${path}.commerce_search_queries[${qi}] 必须是有效搜索词`);
        } else if (query.length > MAX_QUERY_LENGTH) {
          issues.push(`${path}.commerce_search_queries[${qi}] 长度超过 ${MAX_QUERY_LENGTH}`);
        }
      }
    }

    // 校验 confidence
    if (subject.confidence !== undefined && subject.confidence !== null) {
      if (typeof subject.confidence !== "number" || subject.confidence < 0 || subject.confidence > 1) {
        issues.push(`${path}.confidence 必须在 0..1 范围`);
      }
    }

    // 分配服务端稳定 ID
    validSubjects.push({
      subject_id: `subject-${randomUUID()}`,
      subject_ref: subject.subject_ref,
      label: (subject.label || "").trim(),
      category_code: (subject.category_code || "uncategorized").trim(),
      bbox: subject.bbox || null,
      appearance: {
        colors: (subject.appearance?.colors || []).slice(0, MAX_APPEARANCE_ITEMS),
        materials: (subject.appearance?.materials || []).slice(0, MAX_APPEARANCE_ITEMS),
        style_keywords: (subject.appearance?.style_keywords || []).slice(0, MAX_APPEARANCE_ITEMS)
      },
      placement_hint: (subject.placement_hint || "").trim(),
      confidence: typeof subject.confidence === "number" ? subject.confidence : null,
      search_queries: (subject.commerce_search_queries || [])
        .slice(0, MAX_QUERIES_PER_SUBJECT)
        .map((q) => (q || "").trim().slice(0, MAX_QUERY_LENGTH))
        .filter(Boolean),
      match_state: "unmatched",
      matches: []
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    subjects: validSubjects
  };
}
