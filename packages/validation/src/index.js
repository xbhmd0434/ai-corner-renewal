export const VALIDATION_REPORT_VERSION = "1.0";

export const VALIDATION_CHECK_CODES = Object.freeze({
  PRICE_TOTAL: "price_total",
  BUDGET: "budget",
  NO_DRILLING: "no_drilling",
  PRESERVED_ELEMENTS: "preserved_elements",
  EDITABLE_ZONES: "editable_zones",
  STRUCTURE: "structure",
  DIMENSIONS: "dimensions",
  AVAILABILITY: "availability",
  PET_SAFETY: "pet_safety"
});

const DIMENSION_AXES = ["width", "depth", "height"];
const AVAILABLE_STATUSES = new Set(["available", "demo_available", "in_stock"]);
const LIMITED_STATUSES = new Set(["limited_stock", "preorder"]);
const UNKNOWN_AVAILABILITY_STATUSES = new Set(["unknown", "unchecked", "pending"]);
const UNAVAILABLE_STATUSES = new Set([
  "out_of_stock",
  "unavailable",
  "discontinued",
  "sold_out"
]);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const unique = (values) => [...new Set(values)];

const normalizeToken = (value) =>
  typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";

const formatList = (values) => unique(values).join("、");

function makeCheck(code, status, message, warnings = []) {
  return {
    check: { code, status, message },
    warnings
  };
}

function assertInputs(input) {
  if (!isObject(input)) {
    throw new TypeError("validateDesignPlan 需要一个参数对象");
  }

  const { plan, products, roomProfile, constraints } = input;
  if (!isObject(plan)) throw new TypeError("plan 必须是对象");
  if (typeof plan.plan_id !== "string" || plan.plan_id.trim() === "") {
    throw new TypeError("plan.plan_id 必须是非空字符串");
  }
  if (!Number.isInteger(plan.version) || plan.version < 1) {
    throw new TypeError("plan.version 必须是正整数");
  }
  if (!Array.isArray(products)) throw new TypeError("products 必须是数组");
  if (!isObject(roomProfile)) throw new TypeError("roomProfile 必须是对象");
  if (!isObject(constraints)) throw new TypeError("constraints 必须是对象");
}

function buildProductContext(plan, products) {
  const productIds = Array.isArray(plan.product_ids) ? plan.product_ids : [];
  const productIndex = new Map();
  const duplicateIds = new Set();

  for (const product of products) {
    if (!isObject(product) || typeof product.product_id !== "string") continue;
    if (productIndex.has(product.product_id)) duplicateIds.add(product.product_id);
    else productIndex.set(product.product_id, product);
  }

  const selected = productIds.map((productId) => ({
    productId,
    product: productIndex.get(productId)
  }));
  const missingIds = selected
    .filter(({ product }) => product === undefined)
    .map(({ productId }) => productId);
  const invalidPriceIds = selected
    .filter(
      ({ product }) =>
        product !== undefined &&
        (!Number.isInteger(product.price_cny) || product.price_cny < 0)
    )
    .map(({ productId }) => productId);
  const selectedDuplicateIds = productIds.filter((productId) => duplicateIds.has(productId));
  const priceIsCalculable =
    missingIds.length === 0 &&
    invalidPriceIds.length === 0 &&
    selectedDuplicateIds.length === 0;
  const calculatedTotal = priceIsCalculable
    ? selected.reduce((sum, { product }) => sum + product.price_cny, 0)
    : null;

  return {
    productIds,
    selected,
    missingIds,
    invalidPriceIds,
    duplicateIds: unique(selectedDuplicateIds),
    priceIsCalculable,
    calculatedTotal
  };
}

function checkPriceTotal(plan, context) {
  const problems = [];
  if (context.missingIds.length) {
    problems.push(`缺少商品：${formatList(context.missingIds)}`);
  }
  if (context.invalidPriceIds.length) {
    problems.push(`价格无效：${formatList(context.invalidPriceIds)}`);
  }
  if (context.duplicateIds.length) {
    problems.push(`商品数据重复：${formatList(context.duplicateIds)}`);
  }
  if (!Number.isInteger(plan.total_price_cny) || plan.total_price_cny < 0) {
    problems.push("方案总价不是有效的非负整数");
  }

  if (problems.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.PRICE_TOTAL,
      "fail",
      `无法核对商品价格合计；${problems.join("；")}`
    );
  }

  if (context.calculatedTotal !== plan.total_price_cny) {
    return makeCheck(
      VALIDATION_CHECK_CODES.PRICE_TOTAL,
      "fail",
      `方案写明 ¥${plan.total_price_cny}，所选商品实际合计 ¥${context.calculatedTotal}`
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.PRICE_TOTAL,
    "pass",
    `方案总价与 ${context.productIds.length} 件所选商品合计一致（¥${context.calculatedTotal}）`
  );
}

