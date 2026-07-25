export const SCHEMA_VERSION = "1.0";

const SOURCE_MODES = new Set(["demo", "live", "fallback"]);
const CARD_STATUSES = new Set(["ready", "needs_input", "fallback_ready"]);
const VALIDATION_STATUSES = new Set(["pass", "needs_confirmation", "failed", "blocked"]);
const CHECK_STATUSES = new Set(["pass", "warn", "fail"]);
const ANALYSIS_MODES = new Set(["auto", "demo", "live"]);
const STYLE_KEYS = new Set(["warm", "compact", "green"]);
const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HARD_CONSTRAINTS = new Set([
  "no_drilling",
  "keep_desk",
  "keep_chair",
  "pet_safe"
]);
const MAX_ISSUES = 100;
const MAX_TEXT_LENGTH = 10_000;
const IMAGE_REFERENCE_PREFIXES = [
  "./",
  "/",
  "client://",
  "demo://",
  "asset://",
  "https://"
];

export class ContractValidationError extends Error {
  constructor(message, issues, statusCode = 422) {
    super(message);
    this.name = "ContractValidationError";
    this.code = "contract_validation_failed";
    this.statusCode = statusCode;
    this.issues = issues;
  }
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasText = (value) => typeof value === "string" && value.trim().length > 0;

const add = (issues, path, message) => {
  if (issues.length < MAX_ISSUES) issues.push({ path, message });
};

function rejectUnknownKeys(value, path, issues, allowedKeys) {
  if (!isObject(value)) return;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) add(issues, `${path}.${key}`, "不支持该字段");
  }
}

function validateImageReference(value, path, issues) {
  if (!requireText(value, path, issues, { maxLength: 2048 })) return;
  if (
    /\s|\\/.test(value) ||
    /^data:/i.test(value) ||
    value.startsWith("//")
  ) {
    add(issues, path, "必须是安全的本地引用或 HTTPS URL，Data URL 请放入 data_url");
    return;
  }
  if (!IMAGE_REFERENCE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    add(
      issues,
      path,
      "只支持 ./、/、client://、demo://、asset:// 或 https:// 引用"
    );
    return;
  }
  if (value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      if (parsed.username || parsed.password) {
        add(issues, path, "HTTPS 图片引用不能包含用户名或密码");
      }
    } catch {
      add(issues, path, "HTTPS 图片引用必须是有效绝对 URL");
    }
  }
}

function validateImageDataUrl(value, mediaType, path, issues) {
  if (!requireText(value, path, issues, { maxLength: 8_000_000 })) {
    return undefined;
  }
  const match = value.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/
  );
  if (!match || match[2].length % 4 !== 0) {
    add(issues, path, "必须是完整且格式正确的 JPEG、PNG 或 WebP Base64 Data URL");
    return undefined;
  }

  const detectedMediaType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const magicMatches =
    (detectedMediaType === "image/png" && isPng) ||
    (detectedMediaType === "image/jpeg" && isJpeg) ||
    (detectedMediaType === "image/webp" && isWebp);
  if (!magicMatches) {
    add(issues, path, `文件签名与 ${detectedMediaType} 声明不一致`);
  }
  if (mediaType && mediaType !== detectedMediaType) {
    add(issues, path.replace(/data_url$/, "media_type"), "必须与 data_url 中的媒体类型一致");
  }
  return detectedMediaType;
}

function requireObject(value, path, issues) {
  if (!isObject(value)) {
    add(issues, path, "必须是对象");
    return false;
  }
  return true;
}

function requireText(value, path, issues, { maxLength = MAX_TEXT_LENGTH } = {}) {
  if (!hasText(value)) {
    add(issues, path, "必须是非空字符串");
    return false;
  }
  if (value.length > maxLength) {
    add(issues, path, `长度不能超过 ${maxLength}`);
    return false;
  }
  return true;
}

function requireInteger(value, path, issues, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    add(issues, path, `必须是 ${min}～${max} 之间的整数`);
    return false;
  }
  return true;
}

