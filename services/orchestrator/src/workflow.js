import { randomUUID } from "node:crypto";
import {
  SCHEMA_VERSION,
  assertAICard,
  assertGenerateRequest,
  assertReviseRequest
} from "../../../packages/contracts/src/index.js";
import { validateDesignPlan } from "../../../packages/validation/src/index.js";
import {
  dataSources,
  defaultRoomProfile,
  inspirations,
  planTemplates,
  products,
  tutorials
} from "./data/demo-catalog.js";
import { createRoomAnalyzer } from "./adapters/room-analyzer.js";
import { createRenderGenerator } from "./adapters/render-generator.js";
import { InMemoryCardStore, PlanNotFoundError } from "./store.js";

const clone = (value) => structuredClone(value);
const makeRequestId = () => `req-${randomUUID()}`;

class WorkflowInputError extends Error {
  constructor(code, message, issues = undefined) {
    super(message);
    this.name = "WorkflowInputError";
    this.code = code;
    this.statusCode = 422;
    this.issues = issues;
  }
}

function productById(productId) {
  const product = products[productId];
  if (!product) {
    throw new Error(`演示目录缺少商品 ${productId}`);
  }
  return {
    product_id: product.product_id,
    name: product.name,
    category: product.category,
    price_cny: product.price_cny,
    dimensions_cm: clone(product.dimensions_cm),
    dimensions_label: product.dimensions_label,
    installation: product.installation,
    pet_safe: product.pet_safe,
    reason: product.reason,
    availability: {
      status: product.availability.status,
      source_type: product.availability.source_type,
      checked_at: product.availability.checked_at
    },
    source: {
      source_type: product.source.source_type,
      label: product.source.label,
      updated_at: product.source.updated_at
    },
    ...(product.replacement_for ? { replacement_for: product.replacement_for } : {})
  };
}

function getInspiration(input) {
  const profile = inspirations[input.style_key];
  if (!profile) {
    throw new WorkflowInputError(
      "unsupported_inspiration",
      `暂不支持 style_key=${input.style_key}；演示可用 warm、compact、green`
    );
  }
  return {
    inspiration_id: input.inspiration_id,
    source_type: "demo",
    style: clone(profile.style),
    colors: clone(profile.colors),
    materials: clone(profile.materials),
    transferable_elements: clone(profile.transferable_elements),
    excluded_elements: clone(profile.excluded_elements)
  };
}

function normalizeRoomProfile(profile) {
  return {
    room_id: profile.room_id,
    room_type: profile.room_type,
    reference_width_cm: profile.reference_width_cm,
    fixed_elements: clone(profile.fixed_elements),
    editable_zones: clone(profile.editable_zones),
    lighting: {
      direction: profile.lighting.direction,
      confidence: profile.lighting.confidence
    },
    uncertainties: clone(profile.uncertainties),
    needs_confirmation: clone(profile.needs_confirmation)
  };
}

function normalizeTutorials() {
  return tutorials.map((tutorial) => ({
    content_id: tutorial.tutorial_id,
    title: tutorial.title,
    author: "一角焕新演示内容",
    reason: `与 ${tutorial.style_key} 方案的免打孔执行步骤相匹配；此条目不是平台真实视频。`,
    source: {
      source_type: tutorial.source.source_type,
      label: tutorial.source.label,
      updated_at: tutorial.source.updated_at
    },
    jump_url: null
  }));
}

function renderReference(renderRef) {
  return renderRef === "demo-after-warm"
    ? "./assets/desk-after-warm.png"
    : renderRef;
}

function replaceUnsafeProducts(productIds, constraints) {
  if (!constraints.hard_constraints.includes("pet_safe")) {
    return { productIds: [...productIds], replacements: [] };
  }

  const replacements = [];
  const safeIds = productIds.map((productId) => {
    const candidate = productById(productId);
    if (candidate.pet_safe === true) return productId;
    const allProducts = Object.values(products);
    const replacement =
      allProducts.find(
        (item) =>
          item.pet_safe === true &&
          (item.replacement_for === productId ||
            item.alternative_for_product_ids?.includes(productId))
      ) ||
      allProducts.find(
        (item) => item.pet_safe === true && item.category === candidate.category
      );
    if (!replacement) return productId;
    replacements.push({
      removed_product_id: productId,
      added_product_id: replacement.product_id,
      reason: "宠物安全硬约束"
    });
    return replacement.product_id;
  });

  return { productIds: safeIds, replacements };
}