function checkBudget(plan, constraints, context) {
  const budget = constraints.budget_cny;
  if (!Number.isInteger(budget) || budget < 1) {
    return makeCheck(
      VALIDATION_CHECK_CODES.BUDGET,
      "warn",
      "预算缺失或无效，暂时无法确认方案是否超预算",
      ["confirm_budget_before_purchase"]
    );
  }

  const declaredTotalIsValid =
    Number.isInteger(plan.total_price_cny) && plan.total_price_cny >= 0;
  const price = context.priceIsCalculable
    ? context.calculatedTotal
    : declaredTotalIsValid
      ? plan.total_price_cny
      : null;

  if (price === null) {
    return makeCheck(
      VALIDATION_CHECK_CODES.BUDGET,
      "warn",
      `预算为 ¥${budget}，但方案价格无法核实`,
      ["confirm_budget_before_purchase"]
    );
  }

  if (price > budget) {
    return makeCheck(
      VALIDATION_CHECK_CODES.BUDGET,
      "fail",
      `所选商品合计 ¥${price}，超过预算 ¥${budget}（超出 ¥${price - budget}）`
    );
  }

  if (!context.priceIsCalculable) {
    return makeCheck(
      VALIDATION_CHECK_CODES.BUDGET,
      "warn",
      `方案标价 ¥${price} 未超过预算 ¥${budget}，但商品价格未能独立核实`,
      ["confirm_budget_before_purchase"]
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.BUDGET,
    "pass",
    `所选商品合计 ¥${price}，未超过预算 ¥${budget}（剩余 ¥${budget - price}）`
  );
}

function classifyInstallation(product) {
  if (!isObject(product)) return "unknown";
  if (product.requires_drilling === true) return "requires_drilling";
  if (product.requires_drilling === false) return "no_drilling";

  const installation = normalizeToken(product.installation);
  if (!installation) return "unknown";

  if (
    /(^|_)no_?drill(ing)?($|_)/.test(installation) ||
    /(免钉|免打孔|夹式|落地|倚墙|桌面)/.test(installation) ||
    [
      "freestanding",
      "free_standing",
      "clamp",
      "removable_adhesive",
      "adhesive",
      "leaning",
      "usb_powered",
      "tabletop",
      "desktop"
    ].includes(installation)
  ) {
    return "no_drilling";
  }

  if (
    /(requires?_?drill|drilling|wall_?mount|screw_?mount|hard_?mount|打孔|钻孔|膨胀螺丝|螺丝固定)/.test(
      installation
    )
  ) {
    return "requires_drilling";
  }

  return "unknown";
}

function checkNoDrilling(plan, constraints, context) {
  const hardConstraints = new Set(
    (Array.isArray(constraints.hard_constraints)
      ? constraints.hard_constraints
      : []
    ).map(normalizeToken)
  );
  const isRequired =
    hardConstraints.has("no_drilling") ||
    hardConstraints.has("no_drill") ||
    constraints.no_drilling === true;

  if (!isRequired) {
    return makeCheck(
      VALIDATION_CHECK_CODES.NO_DRILLING,
      "pass",
      "本次方案未启用“不打孔”硬约束"
    );
  }

  const requiresDrilling = [];
  const unknownInstallation = [];
  for (const { productId, product } of context.selected) {
    const classification = classifyInstallation(product);
    if (classification === "requires_drilling") requiresDrilling.push(productId);
    if (classification === "unknown") unknownInstallation.push(productId);
  }

  const planTags = new Set(
    (Array.isArray(plan.constraint_tags) ? plan.constraint_tags : []).map(normalizeToken)
  );
  if (
    planTags.has("requires_drilling") ||
    planTags.has("drilling_required") ||
    planTags.has("wall_drilling")
  ) {
    requiresDrilling.push("方案步骤");
  }

  if (requiresDrilling.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.NO_DRILLING,
      "fail",
      `违反“不打孔”硬约束：${formatList(requiresDrilling)} 需要打孔安装`
    );
  }

  if (unknownInstallation.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.NO_DRILLING,
      "warn",
      `以下商品安装方式不明确，需确认是否免打孔：${formatList(unknownInstallation)}`,
      ["confirm_installation_before_purchase"]
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.NO_DRILLING,
    "pass",
    `已核对 ${context.productIds.length} 件商品，均为免打孔安装方式`
  );
}

