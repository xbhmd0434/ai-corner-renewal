import { randomUUID, createHash } from "node:crypto";
import { assertNoOwnerId, invalid } from "../errors.js";

const TRIGGERS = new Set([
  "video_apply",
  "space_upload",
  "space_reuse",
  "asset_detail",
  "plan_continue"
]);
const CLIENT_TRIGGERS = new Set([
  "video_apply",
  "space_upload",
  "space_reuse",
  "asset_detail"
]);
const GOAL_CODES = new Set([
  "organization",
  "ambient_lighting",
  "study_focus",
  "low_budget",
  "reuse_existing"
]);
const ANALYSIS_MODES = new Set(["auto", "demo", "live"]);
const PET_CONTEXTS = new Set(["none", "cat", "dog", "other"]);

const clone = (value) => structuredClone(value);
const present = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function rejectUnknownKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw invalid("design_request_invalid", `${label} 不支持字段 ${unknown}`);
  }
}

function requireOptionalString(value, key, maxLength) {
  if (!present(value, key)) return;
  if (
    typeof value[key] !== "string" ||
    !value[key].trim() ||
    value[key].length > maxLength
  ) {
    throw invalid("design_request_invalid", `${key} 必须是 1～${maxLength} 字符`);
  }
}

function requireUniqueStrings(value, key, maxItems) {
  if (
    !Array.isArray(value[key]) ||
    value[key].length > maxItems ||
    value[key].some((item) => typeof item !== "string" || !item.trim()) ||
    new Set(value[key]).size !== value[key].length
  ) {
    throw invalid(
      "design_request_invalid",
      `${key} 必须是最多 ${maxItems} 个唯一字符串`
    );
  }
}

export const DEFAULT_PREFERENCES = Object.freeze({
  schema_version: "1.0",
  styles: [],
  colors: [],
  materials: [],
  default_budget_cny: 500,
  stable_constraints: [],
  disliked_elements: [],
  personalization_enabled: true,
  resource_version: 1
});

export class PreferenceService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
  }

  get(actorId) {
    const existing = this.repository.getPreferences(actorId);
    if (existing) return existing;
    const created = {
      ...clone(DEFAULT_PREFERENCES),
      updated_at: this.now().toISOString()
    };
    this.repository.savePreferences(actorId, created);
    return created;
  }

  patch(actorId, body) {
    assertNoOwnerId(body);
    const current = this.get(actorId);
    const unknownTopLevel = Object.keys(body || {}).find(
      (key) => !["schema_version", "resource_version", "changes"].includes(key)
    );
    if (unknownTopLevel) {
      throw invalid("preference_invalid", `不支持字段 ${unknownTopLevel}`);
    }
    if (body?.resource_version !== current.resource_version) {
      const error = new Error("偏好已被其他操作更新，请刷新后重试");
      error.code = "resource_version_conflict";
      error.statusCode = 409;
      error.details = { current };
      throw error;
    }
    const changes = body?.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw invalid("preference_invalid", "changes 必须是对象");
    }
    const allowed = new Set([
      "styles",
      "colors",
      "materials",
      "default_budget_cny",
      "stable_constraints",
      "disliked_elements",
      "personalization_enabled",
      "reset"
    ]);
    for (const key of Object.keys(changes)) {
      if (!allowed.has(key)) throw invalid("preference_invalid", `不支持修改 ${key}`);
    }
    let next =
      changes.reset === true
        ? { ...clone(DEFAULT_PREFERENCES), resource_version: current.resource_version }
        : clone(current);
    for (const key of [
      "styles",
      "colors",
      "materials",
      "stable_constraints",
      "disliked_elements"
    ]) {
      if (changes[key] === undefined) continue;
      if (
        !Array.isArray(changes[key]) ||
        changes[key].length > 20 ||
        changes[key].some((item) => typeof item !== "string" || !item.trim()) ||
        new Set(changes[key]).size !== changes[key].length
      ) {
        throw invalid("preference_invalid", `${key} 必须是最多 20 个唯一字符串`);
      }
      next[key] = [...changes[key]];
    }
    if (changes.default_budget_cny !== undefined) {
      if (
        !Number.isInteger(changes.default_budget_cny) ||
        changes.default_budget_cny < 1 ||
        changes.default_budget_cny > 1_000_000
      ) {
        throw invalid("preference_invalid", "default_budget_cny 必须是有效正整数");
      }
      next.default_budget_cny = changes.default_budget_cny;
    }
    if (changes.personalization_enabled !== undefined) {
      if (typeof changes.personalization_enabled !== "boolean") {
        throw invalid("preference_invalid", "personalization_enabled 必须是布尔值");
      }
      next.personalization_enabled = changes.personalization_enabled;
    }
    next.resource_version = current.resource_version + 1;
    next.updated_at = this.now().toISOString();
    return this.repository.savePreferences(actorId, next);
  }
}