function requireStringArray(
  value,
  path,
  issues,
  { minItems = 0, maxItems = 64, itemMaxLength = 256 } = {}
) {
  if (!Array.isArray(value)) {
    add(issues, path, "必须是字符串数组");
    return false;
  }
  if (value.length < minItems) {
    add(issues, path, `至少需要 ${minItems} 项`);
  }
  if (value.length > maxItems) {
    add(issues, path, `不能超过 ${maxItems} 项`);
  }
  const boundedItems = value.slice(0, maxItems);
  boundedItems.forEach((item, index) =>
    requireText(item, `${path}[${index}]`, issues, { maxLength: itemMaxLength })
  );
  if (new Set(boundedItems).size !== boundedItems.length) {
    add(issues, path, "不能包含重复项");
  }
  return true;
}

function validateConstraints(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "budget_cny",
    "hard_constraints",
    "soft_preferences",
    "goals"
  ]);
  requireInteger(value.budget_cny, `${path}.budget_cny`, issues, { min: 1, max: 1_000_000 });
  if (
    requireStringArray(value.hard_constraints, `${path}.hard_constraints`, issues, {
      maxItems: 16,
      itemMaxLength: 64
    })
  ) {
    value.hard_constraints.slice(0, 16).forEach((constraint, index) => {
      if (hasText(constraint) && !HARD_CONSTRAINTS.has(constraint)) {
        add(
          issues,
          `${path}.hard_constraints[${index}]`,
          `v1 不支持硬约束 ${constraint}`
        );
      }
    });
  }
  requireStringArray(value.soft_preferences, `${path}.soft_preferences`, issues);
  requireStringArray(value.goals, `${path}.goals`, issues, { minItems: 1 });
}

export function validateGenerateRequest(value) {
  const issues = [];
  if (!requireObject(value, "$", issues)) return issues;
  rejectUnknownKeys(value, "$", issues, [
    "schema_version",
    "room_input",
    "inspiration_input",
    "constraints",
    "options"
  ]);

  if (value.schema_version !== SCHEMA_VERSION) {
    add(issues, "$.schema_version", `只支持 ${SCHEMA_VERSION}`);
  }

  if (requireObject(value.room_input, "$.room_input", issues)) {
    rejectUnknownKeys(value.room_input, "$.room_input", issues, [
      "room_id",
      "image",
      "reference_width_cm",
      "quality_hint"
    ]);
    requireText(value.room_input.room_id, "$.room_input.room_id", issues);
    if (requireObject(value.room_input.image, "$.room_input.image", issues)) {
      rejectUnknownKeys(value.room_input.image, "$.room_input.image", issues, [
        "reference",
        "data_url",
        "media_type"
      ]);
      const { reference, data_url: dataUrl, media_type: mediaType } = value.room_input.image;
      if (!hasText(reference) && !hasText(dataUrl)) {
        add(issues, "$.room_input.image", "reference 与 data_url 至少提供一个");
      }
      if (reference !== undefined) {
        validateImageReference(reference, "$.room_input.image.reference", issues);
      }
      if (dataUrl !== undefined) {
        validateImageDataUrl(
          dataUrl,
          mediaType,
          "$.room_input.image.data_url",
          issues
        );
      }
      if (mediaType !== undefined && !IMAGE_MEDIA_TYPES.has(mediaType)) {
        add(issues, "$.room_input.image.media_type", "只支持 image/jpeg、image/png 或 image/webp");
      }
    }
    if (value.room_input.reference_width_cm !== undefined && value.room_input.reference_width_cm !== null) {
      requireInteger(value.room_input.reference_width_cm, "$.room_input.reference_width_cm", issues, {
        min: 40,
        max: 400
      });
    }
    if (
      value.room_input.quality_hint !== undefined &&
      !["clear", "blurry", "partial"].includes(value.room_input.quality_hint)
    ) {
      add(issues, "$.room_input.quality_hint", "必须是 clear、blurry 或 partial");
    }
  }

  if (requireObject(value.inspiration_input, "$.inspiration_input", issues)) {
    rejectUnknownKeys(value.inspiration_input, "$.inspiration_input", issues, [
      "inspiration_id",
      "source_type",
      "style_key"
    ]);
    requireText(value.inspiration_input.inspiration_id, "$.inspiration_input.inspiration_id", issues);
    if (!["demo", "authorized_public", "user_owned"].includes(value.inspiration_input.source_type)) {
      add(issues, "$.inspiration_input.source_type", "必须是 demo、authorized_public 或 user_owned");
    }
    if (
      requireText(
        value.inspiration_input.style_key,
        "$.inspiration_input.style_key",
        issues
      ) &&
      !STYLE_KEYS.has(value.inspiration_input.style_key)
    ) {
      add(
        issues,
        "$.inspiration_input.style_key",
        "v1 只支持 warm、compact 或 green"
      );
    }
  }

  validateConstraints(value.constraints, "$.constraints", issues);

  if (value.options !== undefined) {
    if (requireObject(value.options, "$.options", issues)) {
      rejectUnknownKeys(value.options, "$.options", issues, [
        "analysis_mode",
        "include_trace"
      ]);
      if (
        value.options.analysis_mode !== undefined &&
        !ANALYSIS_MODES.has(value.options.analysis_mode)
      ) {
        add(issues, "$.options.analysis_mode", "必须是 auto、demo 或 live");
      }
      if (
        value.options.include_trace !== undefined &&
        typeof value.options.include_trace !== "boolean"
      ) {
        add(issues, "$.options.include_trace", "必须是布尔值");
      }
    }
  }

  return issues;
}