function checkPreservedElements(plan, constraints) {
  const hardConstraints = new Set(
    (Array.isArray(constraints.hard_constraints)
      ? constraints.hard_constraints
      : []
    ).map(normalizeToken)
  );
  const required = [];
  if (hardConstraints.has("keep_desk")) required.push("desk");
  if (hardConstraints.has("keep_chair")) required.push("chair");

  if (!required.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.PRESERVED_ELEMENTS,
      "pass",
      "本次方案没有 desk / chair 保留硬约束"
    );
  }

  const preserved = new Set(
    (Array.isArray(plan.preserved_elements) ? plan.preserved_elements : []).map(
      normalizeToken
    )
  );
  const missing = required.filter((element) => !preserved.has(element));

  if (missing.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.PRESERVED_ELEMENTS,
      "fail",
      `方案未声明保留硬约束对象：${formatList(missing)}`
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.PRESERVED_ELEMENTS,
    "pass",
    `方案明确保留：${formatList(required)}`
  );
}

function placementZone(placement) {
  if (!isObject(placement)) return "";
  return (
    placement.zone ??
    placement.target_zone ??
    placement.editable_zone ??
    placement.placement_zone ??
    ""
  );
}

function zoneIsAllowed(zone, editableZones) {
  const normalizedZone = normalizeToken(zone);
  return editableZones.some((candidate) => {
    const normalizedCandidate = normalizeToken(candidate);
    return (
      normalizedZone === normalizedCandidate ||
      normalizedZone.startsWith(`${normalizedCandidate}_`) ||
      normalizedZone.startsWith(`${normalizedCandidate}.`)
    );
  });
}

function checkEditableZones(plan, roomProfile, context) {
  const placements = Array.isArray(plan.placements) ? plan.placements : [];
  const editableZones = Array.isArray(roomProfile.editable_zones)
    ? roomProfile.editable_zones
    : [];

  if (!placements.length && !context.productIds.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.EDITABLE_ZONES,
      "pass",
      "方案没有新增商品或摆放操作"
    );
  }

  const outsideZones = [];
  const missingZoneProducts = [];
  const placedProductIds = new Set();

  placements.forEach((placement, index) => {
    const productId =
      isObject(placement) && typeof placement.product_id === "string"
        ? placement.product_id
        : `placement_${index + 1}`;
    if (isObject(placement) && typeof placement.product_id === "string") {
      placedProductIds.add(placement.product_id);
    }
    const zone = placementZone(placement);
    if (typeof zone !== "string" || zone.trim() === "") {
      missingZoneProducts.push(productId);
    } else if (!zoneIsAllowed(zone, editableZones)) {
      outsideZones.push(`${productId}@${zone}`);
    }
  });

  const unplacedProducts = context.productIds.filter(
    (productId) => !placedProductIds.has(productId)
  );
  const needsConfirmation = unique([...missingZoneProducts, ...unplacedProducts]);

  if (outsideZones.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.EDITABLE_ZONES,
      "fail",
      `以下摆放位置不在可编辑区内：${formatList(outsideZones)}`,
      needsConfirmation.length ? ["confirm_placement_zones"] : []
    );
  }

  if (needsConfirmation.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.EDITABLE_ZONES,
      "warn",
      `以下商品缺少可编辑区摆放证据：${formatList(needsConfirmation)}`,
      ["confirm_placement_zones"]
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.EDITABLE_ZONES,
    "pass",
    `全部 ${placements.length} 个摆放位置均位于可编辑区`
  );
}

function valuesFromFields(value, fieldNames) {
  const result = [];
  if (!isObject(value)) return result;
  for (const fieldName of fieldNames) {
    const fieldValue = value[fieldName];
    if (Array.isArray(fieldValue)) result.push(...fieldValue);
    else if (typeof fieldValue === "string") result.push(fieldValue);
  }
  return result;
}