function versionedPlanId(template, version) {
  const base = template.plan_id.replace(/-v\d+$/, "");
  return `${base}-v${version}`;
}

function requestScopedPlanId(template, requestId, version) {
  const base = template.plan_id.replace(/-v\d+$/, "");
  const safeRequestId = requestId.replace(/[^A-Za-z0-9_-]/g, "-");
  return `${base}-${safeRequestId}-v${version}`;
}

function buildRender(beforeRef, template, { revised = false } = {}) {
  return {
    before_ref: beforeRef,
    after_ref: renderReference(template.render_ref) || null,
    is_ai_generated: true,
    is_demo_asset: true,
    disclaimer: revised
      ? "调整后的商品与预算来自确定性规则；效果图仍复用预生成 AI 示意，未实时重绘。"
      : "预生成 AI 效果示意；不代表厘米级测量、实时库存或施工结果。"
  };
}

function buildPlanOption({
  template,
  roomProfile,
  inspirationProfile,
  constraints,
  beforeRef,
  version = 1,
  productIdsOverride,
  revision,
  planIdOverride
}) {
  const replacementResult = replaceUnsafeProducts(
    productIdsOverride || template.product_ids,
    constraints
  );
  const productIds = [...new Set(replacementResult.productIds)];
  const selectedProducts = productIds.map(productById);
  const selectedIds = new Set(productIds);
  const replacementMap = new Map(
    replacementResult.replacements.map((item) => [
      item.removed_product_id,
      item.added_product_id
    ])
  );
  const plan = {
    plan_id: planIdOverride || versionedPlanId(template, version),
    room_id: roomProfile.room_id,
    inspiration_id: inspirationProfile.inspiration_id,
    version,
    title: template.title,
    summary: template.summary,
    total_price_cny: selectedProducts.reduce((sum, product) => sum + product.price_cny, 0),
    product_ids: productIds,
    preserved_elements: clone(template.preserved_elements),
    placements: clone(template.placements)
      .map((placement) => ({
        ...placement,
        product_id: replacementMap.get(placement.product_id) || placement.product_id
      }))
      .filter((placement) => selectedIds.has(placement.product_id))
      .map((placement) => ({
        product_id: placement.product_id,
        zone: placement.zone,
        instruction: placement.instruction
      })),
    steps: clone(template.steps).map((step, index) => ({
      step_id: `step-${index + 1}`,
      title: step.title,
      instruction: step.instruction
    })),
    render_ref: renderReference(template.render_ref),
    assumptions: clone(template.assumptions),
    constraint_tags: [...new Set([...template.constraint_tags, ...constraints.hard_constraints])],
    ...(revision ? { revision: clone(revision) } : {})
  };

  const validation = validateDesignPlan({
    plan,
    products: selectedProducts,
    roomProfile,
    constraints
  });

  return {
    plan,
    validation,
    products: selectedProducts,
    render: buildRender(beforeRef, template, { revised: Boolean(revision) })
  };
}

function choosePrimary(options, styleKey) {
  const valid = options.filter(
    (option) => !["failed", "blocked"].includes(option.validation.overall_status)
  );
  return (
    valid.find((option) => option.styleKey === styleKey) ||
    [...valid].sort(
      (left, right) => left.plan.total_price_cny - right.plan.total_price_cny
    )[0] ||
    null
  );
}

