import { assertAICard } from "../../../../packages/contracts/src/index.js";
import { validateDesignPlan } from "../../../../packages/validation/src/index.js";
import { products as demoProducts } from "../data/demo-catalog.js";
import { DEMO_COMMERCE_CATEGORY_MAP } from "../adapters/commerce-catalog.js";
import {
  buildFormalLayoutPrompt,
  buildFormalRenderPrompt,
  RENEWAL_LAYOUT_PROMPT_VERSION,
  RENEWAL_RENDER_PROMPT_VERSION
} from "../prompts/renewal-v2.js";

const clone = (value) => structuredClone(value);
const SOURCE_CATEGORY_FAMILIES = Object.freeze([
  new Set(["table_lamp", "lighting"]),
  new Set(["desk_riser", "monitor_riser"]),
  new Set(["desktop_storage", "file_storage", "underdesk_storage"])
]);

function bytesDataUrl(bytes, mediaType) {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function sourceComponentFrom(snapshot) {
  const reference = (snapshot.reference_snapshots || []).find(
    (item) => item.attributes?.source_component?.immutable_anchor === true
  );
  return reference
    ? {
        asset_id: reference.asset_id,
        media_id: reference.media_ids?.[0] || null,
        ...clone(reference.attributes.source_component)
      }
    : null;
}

function sourceCategoryCodes(sourceComponent) {
  const codes = [
    sourceComponent?.category_code,
    sourceComponent?.selected_catalog_candidate?.category_code
  ].filter(Boolean);
  const family = SOURCE_CATEGORY_FAMILIES.find((items) =>
    codes.some((code) => items.has(code))
  );
  return new Set(family ? [...family, ...codes] : codes);
}

function enforceLayoutRules(layoutPlan, sourceComponent, snapshot) {
  const plan = clone(layoutPlan);
  const sourceCategories = sourceCategoryCodes(sourceComponent);
  const removedSourceCategorySlots = [];
  plan.product_slots = (plan.product_slots || []).filter((slot) => {
    if (!sourceCategories.has(slot.category)) return true;
    removedSourceCategorySlots.push(slot.slot_id);
    return false;
  });
  plan.actions = (plan.actions || []).filter((action) => {
    if (
      action.type !== "add" ||
      action.target?.startsWith("source_component:")
    ) {
      return true;
    }
    return !sourceCategories.has(action.target);
  });

  const organizationRequired =
    (snapshot.goal_codes || []).includes("organization") ||
    /整理|收纳|杂乱|散乱|垃圾|线缆/.test(snapshot.goal || "");
  const actionTypes = new Set(plan.actions.map((action) => action.type));
  const injectedActions = [];
  if (organizationRequired && !actionTypes.has("remove_trash")) {
    injectedActions.push({
      type: "remove_trash",
      target: "visible_trash_and_disposable_clutter",
      placement: "desktop",
      instruction:
        "移除空瓶、包装、废纸和无明确用途的零散物；不得把垃圾重新摆进收纳盘。",
      reason: "改造必须先消除可见垃圾，形成一眼可见的前后差异"
    });
  }
  if (organizationRequired && !actionTypes.has("organize_loose_items")) {
    injectedActions.push({
      type: "organize_loose_items",
      target: "remaining_daily_items_and_cables",
      placement: "desktop_and_desktop_back",
      instruction:
        "只保留键盘、鼠标和必要设备在外；其余日用小物分类收纳，线缆集中隐藏到桌面后缘。",
      reason: "降低桌面视觉噪声并恢复连续操作区"
    });
  }
  plan.actions = [...injectedActions, ...plan.actions].slice(0, 8);
  plan.product_slots = plan.product_slots.slice(0, 4);
  if (organizationRequired) {
    plan.render_instruction = [
      plan.render_instruction,
      "改造后的桌面必须明显比原图整洁：移除垃圾和大部分散乱小物，只保留必要输入设备与少量有意图的陈设；不能把原有杂物原样复制到新图。"
    ].join(" ");
  }
  return {
    plan,
    enforcement: {
      organization_required: organizationRequired,
      injected_action_types: injectedActions.map((item) => item.type),
      removed_source_category_slot_ids: removedSourceCategorySlots
    }
  };
}

function fallbackLayout(card, sourceComponent) {
  const sourceProductId =
    sourceComponent?.selected_catalog_candidate?.product_id || null;
  const sourceCategories = sourceCategoryCodes(sourceComponent);
  const supplementaryProducts = (card.products || []).filter(
    (item) =>
      item.product_id !== sourceProductId &&
      !sourceCategories.has(item.category)
  );
  return {
    status: "ready",
    scene: {
      scene_type: card.room_profile?.scene_type || "desk_corner",
      primary_function: "承载用户的日常使用场景",
      existing_style: "以原空间为基础",
      dominant_colors: [],
      main_materials: [],
      lighting: "保持原始自然采光方向，并补充氛围照明",
      editable_area: "只编辑用户授权的软装区域"
    },
    preserve: (card.plan?.preserved_elements || []).map((object) => ({
      object,
      reason: "固定结构或用户要求保留"
    })),
    problems: [],
    design_direction: {
      goal: "围绕用户圈选组件形成完整、有视觉焦点的焕新空间",
      focal_point: sourceComponent?.label || card.plan?.title || "焕新焦点",
      palette: [],
      materials: [],
      spatial_strategy: "以圈选组件为锚点，补充少量有明确功能的商品形成层次"
    },
    actions: [
      ...(sourceComponent
        ? [
            {
              type: "add",
              target: `source_component:${sourceComponent.source_component_id}`,
              placement: "放在主要可编辑区域并成为视觉焦点",
              instruction: "保持圈选组件的外观、比例、颜色与材质特征",
              reason: "这是用户明确选择且不可替换的组件"
            }
          ]
        : []),
      ...supplementaryProducts.slice(0, 4).map((product) => {
        const placement = card.plan?.placements?.find(
          (item) => item.product_id === product.product_id
        );
        return {
          type: "add",
          target: product.category,
          placement: placement?.zone || "editable_area",
          instruction: placement?.instruction || product.reason,
          reason: product.reason
        };
      })
    ],
    product_slots: supplementaryProducts.slice(0, 4).map((product, index) => {
      const placement = card.plan?.placements?.find(
        (item) => item.product_id === product.product_id
      );
      return {
        slot_id: `supplement-${index + 1}`,
        category: product.category,
        purpose: product.reason,
        quantity: 1,
        size_constraint: product.dimensions_label || "购买前复测尺寸",
        color: "与预设风格协调",
        material: "以商品真实材质为准",
        placement: placement?.zone || "editable_area",
        support: "稳定的地面、桌面或可承重支撑面",
        clearance_constraints: ["不遮挡通道和固定设施"],
        douyin_search_queries: [product.name]
      };
    }),
    render_instruction: card.plan?.summary || "完成高质感、写实的空间焕新",
    negative_constraints: [
      "不得改变相机机位与房间固定结构",
      "不得遗漏或替换 SourceComponent"
    ]
  };
}

function selectProducts(layoutPlan, sourceComponent, budget) {
  const selected = [];
  const used = new Set();
  const sourceProductId =
    sourceComponent?.selected_catalog_candidate?.product_id || null;
  if (sourceProductId && demoProducts[sourceProductId]) {
    selected.push(demoProducts[sourceProductId]);
    used.add(sourceProductId);
  }
  let total = selected.reduce((sum, item) => sum + item.price_cny, 0);
  for (const slot of layoutPlan.product_slots || []) {
    const candidateId = (DEMO_COMMERCE_CATEGORY_MAP[slot.category] || []).find(
      (id) => !used.has(id) && demoProducts[id]
    );
    if (!candidateId) continue;
    const product = demoProducts[candidateId];
    if (Number.isInteger(budget) && total + product.price_cny > budget) continue;
    selected.push(product);
    used.add(candidateId);
    total += product.price_cny;
  }
  return selected;
}

function applyPlanToCard(card, layoutPlan, sourceComponent, selectedProducts) {
  const sourceProductId =
    sourceComponent?.selected_catalog_candidate?.product_id || null;
  const slots = layoutPlan.product_slots || [];
  const stablePreservedElements = card.plan?.preserved_elements || [];
  const editableZones = card.room_profile?.editable_zones || ["desktop"];
  const normalizedZone = (hint) =>
    editableZones.find(
      (zone) => hint === zone || String(hint || "").includes(zone)
    ) || editableZones[0] || "desktop";
  const placements = selectedProducts.map((product) => {
    if (product.product_id === sourceProductId) {
      const anchor = (layoutPlan.actions || []).find((item) =>
        item.target?.startsWith("source_component:")
      );
      return {
        product_id: product.product_id,
        zone: normalizedZone(anchor?.placement),
        instruction:
          [anchor?.placement, anchor?.instruction]
            .filter(Boolean)
            .join("；") || "原样放置用户圈选组件，作为方案视觉锚点"
      };
    }
    const slot = slots.find((item) => item.category === product.category);
      return {
        product_id: product.product_id,
        zone: normalizedZone(slot?.placement),
        instruction: slot?.purpose || product.reason
      };
  });
  card.products = selectedProducts.map((product) => ({
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
    }
  }));
  card.plan = {
    ...card.plan,
    title: layoutPlan.design_direction.goal.slice(0, 80),
    summary: layoutPlan.render_instruction,
    total_price_cny: selectedProducts.reduce(
      (sum, product) => sum + product.price_cny,
      0
    ),
    product_ids: selectedProducts.map((product) => product.product_id),
    preserved_elements: [
      ...new Set([
        ...stablePreservedElements,
        ...(layoutPlan.preserve || []).map((item) => item.object)
      ])
    ],
    placements,
    steps: (layoutPlan.actions || []).map((action, index) => ({
      step_id: `step-${index + 1}`,
      title:
        action.type === "add"
          ? `布置 ${action.target}`
          : action.type === "remove_trash"
            ? "移除杂物"
            : "整理现有物品",
      instruction: action.instruction
    }))
  };
  card.validation = validateDesignPlan({
    plan: card.plan,
    products: card.products,
    roomProfile: card.room_profile,
    constraints: card.constraints
  });
}