function checkStructure(plan, roomProfile) {
  const problems = [];
  if (
    typeof plan.room_id === "string" &&
    typeof roomProfile.room_id === "string" &&
    plan.room_id !== roomProfile.room_id
  ) {
    problems.push(
      `方案属于房间 ${plan.room_id}，当前空间为 ${roomProfile.room_id}`
    );
  }

  const placements = Array.isArray(plan.placements) ? plan.placements : [];
  const structuralFlags = [
    plan.modifies_structure === true,
    plan.structure_changed === true,
    plan.render_structure_consistent === false,
    ...placements.map(
      (placement) =>
        isObject(placement) &&
        (placement.modifies_structure === true ||
          placement.structure_changed === true)
    )
  ];
  if (structuralFlags.some(Boolean)) {
    problems.push("方案明确标记了结构改动或结构保持失败");
  }

  const changeFields = [
    "modified_elements",
    "removed_elements",
    "replaced_elements",
    "affects_elements"
  ];
  const changedElements = [
    ...valuesFromFields(plan, changeFields),
    ...placements.flatMap((placement) => valuesFromFields(placement, changeFields))
  ];
  const fixedElements = new Map(
    (Array.isArray(roomProfile.fixed_elements)
      ? roomProfile.fixed_elements
      : []
    ).map((element) => [normalizeToken(element), element])
  );
  const changedFixedElements = unique(
    changedElements
      .map(normalizeToken)
      .filter((element) => fixedElements.has(element))
      .map((element) => fixedElements.get(element))
  );
  if (changedFixedElements.length) {
    problems.push(`改动了固定结构：${formatList(changedFixedElements)}`);
  }

  const planTags = new Set(
    (Array.isArray(plan.constraint_tags) ? plan.constraint_tags : []).map(
      normalizeToken
    )
  );
  if (
    planTags.has("structure_changed") ||
    planTags.has("fixed_element_changed") ||
    planTags.has("remove_fixed_element")
  ) {
    problems.push("方案标签表明固定结构发生改动");
  }

  if (problems.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.STRUCTURE,
      "fail",
      problems.join("；")
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.STRUCTURE,
    "pass",
    "方案未声明改动固定结构，且房间身份一致"
  );
}