export class DesignRequestService {
  constructor({ repository, preferenceService, now = () => new Date() }) {
    this.repository = repository;
    this.preferenceService = preferenceService;
    this.now = now;
  }

  create(actorId, body, { internal = false, parentDesignRequestId = null } = {}) {
    assertNoOwnerId(body);
    this.#validateShape(body, internal);
    const space = this.repository.get("assets", actorId, body.space_asset_id);
    if (space.asset_type !== "space") {
      throw invalid("design_request_invalid", "space_asset_id 必须指向空间资产");
    }
    if (space.lifecycle === "archived") {
      throw invalid("asset_not_usable", "归档空间不能用于新任务");
    }
    const spaceVersion = this.repository.get(
      "spaceVersions",
      actorId,
      body.space_version_id
    );
    if (spaceVersion.space_asset_id !== space.asset_id) {
      throw invalid("space_version_mismatch", "空间版本不属于所选空间");
    }
    if (spaceVersion.state !== "sealed") {
      throw invalid("space_version_not_sealed", "DesignRequest 只能引用 sealed 空间版本");
    }

    const references = body.reference_asset_ids.map((assetId) => {
      const asset = this.repository.get("assets", actorId, assetId);
      if (!["inspiration", "item"].includes(asset.asset_type)) {
        throw invalid("reference_asset_invalid", "参考资产只能是灵感或单品");
      }
      if (asset.lifecycle === "archived") {
        throw invalid("asset_not_usable", "归档参考资产不能用于新任务");
      }
      // renewal-card/2.1：inspiration 必须已完成意图确认才能进入 DesignRequest
      const experienceContract = body.options?.experience_contract;
      if (
        experienceContract === "renewal-card/2.1" &&
        asset.asset_type === "inspiration" &&
        !asset.attributes?.confirmed_intent
      ) {
        const error = new Error("灵感资产尚未完成意图确认");
        error.name = "IntentConfirmationRequiredError";
        error.code = "intent_confirmation_required";
        error.statusCode = 409;
        error.details = { asset_id: asset.asset_id };
        throw error;
      }
      return asset;
    });

    const editableRegions = spaceVersion.attributes?.editable_regions || [];
    let editableRegionId = body.editable_region_id;
    const missingFields = [];
    let canStartGeneration = true;
    if (!editableRegionId && editableRegions.length === 1) {
      editableRegionId = editableRegions[0].editable_region_id;
    } else if (!editableRegionId && editableRegions.length !== 1) {
      canStartGeneration = false;
      missingFields.push({
        path: "/editable_region_id",
        code: "editable_region_required",
        message: "请选择一个可编辑区域",
        blocking: true
      });
    } else if (
      editableRegionId &&
      !editableRegions.some(
        (region) => region.editable_region_id === editableRegionId
      )
    ) {
      throw invalid("editable_region_invalid", "可编辑区不属于所选空间版本");
    }

    const detectedIds = new Set(
      (spaceVersion.attributes?.detected_objects || []).map(
        (item) => item.detected_object_id
      )
    );
    for (const detectedId of body.constraints.keep_detected_object_ids || []) {
      if (!detectedIds.has(detectedId)) {
        throw invalid(
          "keep_detected_object_invalid",
          `保留物 ${detectedId} 不属于所选空间版本`
        );
      }
    }
    if (
      references.some((asset) => !["ready", "needs_confirmation"].includes(asset.parse_state))
    ) {
      canStartGeneration = false;
      missingFields.push({
        path: "/reference_asset_ids",
        code: "reference_parse_incomplete",
        message: "参考资产尚未完成解析",
        blocking: true
      });
    }

    const preferences = this.preferenceService.get(actorId);
    let resolvedBudget;
    let budgetSource;
    if (present(body.constraints, "budget_cny")) {
      resolvedBudget = body.constraints.budget_cny;
      budgetSource = "request";
    } else if (Number.isInteger(space.attributes?.default_budget_cny)) {
      resolvedBudget = space.attributes.default_budget_cny;
      budgetSource = "space_default";
    } else if (Number.isInteger(preferences.default_budget_cny)) {
      resolvedBudget = preferences.default_budget_cny;
      budgetSource = "preference";
    } else {
      resolvedBudget = 500;
      budgetSource = "system_default";
    }
    if (budgetSource !== "request") {
      missingFields.push({
        path: "/constraints/budget_cny",
        code: "budget_recommended",
        message: "填写预算后可以生成更准确的可执行商品组合",
        blocking: false
      });
    }
    const resolvedNoDrilling = present(body.constraints, "no_drilling")
      ? body.constraints.no_drilling
      : (space.attributes?.long_term_constraints || []).includes("no_drilling") ||
        preferences.stable_constraints.includes("no_drilling");
    const noDrillingSource = present(body.constraints, "no_drilling")
      ? "request"
      : (space.attributes?.long_term_constraints || []).includes("no_drilling")
        ? "space_default"
        : preferences.stable_constraints.includes("no_drilling")
          ? "preference"
          : "system_default";
    const designRequestId = `design-request-${randomUUID()}`;
    const createdAt = this.now().toISOString();
    const snapshot = {
      trigger: body.trigger,
      space_asset_id: space.asset_id,
      space_version_id: spaceVersion.space_version_id,
      reference_asset_ids: references.map((asset) => asset.asset_id),
      goal: body.goal,
      goal_codes: [...body.goal_codes],
      constraints: {
        budget_cny: resolvedBudget,
        no_drilling: resolvedNoDrilling,
        keep_detected_object_ids: [
          ...(body.constraints.keep_detected_object_ids || [])
        ],
        pet_context: body.constraints.pet_context || "none"
      },
      editable_region_id: editableRegionId || null,
      options: {
        analysis_mode: body.options?.analysis_mode || "auto",
        include_trace: body.options?.include_trace === true,
        ...(body.options?.experience_contract
          ? { experience_contract: body.options.experience_contract }
          : {}),
        ...(internal && body.options?.preferred_style_key
          ? { preferred_style_key: body.options.preferred_style_key }
          : {})
      },
      budget_source: budgetSource,
      no_drilling_source: noDrillingSource,
      pet_context_source: present(body.constraints, "pet_context")
        ? "request"
        : "system_default",
      editable_region_source: body.editable_region_id
        ? "request"
        : "space_default",
      actor_id: actorId,
      space_snapshot: {
        asset_id: space.asset_id,
        resource_version: space.resource_version,
        name: space.name,
        provenance: clone(space.provenance),
        attributes: clone(space.attributes),
        space_version: clone(spaceVersion)
      },
      reference_snapshots: references.map((asset) => ({
        asset_id: asset.asset_id,
        asset_type: asset.asset_type,
        resource_version: asset.resource_version,
        name: asset.name,
        provenance: clone(asset.provenance),
        media_ids: [...(asset.media_ids || [])],
        attributes: clone(asset.attributes),
        confirmed_intent:
          asset.asset_type === "inspiration"
            ? clone(asset.attributes?.confirmed_intent || null)
            : null
      })),
      preference_snapshot: clone(preferences),
      created_at: createdAt
    };
    // context_fingerprint 用于 RelatedDesignRun/迟到结果隔离/迟到 Provider 隔离
    const fingerprintInput = {
      space_asset_id: space.asset_id,
      space_version_id: spaceVersion.space_version_id,
      space_version_resource_version: spaceVersion.resource_version,
      reference_asset_ids: [...snapshot.reference_asset_ids],
      confirmed_intents: snapshot.reference_snapshots
        .filter((item) => item.confirmed_intent)
        .map((item) => ({
          asset_id: item.asset_id,
          intent_type: item.confirmed_intent.intent_type,
          summary: item.confirmed_intent.summary
        })),
      experience_contract: snapshot.options.experience_contract || null
    };
    snapshot.context_fingerprint = `sha256:${createHash("sha256")
      .update(JSON.stringify(fingerprintInput))
      .digest("hex")
      .slice(0, 16)}`;
    const record = {
      schema_version: "1.0",
      design_request_id: designRequestId,
      parent_design_request_id: parentDesignRequestId,
      validation_state: missingFields.length ? "needs_input" : "valid",
      can_start_generation: canStartGeneration,
      missing_fields: missingFields,
      input_snapshot: snapshot,
      created_at: createdAt,
      updated_at: createdAt
    };
    this.repository.save("designRequests", actorId, record);
    return this.summary(record);
  }