export function assertGenerateRequest(value) {
  const issues = validateGenerateRequest(value);
  if (issues.length) {
    throw new ContractValidationError("生成请求不符合 GenerateRequest v1", issues);
  }
  return value;
}

export function validateReviseRequest(value) {
  const issues = [];
  if (!requireObject(value, "$", issues)) return issues;
  rejectUnknownKeys(value, "$", issues, [
    "schema_version",
    "request_id",
    "plan_id",
    "target_budget_cny"
  ]);
  if (value.schema_version !== SCHEMA_VERSION) {
    add(issues, "$.schema_version", `只支持 ${SCHEMA_VERSION}`);
  }
  requireText(value.request_id, "$.request_id", issues);
  requireText(value.plan_id, "$.plan_id", issues);
  requireInteger(value.target_budget_cny, "$.target_budget_cny", issues, {
    min: 1,
    max: 1_000_000
  });
  return issues;
}

export function assertReviseRequest(value) {
  const issues = validateReviseRequest(value);
  if (issues.length) {
    throw new ContractValidationError("调整请求不符合 ReviseRequest v1", issues);
  }
  return value;
}

export function validateRoomProfile(value, path = "$") {
  const issues = [];
  if (!requireObject(value, path, issues)) return issues;
  rejectUnknownKeys(value, path, issues, [
    "room_id",
    "room_type",
    "reference_width_cm",
    "fixed_elements",
    "editable_zones",
    "lighting",
    "uncertainties",
    "needs_confirmation"
  ]);
  requireText(value.room_id, `${path}.room_id`, issues);
  requireText(value.room_type, `${path}.room_type`, issues);
  if (value.reference_width_cm !== null) {
    requireInteger(value.reference_width_cm, `${path}.reference_width_cm`, issues, {
      min: 40,
      max: 400
    });
  }
  requireStringArray(value.fixed_elements, `${path}.fixed_elements`, issues);
  requireStringArray(value.editable_zones, `${path}.editable_zones`, issues);
  if (requireObject(value.lighting, `${path}.lighting`, issues)) {
    rejectUnknownKeys(value.lighting, `${path}.lighting`, issues, [
      "direction",
      "confidence"
    ]);
    requireText(value.lighting.direction, `${path}.lighting.direction`, issues);
    if (
      typeof value.lighting.confidence !== "number" ||
      value.lighting.confidence < 0 ||
      value.lighting.confidence > 1
    ) {
      add(issues, `${path}.lighting.confidence`, "必须是 0～1 的数值");
    }
  }
  requireStringArray(value.uncertainties, `${path}.uncertainties`, issues);
  requireStringArray(value.needs_confirmation, `${path}.needs_confirmation`, issues);
  return issues;
}

export function assertRoomProfile(value) {
  const issues = validateRoomProfile(value);
  if (issues.length) {
    throw new ContractValidationError("RoomProfile 不符合 v1 协议", issues, 502);
  }
  return value;
}