function isKnownDimension(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function dimensionValue(dimensions, axis) {
  if (!isObject(dimensions)) return undefined;
  return dimensions[axis] ?? dimensions[`${axis}_cm`];
}

function isDimensionRelated(value) {
  return (
    typeof value === "string" &&
    /(width|depth|height|length|dimension|size|measure|clearance|diameter|radius|reference|_cm|宽|深|高|长|尺寸|间距|距离)/i.test(
      value
    )
  );
}

function isDesktopZone(value) {
  const zone = normalizeToken(value);
  return (
    zone === "desktop" ||
    zone.startsWith("desktop_") ||
    zone.startsWith("desktop.")
  );
}

function requiredDeskWidthFromAssumption(value) {
  if (typeof value !== "string") return null;
  const match = normalizeToken(value).match(
    /^desk_width_at_least_(\d+(?:\.\d+)?)cm$/
  );
  if (!match) return null;
  const width = Number(match[1]);
  return isKnownDimension(width) ? width : null;
}

function getFitProblems(plan, roomProfile, context) {
  const productIndex = new Map(
    context.selected
      .filter(({ product }) => isObject(product))
      .map(({ productId, product }) => [productId, product])
  );
  const fitProblems = [];
  const uncertainFits = [];
  const placements = Array.isArray(plan.placements) ? plan.placements : [];

  for (const placement of placements) {
    if (!isObject(placement)) continue;
    const productId =
      typeof placement.product_id === "string"
        ? placement.product_id
        : "unknown_product";
    const explicitFit = normalizeToken(placement.fit_status);
    if (["does_not_fit", "too_large", "fail"].includes(explicitFit)) {
      fitProblems.push(`${productId} 标记为放不下`);
      continue;
    }
    if (["unknown", "needs_confirmation"].includes(explicitFit)) {
      uncertainFits.push(productId);
    }

    const product = productIndex.get(productId);
    const roomReferenceWidth = roomProfile.reference_width_cm;
    const productWidth = isObject(product)
      ? dimensionValue(product.dimensions_cm, "width")
      : undefined;
    if (
      isDesktopZone(placementZone(placement)) &&
      isKnownDimension(roomReferenceWidth) &&
      isKnownDimension(productWidth) &&
      productWidth > roomReferenceWidth
    ) {
      fitProblems.push(
        `${productId} 的 width ${productWidth}cm 超过桌面参考宽度 ${roomReferenceWidth}cm`
      );
    }

    const requiredDimensions =
      placement.required_dimensions_cm ??
      (isObject(product) ? product.dimensions_cm : undefined);
    const availableDimensions =
      placement.available_dimensions_cm ??
      placement.zone_dimensions_cm ??
      placement.max_dimensions_cm;
    if (!isObject(requiredDimensions) || !isObject(availableDimensions)) continue;

    for (const axis of DIMENSION_AXES) {
      const required = dimensionValue(requiredDimensions, axis);
      const available = dimensionValue(availableDimensions, axis);
      if (isKnownDimension(required) && isKnownDimension(available) && required > available) {
        fitProblems.push(
          `${productId} 的 ${axis} ${required}cm 超过可用 ${available}cm`
        );
      }
    }
  }

  if (isKnownDimension(roomProfile.reference_width_cm)) {
    for (const assumption of Array.isArray(plan.assumptions)
      ? plan.assumptions
      : []) {
      const requiredWidth = requiredDeskWidthFromAssumption(assumption);
      if (
        requiredWidth !== null &&
        roomProfile.reference_width_cm < requiredWidth
      ) {
        fitProblems.push(
          `方案假设桌面宽度至少 ${requiredWidth}cm，当前参考宽度为 ${roomProfile.reference_width_cm}cm`
        );
      }
    }
  }

  return {
    fitProblems: unique(fitProblems),
    uncertainFits: unique(uncertainFits)
  };
}

function checkDimensions(plan, roomProfile, context) {
  const unknownProductDimensions = [];
  for (const { productId, product } of context.selected) {
    if (!isObject(product)) {
      unknownProductDimensions.push(productId);
      continue;
    }
    const dimensions = product.dimensions_cm;
    const unknownAxes = DIMENSION_AXES.filter(
      (axis) => !isKnownDimension(dimensionValue(dimensions, axis))
    );
    if (unknownAxes.length) {
      unknownProductDimensions.push(`${productId}(${unknownAxes.join("/")})`);
    }
  }

  const roomUnknowns = [];
  if (!isKnownDimension(roomProfile.reference_width_cm)) {
    roomUnknowns.push("reference_width_cm");
  }
  for (const value of [
    ...(Array.isArray(roomProfile.needs_confirmation)
      ? roomProfile.needs_confirmation
      : []),
    ...(Array.isArray(roomProfile.uncertainties)
      ? roomProfile.uncertainties
      : [])
  ]) {
    if (isDimensionRelated(value)) roomUnknowns.push(value);
  }

  const dimensionalAssumptions = (Array.isArray(plan.assumptions)
    ? plan.assumptions
    : []
  ).filter(isDimensionRelated);
  const { fitProblems, uncertainFits } = getFitProblems(
    plan,
    roomProfile,
    context
  );

  const warnings = [];
  if (
    unknownProductDimensions.length ||
    roomUnknowns.length ||
    dimensionalAssumptions.length ||
    uncertainFits.length
  ) {
    warnings.push("confirm_dimensions_before_purchase");
    for (const unknown of unique(roomUnknowns)) {
      warnings.push(`measure_${normalizeToken(unknown)}_before_purchase`);
    }
  }

  if (fitProblems.length) {
    const uncertaintyNotes = [];
    if (unknownProductDimensions.length) {
      uncertaintyNotes.push(`商品尺寸不全：${formatList(unknownProductDimensions)}`);
    }
    if (roomUnknowns.length) {
      uncertaintyNotes.push(`空间尺寸待确认：${formatList(roomUnknowns)}`);
    }
    return makeCheck(
      VALIDATION_CHECK_CODES.DIMENSIONS,
      "fail",
      `存在明确的尺寸冲突：${formatList(fitProblems)}${
        uncertaintyNotes.length ? `；${uncertaintyNotes.join("；")}` : ""
      }`,
      warnings
    );
  }

  const notes = [];
  if (unknownProductDimensions.length) {
    notes.push(`商品尺寸不全：${formatList(unknownProductDimensions)}`);
  }
  if (roomUnknowns.length) {
    notes.push(`空间尺寸待确认：${formatList(roomUnknowns)}`);
  }
  if (dimensionalAssumptions.length) {
    notes.push(`方案依赖尺寸假设：${formatList(dimensionalAssumptions)}`);
  }
  if (uncertainFits.length) {
    notes.push(`摆放适配待确认：${formatList(uncertainFits)}`);
  }

  if (notes.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.DIMENSIONS,
      "warn",
      `${notes.join("；")}。购买前需复测`,
      warnings
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.DIMENSIONS,
    "pass",
    "商品和空间的必要尺寸信息完整，未发现明确冲突"
  );
}

function checkAvailability(context) {
  if (context.missingIds.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.AVAILABILITY,
      "fail",
      `方案引用了商品库中不存在的商品：${formatList(context.missingIds)}`
    );
  }

  const unavailable = [];
  const needsConfirmation = [];
  for (const { productId, product } of context.selected) {
    const status = normalizeToken(product?.availability?.status);
    if (AVAILABLE_STATUSES.has(status)) continue;
    if (UNAVAILABLE_STATUSES.has(status)) unavailable.push(productId);
    else if (
      LIMITED_STATUSES.has(status) ||
      UNKNOWN_AVAILABILITY_STATUSES.has(status) ||
      !status
    ) {
      needsConfirmation.push(productId);
    } else {
      needsConfirmation.push(productId);
    }
  }

  if (unavailable.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.AVAILABILITY,
      "fail",
      `以下商品当前不可购买：${formatList(unavailable)}`,
      needsConfirmation.length ? ["confirm_inventory_before_purchase"] : []
    );
  }

  if (needsConfirmation.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.AVAILABILITY,
      "warn",
      `以下商品库存状态需确认：${formatList(needsConfirmation)}`,
      ["confirm_inventory_before_purchase"]
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.AVAILABILITY,
    "pass",
    `全部 ${context.productIds.length} 件商品均标记为可购买`
  );
}