export class FormalRenewalPipeline {
  constructor({
    layoutPlanner,
    renderGenerator,
    renderEvaluator,
    mediaService,
    config,
    now = () => new Date()
  }) {
    this.layoutPlanner = layoutPlanner;
    this.renderGenerator = renderGenerator;
    this.renderEvaluator = renderEvaluator;
    this.mediaService = mediaService;
    this.config = config;
    this.now = now;
  }

  async execute({
    actorId,
    designRequest,
    baseCard,
    roomAnalysis = null,
    roomInput,
    persistGeneratedRender
  }) {
    const snapshot = designRequest.input_snapshot;
    const sourceComponent = sourceComponentFrom(snapshot);
    const workingCard = clone(baseCard);
    if (roomAnalysis?.roomProfile) {
      workingCard.room_profile = clone(roomAnalysis.roomProfile);
      const roomSource = workingCard.data_sources.find(
        (item) => item.kind === "room_analysis"
      );
      if (roomSource) {
        roomSource.source_type = roomAnalysis.sourceMode;
        roomSource.label =
          roomAnalysis.sourceMode === "live"
            ? "正式空间理解 Agent"
            : "正式空间理解不可用后的协议兼容档案";
        roomSource.updated_at = this.now().toISOString();
      }
      if (roomAnalysis.fallback) {
        workingCard.notices.unshift({
          code: roomAnalysis.fallback.reason,
          level: "warning",
          message: roomAnalysis.fallback.message
        });
      }
    }
    const roomMediaId = snapshot.space_snapshot.space_version.media_ids?.[0];
    const roomImage = roomMediaId
      ? this.mediaService.getForProvider(actorId, roomMediaId).dataUrl
      : roomInput.image.data_url;
    const componentImage =
      sourceComponent?.media_id
        ? this.mediaService.getForProvider(actorId, sourceComponent.media_id).dataUrl
        : null;
    const styleKey =
      snapshot.options.preferred_style_key ||
      snapshot.reference_snapshots.find((item) => item.attributes?.style_key)
        ?.attributes?.style_key ||
      "warm";
    const planning = await this.layoutPlanner({
      imageDataUrls: [roomImage, componentImage].filter(Boolean),
      prompt: buildFormalLayoutPrompt({
        roomProfile: workingCard.room_profile,
        sourceComponent,
        styleKey,
        goal: snapshot.goal,
        constraints: snapshot.constraints
      }),
      requestedMode:
        snapshot.options.analysis_mode === "demo" ? "demo" : "live"
    });
    const liveRequested =
      this.config.backendMode !== "demo" &&
      snapshot.options.analysis_mode !== "demo";
    if (liveRequested && planning.sourceType !== "live") {
      const code = planning.reason || "formal_layout_failed";
      throw Object.assign(
        new Error(
          `正式布局规划失败：${code}${
            planning.diagnostic ? ` (${planning.diagnostic})` : ""
          }`
        ),
        {
          code,
          issues: planning.diagnostic
            ? [
                {
                  path: "/layout_plan",
                  code,
                  message: planning.diagnostic
                }
              ]
            : []
        }
      );
    }
    if (liveRequested && planning.plan?.status !== "ready") {
      throw Object.assign(new Error("正式布局规划需要补充输入，未进入生图"), {
        code: "formal_layout_needs_input"
      });
    }
    const candidateLayoutPlan =
      planning.sourceType === "live" && planning.plan?.status === "ready"
        ? planning.plan
        : fallbackLayout(workingCard, sourceComponent);
    const enforcedLayout = enforceLayoutRules(
      candidateLayoutPlan,
      sourceComponent,
      snapshot
    );
    const layoutPlan = enforcedLayout.plan;
    if (
      sourceComponent &&
      !(layoutPlan.actions || []).some(
        (item) =>
          item.type === "add" &&
          item.target ===
            `source_component:${sourceComponent.source_component_id}`
      )
    ) {
      throw Object.assign(
        new Error("LayoutPlan 遗漏或替换了用户圈选组件"),
        { code: "source_component_anchor_missing" }
      );
    }
    const selectedProducts = selectProducts(
      layoutPlan,
      sourceComponent,
      snapshot.constraints.budget_cny
    );
    const card = workingCard;
    applyPlanToCard(card, layoutPlan, sourceComponent, selectedProducts);

    const artifacts = {
      maturity: this.config.backendMode === "demo" ? "prototype" : "runtime_static",
      scene_assessment: clone(card.room_profile),
      source_component: clone(sourceComponent),
      planning: {
        source_mode: planning.sourceType,
        reason: planning.reason || null,
        diagnostic: planning.diagnostic || null,
        model: planning.model || null,
        latency_ms: planning.latencyMs ?? null,
        normalization: planning.normalization || null,
        enforcement: enforcedLayout.enforcement
      },
      layout_plan: clone(layoutPlan),
      product_slots: clone(layoutPlan.product_slots || []),
      selected_products: selectedProducts.map((item) => item.product_id),
      prompt_versions: {
        layout: RENEWAL_LAYOUT_PROMPT_VERSION,
        render: RENEWAL_RENDER_PROMPT_VERSION
      },
      render_attempts: []
    };

    if (this.config.backendMode !== "demo" && snapshot.options.analysis_mode !== "demo") {
      let repairInstruction = "";
      let acceptedRender = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const prompt = buildFormalRenderPrompt({
          layoutPlan,
          sourceComponent,
          styleKey,
          products: selectedProducts,
          repairInstruction
        });
        const generated = await this.renderGenerator({
          roomInput,
          plan: card.plan,
          roomProfile: card.room_profile,
          products: card.products,
          promptOverride: prompt,
          referenceImages: componentImage ? [componentImage] : [],
          requestedMode: "live"
        });
        if (generated.sourceType !== "live") {
          throw Object.assign(new Error("正式效果图生成失败"), {
            code: generated.reason || "formal_render_failed"
          });
        }
        const evaluation = await this.renderEvaluator({
          beforeImageDataUrl: roomImage,
          componentImageDataUrl: componentImage,
          afterImageDataUrl: bytesDataUrl(generated.bytes, generated.mediaType),
          sourceComponent,
          layoutPlan,
          requestedMode: "live"
        });
        artifacts.render_attempts.push({
          attempt,
          render_model: generated.model,
          render_latency_ms: generated.latencyMs,
          evaluator_model: evaluation.model,
          evaluator_latency_ms: evaluation.latencyMs,
          evaluation: clone(evaluation.evaluation)
        });
        if (evaluation.evaluation.accepted) {
          acceptedRender = generated;
          break;
        }
        repairInstruction =
          evaluation.evaluation.repair_instruction ||
          `修复：${evaluation.evaluation.hard_failures.join("、")}`;
      }
      if (!acceptedRender) {
        throw Object.assign(
          new Error("效果图视觉校验两次未通过，未发布不合格图片"),
          { code: "render_visual_validation_failed" }
        );
      }
      const afterRef = await persistGeneratedRender(acceptedRender);
      card.plan.render_ref = afterRef;
      card.render = {
        before_ref: card.render.before_ref,
        after_ref: afterRef,
        is_ai_generated: true,
        is_demo_asset: false,
        disclaimer:
          "效果图已通过机位、固定结构、圈选组件一致性、改造可见性与物理合理性视觉校验；仍需购买前复测尺寸。"
      };
      card.source_mode = "live";
      card.status = "ready";
      const roomSource = card.data_sources.find(
        (item) => item.kind === "room_analysis"
      );
      if (roomSource && roomAnalysis?.sourceMode === "live") {
        roomSource.source_type = "live";
        roomSource.label = "正式空间分析与规划管线";
        roomSource.updated_at = this.now().toISOString();
      }
      card.data_sources.push({
        kind: "render_evaluation",
        source_type: "live",
        label: "效果图视觉验收 Agent",
        updated_at: this.now().toISOString()
      });
    } else {
      artifacts.render_attempts.push({
        attempt: 0,
        source_mode: "demo",
        evaluation: {
          accepted: true,
          note: "Demo 模式复用演示图，不代表正式视觉校验已运行"
        }
      });
    }
    card.alternatives = [];
    card.notices.push({
      code: "formal_renewal_pipeline",
      level: "info",
      message:
        "正式规划由 LayoutPlan、不可替换 SourceComponent 与补充 ProductSlot 驱动；正式生图最多允许一次视觉校验回炉。"
    });
    card.trace.push({
      step: card.trace.length + 1,
      skill: "formal_layout_plan_and_render_validation",
      status: "completed",
      source_mode: card.source_mode,
      summary:
        "SourceComponent 作为不可替换视觉锚点，ProductSlot 只补充其他商品；效果图通过视觉验收后才进入结果。"
    });
    assertAICard(card);
    return { card, artifacts };
  }
}