function validateProduct(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "product_id",
    "name",
    "category",
    "price_cny",
    "dimensions_cm",
    "dimensions_label",
    "installation",
    "pet_safe",
    "reason",
    "availability",
    "source",
    "replacement_for"
  ]);
  requireText(value.product_id, `${path}.product_id`, issues);
  requireText(value.name, `${path}.name`, issues);
  requireText(value.category, `${path}.category`, issues);
  requireInteger(value.price_cny, `${path}.price_cny`, issues, { min: 0, max: 1_000_000 });
  requireText(value.installation, `${path}.installation`, issues);
  if (typeof value.pet_safe !== "boolean" && value.pet_safe !== null) {
    add(issues, `${path}.pet_safe`, "必须是布尔值或 null");
  }
  requireText(value.reason, `${path}.reason`, issues);
  if (value.replacement_for !== undefined) {
    requireText(value.replacement_for, `${path}.replacement_for`, issues);
  }
  if (!requireObject(value.dimensions_cm, `${path}.dimensions_cm`, issues)) {
    // Object error is already recorded.
  } else {
    rejectUnknownKeys(value.dimensions_cm, `${path}.dimensions_cm`, issues, [
      "width",
      "depth",
      "height"
    ]);
    for (const dimension of ["width", "depth", "height"]) {
      const dimensionValue = value.dimensions_cm[dimension];
      if (
        dimensionValue !== null &&
        (typeof dimensionValue !== "number" || dimensionValue <= 0)
      ) {
        add(issues, `${path}.dimensions_cm.${dimension}`, "必须是正数或 null");
      }
    }
  }
  requireText(value.dimensions_label, `${path}.dimensions_label`, issues);
  if (requireObject(value.availability, `${path}.availability`, issues)) {
    rejectUnknownKeys(value.availability, `${path}.availability`, issues, [
      "status",
      "source_type",
      "checked_at"
    ]);
    requireText(value.availability.status, `${path}.availability.status`, issues);
    requireText(value.availability.source_type, `${path}.availability.source_type`, issues);
    requireText(value.availability.checked_at, `${path}.availability.checked_at`, issues);
  }
  if (requireObject(value.source, `${path}.source`, issues)) {
    rejectUnknownKeys(value.source, `${path}.source`, issues, [
      "source_type",
      "label",
      "updated_at"
    ]);
    requireText(value.source.source_type, `${path}.source.source_type`, issues);
    requireText(value.source.label, `${path}.source.label`, issues);
    requireText(value.source.updated_at, `${path}.source.updated_at`, issues);
  }
}

function validatePlan(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "plan_id",
    "room_id",
    "inspiration_id",
    "version",
    "title",
    "summary",
    "total_price_cny",
    "product_ids",
    "preserved_elements",
    "placements",
    "steps",
    "render_ref",
    "assumptions",
    "constraint_tags",
    "revision"
  ]);
  requireText(value.plan_id, `${path}.plan_id`, issues);
  requireText(value.room_id, `${path}.room_id`, issues);
  requireText(value.inspiration_id, `${path}.inspiration_id`, issues);
  requireInteger(value.version, `${path}.version`, issues, { min: 1, max: 1_000_000 });
  requireText(value.title, `${path}.title`, issues);
  requireText(value.summary, `${path}.summary`, issues);
  requireInteger(value.total_price_cny, `${path}.total_price_cny`, issues, {
    min: 0,
    max: 1_000_000
  });
  requireStringArray(value.product_ids, `${path}.product_ids`, issues);
  requireStringArray(value.preserved_elements, `${path}.preserved_elements`, issues);
  if (!Array.isArray(value.placements)) {
    add(issues, `${path}.placements`, "必须是数组");
  } else {
    value.placements.forEach((placement, index) => {
      const placementPath = `${path}.placements[${index}]`;
      if (!requireObject(placement, placementPath, issues)) return;
      rejectUnknownKeys(placement, placementPath, issues, [
        "product_id",
        "zone",
        "instruction"
      ]);
      requireText(placement.product_id, `${placementPath}.product_id`, issues);
      requireText(placement.zone, `${placementPath}.zone`, issues);
      requireText(placement.instruction, `${placementPath}.instruction`, issues);
    });
  }
  if (!Array.isArray(value.steps)) {
    add(issues, `${path}.steps`, "必须是数组");
  } else {
    value.steps.forEach((step, index) => {
      const stepPath = `${path}.steps[${index}]`;
      if (!requireObject(step, stepPath, issues)) return;
      rejectUnknownKeys(step, stepPath, issues, [
        "step_id",
        "title",
        "instruction"
      ]);
      requireText(step.step_id, `${stepPath}.step_id`, issues);
      requireText(step.title, `${stepPath}.title`, issues);
      requireText(step.instruction, `${stepPath}.instruction`, issues);
    });
  }
  requireText(value.render_ref, `${path}.render_ref`, issues);
  requireStringArray(value.assumptions, `${path}.assumptions`, issues);
  requireStringArray(value.constraint_tags, `${path}.constraint_tags`, issues);
  if (value.revision !== undefined) {
    const revisionPath = `${path}.revision`;
    if (requireObject(value.revision, revisionPath, issues)) {
      rejectUnknownKeys(value.revision, revisionPath, issues, [
        "parent_plan_id",
        "target_budget_cny",
        "reason",
        "removed_product_ids",
        "added_product_ids"
      ]);
      requireText(value.revision.parent_plan_id, `${revisionPath}.parent_plan_id`, issues);
      requireInteger(
        value.revision.target_budget_cny,
        `${revisionPath}.target_budget_cny`,
        issues,
        { min: 1, max: 1_000_000 }
      );
      requireText(value.revision.reason, `${revisionPath}.reason`, issues);
      requireStringArray(
        value.revision.removed_product_ids,
        `${revisionPath}.removed_product_ids`,
        issues
      );
      requireStringArray(
        value.revision.added_product_ids,
        `${revisionPath}.added_product_ids`,
        issues
      );
    }
  }
}