async function generatePrimaryRender({
  options,
  preferredStyleKey,
  roomInput,
  roomProfile,
  requestedMode,
  generateRender,
  persistGeneratedRender
}) {
  const primary = choosePrimary(options, preferredStyleKey);
  if (!primary) return null;

  const generated = await generateRender({
    roomInput,
    roomProfile,
    plan: primary.plan,
    products: primary.products,
    requestedMode
  });
  const outcome = {
    sourceType: generated.sourceType,
    reason: generated.reason,
    message: generated.message,
    model: generated.model,
    latencyMs: generated.latencyMs
  };
  if (generated.sourceType !== "live") return outcome;

  try {
    if (typeof persistGeneratedRender !== "function") {
      throw new Error("generated render storage is unavailable");
    }
    const afterRef = await persistGeneratedRender({
      bytes: generated.bytes,
      mediaType: generated.mediaType,
      model: generated.model
    });
    if (typeof afterRef !== "string" || !afterRef.trim()) {
      throw new Error("generated render storage returned an invalid reference");
    }
    primary.plan.render_ref = afterRef;
    primary.render = {
      before_ref: primary.render.before_ref,
      after_ref: afterRef,
      is_ai_generated: true,
      is_demo_asset: false,
      disclaimer:
        "本效果图由 Seedream 基于本次上传的房间照片生成，仅作软装预览；购买前仍需复测尺寸。"
    };
    return outcome;
  } catch {
    return {
      sourceType: "fallback",
      reason: "render_storage_failed",
      message: "Seedream 已返回图片，但本地保存失败，已回退为 Demo 效果图。",
      model: generated.model,
      latencyMs: generated.latencyMs
    };
  }
}

function buildTrace(sourceMode, includeTrace, fallback) {
  if (!includeTrace) return [];
  return [
    {
      step: 1,
      skill: "extract_inspiration_style",
      status: "completed",
      source_mode: "demo",
      summary: "把灵感风格、色彩、材质和可迁移元素整理为 InspirationProfile。"
    },
    {
      step: 2,
      skill: "extract_room_constraints",
      status: fallback ? "fallback" : "completed",
      source_mode: sourceMode,
      summary: fallback
        ? "真实空间理解不可用，使用同协议 Demo RoomProfile，原因已写入 notices。"
        : sourceMode === "live"
          ? "真实空间理解 Provider 返回 RoomProfile，并通过协议校验。"
          : "使用明确标注的 Demo RoomProfile。"
    },
    {
      step: 3,
      skill: "build_user_constraints",
      status: "completed",
      source_mode: "demo",
      summary: "预算、安装限制和保留家具作为硬约束；软偏好在 v1 中仅记录，不参与自动筛选或排序。"
    },
    {
      step: 4,
      skill: "retrieve_products",
      status: "completed",
      source_mode: "demo",
      summary: "从演示商品目录按安装方式、宠物安全和方案需求组织候选。"
    },
    {
      step: 5,
      skill: "generate_design_plan",
      status: "completed",
      source_mode: "demo",
      summary: "生成可版本化方案；方案只保存 product_id 引用。"
    },
    {
      step: 6,
      skill: "validate_design_plan",
      status: "completed",
      source_mode: "demo",
      summary: "用确定性代码复核合计、预算、不打孔、保留家具、尺寸、库存和宠物安全。"
    },
    {
      step: 7,
      skill: "compose_ai_card",
      status: "completed",
      source_mode: "demo",
      summary: "组合 AICard v1，并保留事实来源、警告和降级状态。"
    }
  ];
}

