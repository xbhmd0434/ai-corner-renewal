import { randomUUID } from "node:crypto";
import { products as demoProducts } from "../data/demo-catalog.js";
import { DEMO_COMMERCE_CATEGORY_CODES } from "./commerce-catalog.js";

const AGENT_PROMPT_VERSION = "product-discovery-agent/1.0";

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 502;
  return error;
}

function productFor(context, productId) {
  return (context.aicard?.products || []).find(
    (product) => product.product_id === productId
  ) || demoProducts[productId] || null;
}

function plannedItemsForAgent(context) {
  const planVersion = context.planVersion || {};
  const roles = planVersion.implementation_source_roles || [];
  const placements = context.placements || context.aicard?.plan?.placements || [];
  const placementByProduct = new Map(
    placements.map((placement) => [placement.product_id, placement])
  );
  const productIds = [
    ...new Set([
      ...roles.map((item) => item.product_id),
      ...placements.map((item) => item.product_id)
    ].filter(Boolean))
  ];

  return productIds
    .slice(0, 8)
    .map((productId) => {
      const product = productFor(context, productId);
      if (!product || !DEMO_COMMERCE_CATEGORY_CODES.includes(product.category)) {
        return null;
      }
      const placement = placementByProduct.get(productId);
      const role = roles.find((item) => item.product_id === productId);
      if (role?.role === "video_selected") return null;
      return {
        label: product.name,
        category_code: product.category,
        origin_role: role?.role || "ai_supplement",
        placement_hint: placement?.zone || placement?.instruction || ""
      };
    })
    .filter(Boolean)
    .map((item, index) => ({
      subject_ref: `planned-${index + 1}`,
      ...item
    }));
}

function discoveryPrompt(context, limits) {
  const maxSubjects = Math.max(1, Math.min(Number(limits?.maxSubjects) || 6, 8));
  const plannedItems = plannedItemsForAgent(context);
  const sourceComponent =
    context.planVersion?.pipeline_artifacts?.source_component || null;
  return [
    "用户亲自从视频圈选的 SourceComponent 已有稳定资产身份，不属于本次识别目标。即使它在效果图中非常醒目，也绝对不要输出它；只输出除此之外的补充商品。",
    "你是“商品发现视觉 Agent”。你的工作不是设计空间，而是从焕新后的效果图中定位真正需要落地购买的可移动物品。",
    "优先定位下方 planned_items 中已经由方案确定要新增的物品；只有画面明确出现时才返回。",
    "可以补充最多 2 个画面清晰、可独立购买的软装小物，但不要把用户原有的桌子、显示器、椅子、墙、窗、门、插座或固定柜体列为购买对象。",
    "你只拥有视觉识别和搜索意图：绝对不能输出 product_id、SKU、价格、库存、店铺、销量、品牌、购买链接或“同款”结论。",
    `最多返回 ${maxSubjects} 个 subjects。category_code 只能从以下代码中选择：${DEMO_COMMERCE_CATEGORY_CODES.join(", ")}。`,
    "bbox 是相对整张效果图的归一化坐标 {x,y,width,height}，各值在 0..1 内且不能超出画面；无法可靠定位时写 null。",
    "commerce_search_queries 使用中文，每个对象 1～3 条，只描述品类、颜色、材质、风格、用途，不包含平台名、店铺或价格。",
    "confidence 只表示视觉识别置信度。不要因为 planned_items 存在就伪造图片证据。",
    "严格输出一个 JSON 对象，不要 Markdown，不要解释，不要增加字段：",
    '{"schema_version":"1.0","subjects":[{"subject_ref":"planned-1 或 supplement-1","label":"字符串","category_code":"允许的代码","bbox":{"x":0.1,"y":0.1,"width":0.2,"height":0.2},"appearance":{"colors":["字符串"],"materials":["字符串"],"style_keywords":["字符串"]},"placement_hint":"字符串","confidence":0.0,"commerce_search_queries":["字符串"]}]}',
    `场景类型：${context.sceneType || "desk_corner"}`,
    `方案标题：${context.planTitle || "未命名方案"}`,
    `planned_items：${JSON.stringify(plannedItems)}`,
    `excluded_source_component：${JSON.stringify(
      sourceComponent
        ? {
            source_component_id: sourceComponent.source_component_id,
            label: sourceComponent.label,
            category_code: sourceComponent.category_code,
            colors: sourceComponent.colors || [],
            materials: sourceComponent.materials || []
          }
        : null
    )}`
  ].join("\n");
}

function assistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("")
      .trim();
    if (text) return text;
  }
  throw providerError(
    "product_discovery_contract_invalid",
    "商品发现 Agent 没有返回可读取的 JSON"
  );
}

async function readBoundedPayload(response, limitBytes) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw providerError(
      "product_discovery_response_too_large",
      "商品发现 Agent 响应超过大小限制"
    );
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    throw providerError(
      "product_discovery_contract_invalid",
      "商品发现 Agent 响应正文不可读取"
    );
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > limitBytes) {
        try {
          await reader.cancel();
        } catch {
          // 响应大小错误优先。
        }
        throw providerError(
          "product_discovery_response_too_large",
          "商品发现 Agent 响应超过大小限制"
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw providerError(
      "product_discovery_contract_invalid",
      "商品发现 Agent 上游响应不是有效 JSON"
    );
  }
}