function validateReport(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "report_id",
    "plan_id",
    "plan_version",
    "overall_status",
    "checks",
    "warnings"
  ]);
  requireText(value.report_id, `${path}.report_id`, issues);
  requireText(value.plan_id, `${path}.plan_id`, issues);
  requireInteger(value.plan_version, `${path}.plan_version`, issues, {
    min: 1,
    max: 1_000_000
  });
  if (!VALIDATION_STATUSES.has(value.overall_status)) {
    add(issues, `${path}.overall_status`, "必须是 pass、needs_confirmation、failed 或 blocked");
  }
  if (!Array.isArray(value.checks)) {
    add(issues, `${path}.checks`, "必须是数组");
  } else {
    value.checks.forEach((check, index) => {
      const checkPath = `${path}.checks[${index}]`;
      if (!requireObject(check, checkPath, issues)) return;
      rejectUnknownKeys(check, checkPath, issues, [
        "code",
        "status",
        "message"
      ]);
      requireText(check.code, `${checkPath}.code`, issues);
      if (!CHECK_STATUSES.has(check.status)) {
        add(issues, `${checkPath}.status`, "必须是 pass、warn 或 fail");
      }
      requireText(check.message, `${checkPath}.message`, issues);
    });
  }
  requireStringArray(value.warnings, `${path}.warnings`, issues);
}

function validateRender(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "before_ref",
    "after_ref",
    "is_ai_generated",
    "is_demo_asset",
    "disclaimer"
  ]);
  requireText(value.before_ref, `${path}.before_ref`, issues);
  if (value.after_ref !== null) requireText(value.after_ref, `${path}.after_ref`, issues);
  if (typeof value.is_ai_generated !== "boolean") {
    add(issues, `${path}.is_ai_generated`, "必须是布尔值");
  }
  if (typeof value.is_demo_asset !== "boolean") {
    add(issues, `${path}.is_demo_asset`, "必须是布尔值");
  }
  requireText(value.disclaimer, `${path}.disclaimer`, issues);
}

function validateTutorial(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "content_id",
    "title",
    "author",
    "reason",
    "source",
    "jump_url"
  ]);
  requireText(value.content_id, `${path}.content_id`, issues);
  requireText(value.title, `${path}.title`, issues);
  requireText(value.author, `${path}.author`, issues);
  requireText(value.reason, `${path}.reason`, issues);
  if (value.jump_url !== null) requireText(value.jump_url, `${path}.jump_url`, issues);
  if (requireObject(value.source, `${path}.source`, issues)) {
    rejectUnknownKeys(value.source, `${path}.source`, issues, [
      "source_type",
      "label",
      "updated_at"
    ]);
    requireText(value.source.source_type, `${path}.source.source_type`, issues);
    requireText(value.source.label, `${path}.source.label`, issues);
    requireText(value.source.updated_at, `${path}.source.updated_at`, issues);
  }
}

function validateNotice(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, ["code", "level", "message"]);
  requireText(value.code, `${path}.code`, issues);
  if (!["info", "warning", "error"].includes(value.level)) {
    add(issues, `${path}.level`, "必须是 info、warning 或 error");
  }
  requireText(value.message, `${path}.message`, issues);
}