function createNotices(
  sourceMode,
  fallback,
  constraints,
  requestedInspirationSourceType,
  renderOutcome
) {
  const notices = [
    {
      code: "demo_commerce_data",
      level: "info",
      message: "商品、价格、库存和教程均为比赛 Demo 数据，不代表真实平台接口。"
    },
    {
      code: "pre_generated_render",
      level: "warning",
      message: "效果图为预生成 AI 示意，购买前仍需复测尺寸。"
    }
  ];
  if (renderOutcome?.sourceType === "live") {
    const demoNoticeIndex = notices.findIndex(
      (notice) => notice.code === "pre_generated_render"
    );
    if (demoNoticeIndex >= 0) {
      notices.splice(demoNoticeIndex, 1, {
        code: "live_render_generated",
        level: "info",
        message:
          "主方案效果图由 Seedream 基于本次上传的真实房间照片生成；商品与教程仍为 Demo 数据。"
      });
    }
  } else if (renderOutcome?.sourceType === "fallback") {
    notices.unshift({
      code: renderOutcome.reason || "render_unavailable",
      level: "warning",
      message:
        renderOutcome.message ||
        "Seedream 实时效果图不可用，已回退为 Demo 效果图。"
    });
  }
  if (sourceMode === "live") {
    notices.unshift({
      code: "live_room_analysis",
      level: "info",
      message: "本次 RoomProfile 来自已配置的真实空间理解 Provider。"
    });
  }
  if (fallback) {
    notices.unshift({
      code: fallback.reason,
      level: "warning",
      message: fallback.message
    });
  }
  if (constraints.hard_constraints.includes("pet_safe")) {
    notices.push({
      code: "pet_safe_filter_applied",
      level: "info",
      message: "已按宠物安全硬约束过滤或替换明确不安全的演示商品；未知材质仍需购买前核验。"
    });
  }
  if (
    requestedInspirationSourceType &&
    requestedInspirationSourceType !== "demo"
  ) {
    notices.push({
      code: "inspiration_source_not_connected",
      level: "warning",
      message:
        "当前后端未连接真实灵感内容解析；本次仅按 style_key 使用本地 Demo InspirationProfile。"
    });
  }
  return notices;
}

function noPlanReason(options) {
  if (options.length === 0) {
    return {
      reason_code: "budget_below_minimum",
      question: "当前预算不足以组成最小可执行组合，是否提高预算或减少改造目标？",
      required_fields: ["constraints.budget_cny"]
    };
  }
  const failedCodes = new Set(
    options.flatMap((option) =>
      option.validation?.checks
        ?.filter((check) => check.status === "fail")
        .map((check) => check.code) || []
    )
  );
  if (failedCodes.size === 1 && failedCodes.has("budget")) {
    return {
      reason_code: "budget_below_minimum",
      question: "当前预算不足以组成最小可执行组合，是否提高预算或减少改造目标？",
      required_fields: ["constraints.budget_cny"]
    };
  }
  return {
    reason_code: "constraints_unmet",
    question: "当前硬约束下没有可执行方案，请调整约束或补充空间信息。",
    required_fields: ["constraints"]
  };
}

function makeFollowUp(roomProfile, hasPlan, options) {
  if (!hasPlan) {
    const reason = noPlanReason(options);
    return {
      ...reason,
      can_continue_with_assumptions: false
    };
  }
  if (roomProfile.needs_confirmation.includes("reference_width_cm")) {
    return {
      reason_code: "missing_reference_width",
      question: "请补充桌面宽度，购买前才能完成尺寸复核。",
      required_fields: ["room_input.reference_width_cm"],
      can_continue_with_assumptions: true
    };
  }
  if (roomProfile.needs_confirmation.includes("clearer_room_image")) {
    return {
      reason_code: "room_image_blurry",
      question: "请补拍一张同时看清桌面、墙面和椅子的照片。",
      required_fields: ["room_input.image"],
      can_continue_with_assumptions: true
    };
  }
  if (roomProfile.needs_confirmation.includes("full_desk_and_wall_image")) {
    return {
      reason_code: "room_image_partial",
      question: "请补拍覆盖完整桌面和靠墙区域的照片。",
      required_fields: ["room_input.image"],
      can_continue_with_assumptions: true
    };
  }
  return null;
}