  createDerived(actorId, parent, action) {
    const snapshot = parent.input_snapshot;
    const next = {
      schema_version: "1.0",
      trigger: "plan_continue",
      space_asset_id: snapshot.space_asset_id,
      space_version_id: snapshot.space_version_id,
      reference_asset_ids:
        action.type === "change_style" && Array.isArray(action.reference_asset_ids)
          ? action.reference_asset_ids
          : snapshot.reference_asset_ids,
      goal: snapshot.goal,
      goal_codes: [...snapshot.goal_codes],
      constraints: clone(snapshot.constraints),
      editable_region_id: snapshot.editable_region_id,
      options: clone(snapshot.options)
    };
    if (action.type === "reduce_budget") {
      next.constraints.budget_cny = action.target_budget_cny;
    }
    if (action.type === "change_style") {
      next.goal_codes = [...new Set([...next.goal_codes, "reuse_existing"])];
      next.options.preferred_style_key = action.style_key;
    }
    return this.create(actorId, next, {
      internal: true,
      parentDesignRequestId: parent.design_request_id
    });
  }

  get(actorId, designRequestId) {
    const record = this.repository.get(
      "designRequests",
      actorId,
      designRequestId
    );
    return {
      ...clone(record),
      generation_runs: this.repository
        .list("generationRuns", actorId)
        .filter((run) => run.design_request_id === designRequestId)
        .map((run) => ({
          generation_run_id: run.generation_run_id,
          status: run.status,
          phase: run.phase,
          source_mode: run.source_mode,
          created_at: run.created_at,
          updated_at: run.updated_at
        }))
    };
  }