function validateDataSource(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "kind",
    "source_type",
    "label",
    "updated_at"
  ]);
  requireText(value.kind, `${path}.kind`, issues);
  requireText(value.source_type, `${path}.source_type`, issues);
  requireText(value.label, `${path}.label`, issues);
  requireText(value.updated_at, `${path}.updated_at`, issues);
}

function validateTrace(value, path, issues) {
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "step",
    "skill",
    "status",
    "source_mode",
    "summary"
  ]);
  requireInteger(value.step, `${path}.step`, issues, { min: 1, max: 10_000 });
  requireText(value.skill, `${path}.skill`, issues);
  if (!["completed", "fallback", "skipped"].includes(value.status)) {
    add(issues, `${path}.status`, "必须是 completed、fallback 或 skipped");
  }
  if (!SOURCE_MODES.has(value.source_mode)) {
    add(issues, `${path}.source_mode`, "必须是 demo、live 或 fallback");
  }
  requireText(value.summary, `${path}.summary`, issues);
}

function validateFollowUp(value, path, issues) {
  if (value === null) return;
  if (!requireObject(value, path, issues)) return;
  rejectUnknownKeys(value, path, issues, [
    "reason_code",
    "question",
    "required_fields",
    "can_continue_with_assumptions"
  ]);
  requireText(value.reason_code, `${path}.reason_code`, issues);
  requireText(value.question, `${path}.question`, issues);
  requireStringArray(value.required_fields, `${path}.required_fields`, issues);
  if (typeof value.can_continue_with_assumptions !== "boolean") {
    add(issues, `${path}.can_continue_with_assumptions`, "必须是布尔值");
  }
}