function composeCard({
  requestId,
  generatedAt,
  sourceMode,
  roomProfile,
  inspirationProfile,
  constraints,
  options,
  beforeRef,
  fallback,
  includeTrace,
  preferredStyleKey,
  requestedInspirationSourceType,
  renderOutcome,
  roomAnalysisUpdatedAt = generatedAt
}) {
  const primary = choosePrimary(options, preferredStyleKey);
  const followUp = makeFollowUp(roomProfile, Boolean(primary), options);
  const needsInput = Boolean(followUp);
  const status = needsInput
    ? "needs_input"
    : sourceMode === "fallback"
      ? "fallback_ready"
      : "ready";

  const selected = primary || {
    plan: null,
    validation: null,
    products: [],
    render: {
      before_ref: beforeRef,
      after_ref: null,
      is_ai_generated: false,
      is_demo_asset: true,
      disclaimer: "尚未形成可执行方案；请先补充信息或调整预算。"
    }
  };

  const card = {
    schema_version: SCHEMA_VERSION,
    request_id: requestId,
    source_mode: sourceMode,
    status,
    generated_at: generatedAt,
    room_profile: clone(roomProfile),
    inspiration_profile: clone(inspirationProfile),
    constraints: clone(constraints),
    plan: selected.plan,
    validation: selected.validation,
    products: selected.products,
    tutorials: normalizeTutorials(),
    render: selected.render,
    alternatives: options
      .filter((option) => option !== primary)
      .map(({ styleKey: _styleKey, ...option }) => clone(option)),
    notices: createNotices(
      sourceMode,
      fallback,
      constraints,
      requestedInspirationSourceType,
      renderOutcome
    ),
    data_sources: [
      {
        kind: "room_analysis",
        source_type: sourceMode,
        label:
          sourceMode === "live"
            ? "已配置的真实 RoomProfile Provider"
            : sourceMode === "fallback"
              ? "真实网关失败后的本地 RoomProfile 演示档案"
              : "本地 RoomProfile 演示档案",
        updated_at: roomAnalysisUpdatedAt
      },
      ...(renderOutcome && renderOutcome.sourceType !== "demo"
        ? [
            {
              kind: "render_generation",
              source_type: renderOutcome.sourceType,
              label:
                renderOutcome.sourceType === "live"
                  ? `${renderOutcome.model || "Seedream"} 实时图片编辑`
                  : `${renderOutcome.model || "Seedream"} 失败后的 Demo 回退`,
              updated_at: generatedAt
            }
          ]
        : []),
      ...clone(dataSources).map((source) => ({
        kind: source.kind,
        source_type: source.source_type,
        label: source.label,
        updated_at: source.updated_at
      }))
    ],
    trace: buildTrace(sourceMode, includeTrace, fallback),
    follow_up: followUp
  };

  assertAICard(card);
  return card;
}

function minimumBudget(template) {
  return template.minimum_product_ids
    .map(productById)
    .reduce((sum, product) => sum + product.price_cny, 0);
}

function chooseBudgetProducts(template, targetBudget) {
  const minimumIds = [...template.minimum_product_ids];
  const minimumTotal = minimumBudget(template);
  if (targetBudget < minimumTotal) return null;

  const chosen = [];
  let total = 0;
  for (const productId of template.budget_order) {
    const product = productById(productId);
    if (minimumIds.includes(productId) || total + product.price_cny <= targetBudget) {
      if (total + product.price_cny <= targetBudget) {
        chosen.push(productId);
        total += product.price_cny;
      }
    }
  }
  if (minimumIds.some((productId) => !chosen.includes(productId))) return null;
  return chosen;
}

function allOptionsFromCard(card) {
  const options = card.alternatives.map((option) => option);
  if (card.plan) {
    options.unshift({
      plan: card.plan,
      validation: card.validation,
      products: card.products,
      render: card.render
    });
  }
  return options;
}

function fallbackFromCard(card) {
  if (card.source_mode !== "fallback") return null;
  const notice = card.notices.find(
    (item) =>
      item.level === "warning" &&
      (item.code.startsWith("upstream_") ||
        item.code === "live_not_configured")
  );
  return {
    reason: notice?.code || "previous_room_analysis_fallback",
    message:
      notice?.message ||
      "本次调整沿用此前降级生成的本地 Demo RoomProfile。"
  };
}