  assertSourcesAvailable(actorId, record) {
    const snapshot = record.input_snapshot;
    this.repository.get("assets", actorId, snapshot.space_asset_id);
    for (const assetId of snapshot.reference_asset_ids) {
      this.repository.get("assets", actorId, assetId);
    }
  }

  summary(record) {
    const snapshot = record.input_snapshot;
    return {
      schema_version: "1.0",
      design_request_id: record.design_request_id,
      validation_state: record.validation_state,
      can_start_generation: record.can_start_generation,
      missing_fields: clone(record.missing_fields),
      input_snapshot_summary: {
        space_asset_id: snapshot.space_asset_id,
        space_version_id: snapshot.space_version_id,
        reference_asset_ids: [...snapshot.reference_asset_ids],
        resolved_budget_cny: snapshot.constraints.budget_cny,
        budget_source: snapshot.budget_source
      },
      created_at: record.created_at
    };
  }

  #validateShape(body, internal) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw invalid("design_request_invalid", "请求体必须是对象");
    }
    if (body.schema_version !== "1.0") {
      throw invalid("design_request_invalid", "schema_version 必须是 1.0");
    }
    rejectUnknownKeys(
      body,
      new Set([
        "schema_version",
        "trigger",
        "space_asset_id",
        "space_version_id",
        "reference_asset_ids",
        "goal",
        "goal_codes",
        "constraints",
        "editable_region_id",
        "options"
      ]),
      "请求体"
    );
    if (!(internal ? TRIGGERS : CLIENT_TRIGGERS).has(body.trigger)) {
      throw invalid("design_request_invalid", "trigger 不受支持");
    }
    for (const key of ["space_asset_id", "space_version_id"]) {
      if (typeof body[key] !== "string" || !body[key].trim()) {
        throw invalid("design_request_invalid", `${key} 必须是非空字符串`);
      }
    }
    requireUniqueStrings(body, "reference_asset_ids", 3);
    requireOptionalString(body, "goal", 500);
    requireUniqueStrings(body, "goal_codes", 5);
    for (const code of body.goal_codes) {
      if (!GOAL_CODES.has(code)) {
        throw invalid("design_request_invalid", `goal_code ${code} 不受支持`);
      }
    }
    if (
      !body.goal?.trim() &&
      body.goal_codes.length === 0 &&
      body.reference_asset_ids.length === 0
    ) {
      throw invalid(
        "design_request_invalid",
        "设计任务缺少可用目标或参考资产",
        [
          {
            path: "/goal",
            code: "goal_or_reference_required",
            message: "请填写目标或选择至少一个参考资产"
          }
        ]
      );
    }
    if (!body.constraints || typeof body.constraints !== "object" || Array.isArray(body.constraints)) {
      throw invalid("design_request_invalid", "constraints 必须是对象");
    }
    rejectUnknownKeys(
      body.constraints,
      new Set([
        "budget_cny",
        "no_drilling",
        "keep_detected_object_ids",
        "pet_context"
      ]),
      "constraints"
    );
    if (present(body.constraints, "budget_cny")) {
      const budget = body.constraints.budget_cny;
      if (!Number.isInteger(budget) || budget < 1 || budget > 1_000_000) {
        throw invalid("design_request_invalid", "budget_cny 必须是有效正整数");
      }
    }
    if (
      present(body.constraints, "no_drilling") &&
      typeof body.constraints.no_drilling !== "boolean"
    ) {
      throw invalid("design_request_invalid", "no_drilling 必须是布尔值");
    }
    if (!present(body.constraints, "keep_detected_object_ids")) {
      body.constraints.keep_detected_object_ids = [];
    }
    requireUniqueStrings(body.constraints, "keep_detected_object_ids", 64);
    if (
      present(body.constraints, "pet_context") &&
      !PET_CONTEXTS.has(body.constraints.pet_context)
    ) {
      throw invalid("design_request_invalid", "pet_context 不受支持");
    }
    requireOptionalString(body, "editable_region_id", 200);
    if (body.options !== undefined) {
      if (!body.options || typeof body.options !== "object" || Array.isArray(body.options)) {
        throw invalid("design_request_invalid", "options 必须是对象");
      }
      rejectUnknownKeys(
        body.options,
        internal
          ? new Set(["analysis_mode", "include_trace", "preferred_style_key", "experience_contract"])
          : new Set(["analysis_mode", "include_trace", "experience_contract"]),
        "options"
      );
      if (
        present(body.options, "experience_contract") &&
        body.options.experience_contract !== "renewal-card/2.1"
      ) {
        throw invalid(
          "design_request_invalid",
          "experience_contract 只支持 renewal-card/2.1"
        );
      }
      if (
        present(body.options, "analysis_mode") &&
        !ANALYSIS_MODES.has(body.options.analysis_mode)
      ) {
        throw invalid("design_request_invalid", "analysis_mode 不受支持");
      }
      if (
        present(body.options, "include_trace") &&
        typeof body.options.include_trace !== "boolean"
      ) {
        throw invalid("design_request_invalid", "include_trace 必须是布尔值");
      }
    }
  }
}