function petSafetyIsRequired(constraints) {
  const hardConstraints = new Set(
    (Array.isArray(constraints.hard_constraints)
      ? constraints.hard_constraints
      : []
    ).map(normalizeToken)
  );
  return (
    ["pet_safe", "pet_friendly", "has_pet", "has_cat", "cat_safe"].some((value) =>
      hardConstraints.has(value)
    ) ||
    constraints.pet_safe_required === true ||
    constraints.pet_friendly === true ||
    constraints.has_pet === true ||
    constraints.household?.has_pet === true
  );
}

function checkPetSafety(constraints, context) {
  if (!petSafetyIsRequired(constraints)) {
    return makeCheck(
      VALIDATION_CHECK_CODES.PET_SAFETY,
      "pass",
      "本次方案未启用宠物安全硬约束"
    );
  }

  const unsafe = [];
  const unknown = [];
  for (const { productId, product } of context.selected) {
    if (product?.pet_safe === false) unsafe.push(productId);
    else if (product?.pet_safe !== true) unknown.push(productId);
  }

  if (unsafe.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.PET_SAFETY,
      "fail",
      `以下商品不满足宠物安全要求：${formatList(unsafe)}`,
      unknown.length ? ["confirm_pet_safety_before_purchase"] : []
    );
  }

  if (unknown.length) {
    return makeCheck(
      VALIDATION_CHECK_CODES.PET_SAFETY,
      "warn",
      `以下商品缺少宠物安全结论：${formatList(unknown)}`,
      ["confirm_pet_safety_before_purchase"]
    );
  }

  return makeCheck(
    VALIDATION_CHECK_CODES.PET_SAFETY,
    "pass",
    `全部 ${context.productIds.length} 件商品均标记为宠物安全`
  );
}

/**
 * Deterministically validates one DesignPlan snapshot against its source facts.
 *
 * The function does not mutate its arguments, read the clock, perform I/O, or
 * infer facts from plan copy. Its output conforms to ValidationReport v1.
 */
export function validateDesignPlan(input) {
  assertInputs(input);
  const { plan, products, roomProfile, constraints } = input;
  const productContext = buildProductContext(plan, products);

  const results = [
    checkPriceTotal(plan, productContext),
    checkBudget(plan, constraints, productContext),
    checkNoDrilling(plan, constraints, productContext),
    checkPreservedElements(plan, constraints),
    checkEditableZones(plan, roomProfile, productContext),
    checkStructure(plan, roomProfile),
    checkDimensions(plan, roomProfile, productContext),
    checkAvailability(productContext),
    checkPetSafety(constraints, productContext)
  ];
  const checks = results.map(({ check }) => check);
  const warnings = unique(results.flatMap((result) => result.warnings));
  const hasFailure = checks.some(({ status }) => status === "fail");
  const hasWarning = checks.some(({ status }) => status === "warn");

  return {
    report_id: `validation-${plan.plan_id}-v${plan.version}`,
    plan_id: plan.plan_id,
    plan_version: plan.version,
    overall_status: hasFailure
      ? "failed"
      : hasWarning
        ? "needs_confirmation"
        : "pass",
    checks,
    warnings
  };
}