function requestedInspirationSourceFromCard(card) {
  return card.notices.some(
    (item) => item.code === "inspiration_source_not_connected"
  )
    ? "previous_non_demo"
    : null;
}

function roomAnalysisTimestampFromCard(card) {
  return (
    card.data_sources.find((source) => source.kind === "room_analysis")
      ?.updated_at || card.generated_at
  );
}

export function createOrchestrator({
  config,
  roomAnalyzer,
  renderGenerator,
  persistGeneratedRender,
  store,
  requestIdFactory = makeRequestId,
  now = () => new Date(),
  fetchImpl = globalThis.fetch
}) {
  const startedAt = Date.now();
  const cardStore =
    store ||
    new InMemoryCardStore({
      ttlMs: config.cardTtlMs,
      maxEntries: config.maxStoredCards
    });
  const analyzeRoom =
    roomAnalyzer ||
    createRoomAnalyzer({
      config,
      defaultRoomProfile,
      fetchImpl
    });
  const generateRender =
    renderGenerator ||
    createRenderGenerator({
      config,
      fetchImpl
    });

  return {
    health() {
      return {
        status: "ok",
        service: "ai-corner-renewal-orchestrator",
        service_version: "0.5.1",
        contract_version: SCHEMA_VERSION,
        backend_mode: config.backendMode,
        room_analyzer_configured:
          config.roomAnalyzerProvider === "gateway"
            ? Boolean(config.roomAnalyzerUrl)
            : config.roomAnalyzerProvider === "agent_plan"
              ? Boolean(config.agentPlanApiKey)
              : false,
        room_analyzer_provider: config.roomAnalyzerProvider,
        state_store: "memory",
        stored_cards: cardStore.size,
        stored_cards_limit: config.maxStoredCards,
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000)
      };
    },

    async generate(request) {
      assertGenerateRequest(request);
      const requestId = requestIdFactory();
      const inspirationProfile = getInspiration(request.inspiration_input);
      const mode = request.options?.analysis_mode || "auto";
      const includeTrace = request.options?.include_trace !== false;
      const analysis = await analyzeRoom(request.room_input, mode);
      const roomProfile = normalizeRoomProfile(analysis.roomProfile);
      const beforeRef =
        request.room_input.image.reference &&
        !request.room_input.image.reference.toLowerCase().startsWith("data:")
          ? request.room_input.image.reference
          : "client://room-upload";

      let options = Object.entries(planTemplates).map(([styleKey, template]) => ({
        styleKey,
        ...buildPlanOption({
          template,
          roomProfile,
          inspirationProfile,
          constraints: request.constraints,
          beforeRef,
          planIdOverride: requestScopedPlanId(template, requestId, 1)
        })
      }));

      if (!choosePrimary(options, request.inspiration_input.style_key)) {
        const template = planTemplates.compact;
        const productIds = chooseBudgetProducts(
          template,
          request.constraints.budget_cny
        );
        if (productIds) {
          const compact = {
            styleKey: "compact",
            ...buildPlanOption({
              template,
              roomProfile,
              inspirationProfile,
              constraints: request.constraints,
              beforeRef,
              productIdsOverride: productIds,
              planIdOverride: requestScopedPlanId(template, requestId, 1)
            })
          };
          options = [
            compact,
            ...options.filter((option) => option.styleKey !== "compact")
          ];
        }
      }

      const renderOutcome = await generatePrimaryRender({
        options,
        preferredStyleKey: request.inspiration_input.style_key,
        roomInput: request.room_input,
        roomProfile,
        requestedMode: mode,
        generateRender,
        persistGeneratedRender
      });

      const card = composeCard({
        requestId,
        generatedAt: now().toISOString(),
        sourceMode: analysis.sourceMode,
        roomProfile,
        inspirationProfile,
        constraints: request.constraints,
        options,
        beforeRef,
        fallback: analysis.fallback,
        includeTrace,
        preferredStyleKey: request.inspiration_input.style_key,
        requestedInspirationSourceType:
          request.inspiration_input.source_type,
        renderOutcome
      });
      cardStore.set(card);
      return clone(card);
    },

    async revise(request) {
      assertReviseRequest(request);
      const previousCard = cardStore.get(request.request_id);
      const previousOption = allOptionsFromCard(previousCard).find(
        (option) => option.plan.plan_id === request.plan_id
      );
      if (!previousOption) throw new PlanNotFoundError(request.plan_id);
      if (request.target_budget_cny >= previousOption.plan.total_price_cny) {
        throw new WorkflowInputError(
          "target_budget_not_lower",
          `v1 预算调整只支持降低预算；目标必须低于当前方案 ¥${previousOption.plan.total_price_cny}`
        );
      }

      const requestId = requestIdFactory();
      const constraints = {
        ...clone(previousCard.constraints),
        budget_cny: request.target_budget_cny
      };
      const template = planTemplates.compact;
      const productIds = chooseBudgetProducts(template, request.target_budget_cny);

      if (!productIds) {
        const card = composeCard({
          requestId,
          generatedAt: now().toISOString(),
          sourceMode: previousCard.source_mode,
          roomProfile: previousCard.room_profile,
          inspirationProfile: previousCard.inspiration_profile,
          constraints,
          options: [],
          beforeRef: previousCard.render.before_ref,
          fallback: fallbackFromCard(previousCard),
          includeTrace: previousCard.trace.length > 0,
          preferredStyleKey: "compact",
          requestedInspirationSourceType:
            requestedInspirationSourceFromCard(previousCard),
          roomAnalysisUpdatedAt:
            roomAnalysisTimestampFromCard(previousCard)
        });
        card.notices.unshift({
          code: "budget_below_minimum",
          level: "warning",
          message: `最小可执行组合需要 ¥${minimumBudget(template)}，当前目标为 ¥${request.target_budget_cny}。`
        });
        assertAICard(card);
        cardStore.set(card);
        return clone(card);
      }

      const previousIds = new Set(previousOption.plan.product_ids);
      const nextIds = new Set(productIds);
      const revision = {
        parent_plan_id: previousOption.plan.plan_id,
        target_budget_cny: request.target_budget_cny,
        reason: "budget_reduction",
        removed_product_ids: [...previousIds].filter((id) => !nextIds.has(id)),
        added_product_ids: [...nextIds].filter((id) => !previousIds.has(id))
      };
      const revised = buildPlanOption({
        template,
        roomProfile: previousCard.room_profile,
        inspirationProfile: previousCard.inspiration_profile,
        constraints,
        beforeRef: previousCard.render.before_ref,
        version: previousOption.plan.version + 1,
        productIdsOverride: productIds,
        revision,
        planIdOverride: requestScopedPlanId(
          template,
          requestId,
          previousOption.plan.version + 1
        )
      });

      const card = composeCard({
        requestId,
        generatedAt: now().toISOString(),
        sourceMode: previousCard.source_mode,
        roomProfile: previousCard.room_profile,
        inspirationProfile: previousCard.inspiration_profile,
        constraints,
        options: [{ styleKey: "compact", ...revised }],
        beforeRef: previousCard.render.before_ref,
        fallback: fallbackFromCard(previousCard),
        includeTrace: previousCard.trace.length > 0,
        preferredStyleKey: "compact",
        requestedInspirationSourceType:
          requestedInspirationSourceFromCard(previousCard),
        roomAnalysisUpdatedAt:
          roomAnalysisTimestampFromCard(previousCard)
      });
      card.notices.unshift({
        code: "budget_revision_applied",
        level: "info",
        message: `已按 ¥${request.target_budget_cny} 目标重组商品，当前合计 ¥${card.plan.total_price_cny}。`
      });
      if (card.trace.length > 0) {
        card.trace.push({
          step: card.trace.length + 1,
          skill: "revise_budget",
          status: "completed",
          source_mode: "demo",
          summary: "按保留优先级重新组合商品，创建新版本方案并再次运行全部确定性校验。"
        });
      }
      assertAICard(card);
      cardStore.set(card);
      return clone(card);
    }
  };
}