function parseAgentJson(payload) {
  let parsed;
  try {
    parsed = JSON.parse(assistantContent(payload));
  } catch (error) {
    if (error?.code) throw error;
    throw providerError(
      "product_discovery_contract_invalid",
      "商品发现 Agent 输出不是有效 JSON"
    );
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.subjects)) {
    throw providerError(
      "product_discovery_contract_invalid",
      "商品发现 Agent 输出缺少 subjects"
    );
  }
  return parsed;
}

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
    const excludedProductIds = new Set(
      (planVersion?.implementation_source_roles || [])
        .filter((item) => item.role === "video_selected")
        .map((item) => item.product_id)
    );

    // 为每个 placement 创建 subject
    for (const placement of placements) {
      if (subjects.length >= maxSubjects) break;
      if (excludedProductIds.has(placement.product_id)) continue;

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
        if (excludedProductIds.has(productId)) continue;

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
 * AgentPlanProductDiscoveryProvider
 *
 * 复用火山方舟多模态 Chat API：看 after 图、定位方案新增物、生成受限搜索意图。
 * 商品事实仍由 CommerceCatalogAdapter 和确定性 grounding 拥有。
 */
export class AgentPlanProductDiscoveryProvider {
  constructor({ config, fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async discover({ image, context, limits, requestedMode = "auto" }) {
    if (this.config?.backendMode === "demo" || requestedMode === "demo") {
      return new PlanGroundedDiscoveryProvider().discover({ context, limits });
    }
    if (!this.config?.agentPlanApiKey) {
      throw providerError(
        "product_discovery_not_configured",
        "未配置 AGENT_PLAN_API_KEY"
      );
    }
    if (
      !image ||
      typeof image.dataUrl !== "string" ||
      !image.dataUrl.startsWith("data:image/")
    ) {
      throw providerError(
        "product_discovery_image_unavailable",
        "效果图无法提供给商品发现 Agent"
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.agentPlanDiscoveryTimeoutMs ?? 45_000
    );
    try {
      const response = await this.fetchImpl(
        `${this.config.agentPlanBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.agentPlanApiKey}`,
            "Content-Type": "application/json"
          },
          redirect: "error",
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.agentPlanTextModel,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: image.dataUrl }
                  },
                  {
                    type: "text",
                    text: discoveryPrompt(context || {}, limits)
                  }
                ]
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 1800
          })
        }
      );

      if (!response.ok) {
        try {
          await response.body?.cancel();
        } catch {
          // HTTP 状态优先。
        }
        const code =
          response.status === 401 || response.status === 403
            ? "product_discovery_unauthorized"
            : response.status === 429
              ? "product_discovery_rate_limited"
              : "product_discovery_upstream_error";
        throw providerError(
          code,
          `商品发现 Agent 返回 HTTP ${response.status}`
        );
      }

      const payload = await readBoundedPayload(
        response,
        this.config.agentPlanDiscoveryResponseLimitBytes ?? 512 * 1024
      );
      const output = parseAgentJson(payload);
      const excludedCategory =
        context?.planVersion?.pipeline_artifacts?.source_component
          ?.category_code || null;
      return {
        sourceType: "live",
        strategy: "image_agent",
        provider: "volcengine_agent_plan",
        model: this.config.agentPlanTextModel,
        promptVersion: AGENT_PROMPT_VERSION,
        subjects: excludedCategory
          ? output.subjects.filter(
              (subject) => subject.category_code !== excludedCategory
            )
          : output.subjects
      };
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        throw providerError(
          "product_discovery_timeout",
          "商品发现 Agent 调用超时"
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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
  "shop", "store", "seller", "brand", "sales", "sales_volume", "platform",
  "link", "url", "buy", "purchase"
];
const ALLOWED_SUBJECT_FIELDS = new Set([
  "subject_ref",
  "label",
  "category_code",
  "bbox",
  "appearance",
  "placement_hint",
  "confidence",
  "commerce_search_queries"
]);
const ALLOWED_APPEARANCE_FIELDS = new Set([
  "colors",
  "materials",
  "style_keywords"
]);

const MAX_SUBJECTS = 8;
const MAX_QUERIES_PER_SUBJECT = 3;
const MAX_LABEL_LENGTH = 200;
const MAX_QUERY_LENGTH = 200;
const MAX_APPEARANCE_ITEMS = 10;
const MAX_APPEARANCE_ITEM_LENGTH = 50;
const ALLOWED_CATEGORY_CODES = new Set(DEMO_COMMERCE_CATEGORY_CODES);

function containsForbiddenAgentField(value) {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_AGENT_FIELDS.includes(key.toLowerCase())) return key;
    const found = containsForbiddenAgentField(nested);
    if (found) return found;
  }
  return null;
}

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
    const forbiddenField = containsForbiddenAgentField(subject);
    if (forbiddenField) {
      issues.push(`${path} 包含禁止字段 ${forbiddenField}（Agent 不能输出商品事实）`);
    }
    for (const field of Object.keys(subject)) {
      if (!ALLOWED_SUBJECT_FIELDS.has(field)) {
        issues.push(`${path} 包含协议外字段 ${field}`);
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
    } else if (!ALLOWED_CATEGORY_CODES.has(subject.category_code.trim())) {
      issues.push(`${path}.category_code 不在商品目录允许范围`);
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
        if (
          typeof x === "number" &&
          typeof y === "number" &&
          typeof width === "number" &&
          typeof height === "number" &&
          (x + width > 1 || y + height > 1)
        ) {
          issues.push(`${path}.bbox 超出图片边界`);
        }
      }
    }

    // 校验 appearance
    if (subject.appearance) {
      if (typeof subject.appearance !== "object" || Array.isArray(subject.appearance)) {
        issues.push(`${path}.appearance 必须是对象`);
      } else {
        for (const field of Object.keys(subject.appearance)) {
          if (!ALLOWED_APPEARANCE_FIELDS.has(field)) {
            issues.push(`${path}.appearance 包含协议外字段 ${field}`);
          }
        }
      }
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