function validatePlanOptionConsistency(
  { plan, validation, products, render },
  path,
  issues
) {
  if (!isObject(plan)) return;
  if (isObject(validation)) {
    if (validation.plan_id !== plan.plan_id) {
      add(issues, `${path}.validation.plan_id`, "必须与 plan.plan_id 一致");
    }
    if (validation.plan_version !== plan.version) {
      add(issues, `${path}.validation.plan_version`, "必须与 plan.version 一致");
    }
  }

  if (Array.isArray(products)) {
    const productIds = products
      .filter(isObject)
      .map((product) => product.product_id)
      .filter(hasText);
    const productIdSet = new Set(productIds);
    if (productIdSet.size !== productIds.length) {
      add(issues, `${path}.products`, "不能包含重复 product_id");
    }
    for (const productId of plan.product_ids || []) {
      if (!productIdSet.has(productId)) {
        add(issues, `${path}.products`, `缺少方案引用的商品 ${productId}`);
      }
    }
    for (const productId of productIdSet) {
      if (!plan.product_ids?.includes(productId)) {
        add(issues, `${path}.products`, `包含方案未引用的商品 ${productId}`);
      }
    }
    if (
      products.every(
        (product) => isObject(product) && Number.isInteger(product.price_cny)
      )
    ) {
      const calculatedTotal = products.reduce(
        (sum, product) => sum + product.price_cny,
        0
      );
      if (calculatedTotal !== plan.total_price_cny) {
        add(
          issues,
          `${path}.plan.total_price_cny`,
          `必须等于所选商品价格合计 ${calculatedTotal}`
        );
      }
    }
  }

  if (isObject(validation) && Array.isArray(validation.checks)) {
    const statuses = validation.checks.map((check) => check?.status);
    const expectedOverall = statuses.includes("fail")
      ? ["failed", "blocked"]
      : statuses.includes("warn")
        ? ["needs_confirmation"]
        : ["pass"];
    if (!expectedOverall.includes(validation.overall_status)) {
      add(
        issues,
        `${path}.validation.overall_status`,
        "必须与 checks 中的 fail / warn / pass 结果一致"
      );
    }
  }

  if (isObject(render) && render.after_ref !== plan.render_ref) {
    add(issues, `${path}.render.after_ref`, "必须与 plan.render_ref 一致");
  }

  for (const placement of Array.isArray(plan.placements) ? plan.placements : []) {
    if (isObject(placement) && !plan.product_ids?.includes(placement.product_id)) {
      add(
        issues,
        `${path}.plan.placements`,
        `摆放引用了方案外商品 ${placement.product_id}`
      );
    }
  }
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateProductFacts(value, issues) {
  const canonicalProducts = new Map();
  const register = (productList, path) => {
    if (!Array.isArray(productList)) return;
    productList.forEach((product, index) => {
      if (!isObject(product) || !hasText(product.product_id)) return;
      const canonical = stableJson(product);
      const previous = canonicalProducts.get(product.product_id);
      if (previous && previous.canonical !== canonical) {
        add(
          issues,
          `${path}[${index}]`,
          `product_id=${product.product_id} 与 ${previous.path} 的商品事实不一致`
        );
      } else if (!previous) {
        canonicalProducts.set(product.product_id, {
          canonical,
          path: `${path}[${index}]`
        });
      }
    });
  };

  register(value.products, "$.products");
  if (Array.isArray(value.alternatives)) {
    value.alternatives.forEach((option, index) =>
      register(option?.products, `$.alternatives[${index}].products`)
    );
  }
}

export function validateAICard(value) {
  const issues = [];
  if (!requireObject(value, "$", issues)) return issues;
  rejectUnknownKeys(value, "$", issues, [
    "schema_version",
    "request_id",
    "source_mode",
    "status",
    "generated_at",
    "room_profile",
    "inspiration_profile",
    "constraints",
    "plan",
    "validation",
    "products",
    "tutorials",
    "render",
    "alternatives",
    "notices",
    "data_sources",
    "trace",
    "follow_up"
  ]);
  if (value.schema_version !== SCHEMA_VERSION) {
    add(issues, "$.schema_version", `只支持 ${SCHEMA_VERSION}`);
  }
  requireText(value.request_id, "$.request_id", issues);
  if (!SOURCE_MODES.has(value.source_mode)) {
    add(issues, "$.source_mode", "必须是 demo、live 或 fallback");
  }
  if (!CARD_STATUSES.has(value.status)) {
    add(issues, "$.status", "必须是 ready、needs_input 或 fallback_ready");
  }
  if (value.status === "fallback_ready" && value.source_mode !== "fallback") {
    add(issues, "$.status", "fallback_ready 必须与 source_mode=fallback 配套");
  }
  if (value.source_mode === "fallback" && value.status === "ready") {
    add(issues, "$.status", "fallback 来源不能标记为 ready");
  }
  requireText(value.generated_at, "$.generated_at", issues);
  issues.push(...validateRoomProfile(value.room_profile, "$.room_profile"));
  validateConstraints(value.constraints, "$.constraints", issues);

  if (requireObject(value.inspiration_profile, "$.inspiration_profile", issues)) {
    rejectUnknownKeys(value.inspiration_profile, "$.inspiration_profile", issues, [
      "inspiration_id",
      "source_type",
      "style",
      "colors",
      "materials",
      "transferable_elements",
      "excluded_elements"
    ]);
    requireText(value.inspiration_profile.inspiration_id, "$.inspiration_profile.inspiration_id", issues);
    requireText(value.inspiration_profile.source_type, "$.inspiration_profile.source_type", issues);
    requireStringArray(value.inspiration_profile.style, "$.inspiration_profile.style", issues);
    requireStringArray(value.inspiration_profile.colors, "$.inspiration_profile.colors", issues);
    requireStringArray(value.inspiration_profile.materials, "$.inspiration_profile.materials", issues);
    requireStringArray(
      value.inspiration_profile.transferable_elements,
      "$.inspiration_profile.transferable_elements",
      issues
    );
    requireStringArray(
      value.inspiration_profile.excluded_elements,
      "$.inspiration_profile.excluded_elements",
      issues
    );
  }

  if (value.plan === null) {
    if (value.status !== "needs_input") {
      add(issues, "$.plan", "只有 needs_input 状态允许 plan 为 null");
    }
  } else {
    validatePlan(value.plan, "$.plan", issues);
  }

  if (value.validation === null) {
    if (value.status !== "needs_input") {
      add(issues, "$.validation", "只有 needs_input 状态允许 validation 为 null");
    }
  } else {
    validateReport(value.validation, "$.validation", issues);
  }

  if (!Array.isArray(value.products)) {
    add(issues, "$.products", "必须是数组");
  } else {
    value.products.forEach((product, index) => validateProduct(product, `$.products[${index}]`, issues));
  }

  if (!Array.isArray(value.tutorials)) {
    add(issues, "$.tutorials", "必须是数组");
  } else {
    value.tutorials.forEach((tutorial, index) =>
      validateTutorial(tutorial, `$.tutorials[${index}]`, issues)
    );
  }
  validateRender(value.render, "$.render", issues);

  if (!Array.isArray(value.alternatives)) {
    add(issues, "$.alternatives", "必须是数组");
  } else {
    value.alternatives.forEach((option, index) => {
      const path = `$.alternatives[${index}]`;
      if (!requireObject(option, path, issues)) return;
      rejectUnknownKeys(option, path, issues, [
        "plan",
        "validation",
        "products",
        "render"
      ]);
      validatePlan(option.plan, `${path}.plan`, issues);
      validateReport(option.validation, `${path}.validation`, issues);
      if (!Array.isArray(option.products)) {
        add(issues, `${path}.products`, "必须是数组");
      } else {
        option.products.forEach((product, productIndex) =>
          validateProduct(product, `${path}.products[${productIndex}]`, issues)
        );
      }
      validateRender(option.render, `${path}.render`, issues);
      validatePlanOptionConsistency(option, path, issues);
      if (option.plan?.room_id !== value.room_profile?.room_id) {
        add(issues, `${path}.plan.room_id`, "必须与 room_profile.room_id 一致");
      }
      if (
        option.plan?.inspiration_id !== value.inspiration_profile?.inspiration_id
      ) {
        add(
          issues,
          `${path}.plan.inspiration_id`,
          "必须与 inspiration_profile.inspiration_id 一致"
        );
      }
    });
  }

  if (!Array.isArray(value.notices)) {
    add(issues, "$.notices", "必须是数组");
  } else {
    value.notices.forEach((notice, index) =>
      validateNotice(notice, `$.notices[${index}]`, issues)
    );
  }
  if (!Array.isArray(value.data_sources)) {
    add(issues, "$.data_sources", "必须是数组");
  } else {
    value.data_sources.forEach((source, index) =>
      validateDataSource(source, `$.data_sources[${index}]`, issues)
    );
  }
  if (!Array.isArray(value.trace)) {
    add(issues, "$.trace", "必须是数组");
  } else {
    value.trace.forEach((trace, index) =>
      validateTrace(trace, `$.trace[${index}]`, issues)
    );
  }
  validateFollowUp(value.follow_up, "$.follow_up", issues);
  if (value.status === "needs_input" && value.follow_up === null) {
    add(issues, "$.follow_up", "needs_input 状态必须给出后续问题");
  }
  if (value.status !== "needs_input" && value.follow_up !== null) {
    add(issues, "$.follow_up", "非 needs_input 状态不得包含后续问题");
  }
  if (
    value.plan === null &&
    value.follow_up?.can_continue_with_assumptions !== false
  ) {
    add(
      issues,
      "$.follow_up.can_continue_with_assumptions",
      "没有可执行方案时必须为 false"
    );
  }
  if (
    value.status !== "needs_input" &&
    ["failed", "blocked"].includes(value.validation?.overall_status)
  ) {
    add(issues, "$.validation.overall_status", "可用状态不能绑定失败或阻断的方案");
  }

  const roomAnalysisSources = Array.isArray(value.data_sources)
    ? value.data_sources.filter((source) => source?.kind === "room_analysis")
    : [];
  if (roomAnalysisSources.length !== 1) {
    add(issues, "$.data_sources", "必须且只能包含一个 room_analysis 来源");
  } else if (roomAnalysisSources[0].source_type !== value.source_mode) {
    add(
      issues,
      "$.data_sources",
      "room_analysis.source_type 必须与 AICard.source_mode 一致"
    );
  }

  validateProductFacts(value, issues);

  if (value.plan) {
    validatePlanOptionConsistency(
      {
        plan: value.plan,
        validation: value.validation,
        products: value.products,
        render: value.render
      },
      "$",
      issues
    );
    if (value.plan.room_id !== value.room_profile?.room_id) {
      add(issues, "$.plan.room_id", "必须与 room_profile.room_id 一致");
    }
    if (value.plan.inspiration_id !== value.inspiration_profile?.inspiration_id) {
      add(
        issues,
        "$.plan.inspiration_id",
        "必须与 inspiration_profile.inspiration_id 一致"
      );
    }
  }

  return issues;
}

export function assertAICard(value) {
  const issues = validateAICard(value);
  if (issues.length) {
    throw new ContractValidationError("AICard 不符合 v1 协议", issues, 500);
  }
  return value;
}
