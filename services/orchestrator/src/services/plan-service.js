import { randomUUID } from "node:crypto";
import { assertAICard } from "../../../../packages/contracts/src/index.js";
import { createOrchestrator } from "../workflow.js";
import { ApiError, assertNoOwnerId, conflict, invalid } from "../errors.js";

export const GENERATION_PHASES = Object.freeze([
  "input_validation",
  "space_analysis",
  "reference_analysis",
  "constraint_filter",
  "matching",
  "planning",
  "rendering",
  "validation",
  "packaging"
]);

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const STYLE_KEYS = new Set(["warm", "compact", "green"]);
const clone = (value) => structuredClone(value);
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const PRIVATE_MEDIA_PREFIX = "asset://private-media/";

function generatedRenderMediaIds(card) {
  const references = [
    card.render?.after_ref,
    ...(card.alternatives || []).map(
      (alternative) => alternative.render?.after_ref
    )
  ];
  return [
    ...new Set(
      references
        .filter((reference) => reference?.startsWith(PRIVATE_MEDIA_PREFIX))
        .map((reference) => reference.slice(PRIVATE_MEDIA_PREFIX.length))
    )
  ];
}

function generatedRenderFilename(mediaType) {
  const extension =
    mediaType === "image/png"
      ? "png"
      : mediaType === "image/webp"
        ? "webp"
        : "jpg";
  return `seedream-render.${extension}`;
}

function rejectUnknownKeys(value, allowed, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw invalid(code, `${label} 不支持字段 ${unknown}`);
}

function runProgress(run) {
  if (run.status === "succeeded") return 100;
  if (run.status === "queued") return 0;
  const phaseIndex = Number.isInteger(run.phase_index) ? run.phase_index : 1;
  const phaseTotal = Number.isInteger(run.phase_total)
    ? run.phase_total
    : GENERATION_PHASES.length;
  return Math.min(99, Math.max(0, Math.round((phaseIndex / phaseTotal) * 100)));
}

function runNeedsInput(run) {
  const card =
    run.result?.plan_version?.aicard ||
    run.result?.aicard ||
    null;
  if (card?.status !== "needs_input" || !card.follow_up) return null;
  return {
    reason_code: card.follow_up.reason_code,
    question: card.follow_up.question,
    required_fields: [...card.follow_up.required_fields],
    can_continue_with_assumptions:
      card.follow_up.can_continue_with_assumptions,
    has_preview: Boolean(card.plan)
  };
}

function runSummary(run) {
  return {
    schema_version: "1.0",
    generation_run_id: run.generation_run_id,
    design_request_id: run.design_request_id,
    status: run.status,
    phase: run.phase,
    phase_index: run.phase_index,
    phase_total: GENERATION_PHASES.length,
    progress: runProgress(run),
    source_mode: run.source_mode,
    retryable: run.retryable,
    needs_input: runNeedsInput(run),
    result: run.result,
    error: run.error,
    created_at: run.created_at,
    updated_at: run.updated_at
  };
}

function remapCardIdentity(
  card,
  {
    generationRunId,
    planVersionId,
    version,
    parentPlanVersionId,
    designRequestId,
    spaceVersionId,
    aggregateInspirationId,
    aggregateSourceType,
    revisionAction
  }
) {
  card.request_id = generationRunId;
  card.room_profile.room_id = spaceVersionId;
  card.inspiration_profile.inspiration_id = aggregateInspirationId;
  card.inspiration_profile.source_type = aggregateSourceType;
  if (card.plan) {
    card.plan.plan_id = planVersionId;
    card.plan.room_id = spaceVersionId;
    card.plan.inspiration_id = aggregateInspirationId;
    card.plan.version = version;
    if (revisionAction?.type === "reduce_budget") {
      card.plan.revision = {
        ...(card.plan.revision || {
          removed_product_ids: [],
          added_product_ids: []
        }),
        parent_plan_id: parentPlanVersionId,
        target_budget_cny: revisionAction.target_budget_cny,
        reason: "budget_reduction"
      };
    } else {
      delete card.plan.revision;
    }
    card.validation.plan_id = planVersionId;
    card.validation.plan_version = version;
    card.validation.report_id = `validation-${planVersionId}-v${version}`;
  }
  for (const [index, alternative] of card.alternatives.entries()) {
    const candidateId = `candidate-${planVersionId}-${index + 1}`;
    alternative.plan.plan_id = candidateId;
    alternative.plan.room_id = spaceVersionId;
    alternative.plan.inspiration_id = aggregateInspirationId;
    alternative.plan.version = version;
    alternative.validation.plan_id = candidateId;
    alternative.validation.plan_version = version;
    alternative.validation.report_id = `validation-${candidateId}-v${version}`;
  }
  if (card.trace.length) {
    card.trace.push({
      step: card.trace.length + 1,
      skill: "persist_plan_version",
      status: "completed",
      source_mode: "demo",
      summary: `将运行 ${generationRunId} 封装为不可变任务 ${designRequestId} 的方案版本。`
    });
  }
  assertAICard(card);
  return card;
}

function defaultGoalCodes(snapshot) {
  if (snapshot.goal_codes.length) return [...snapshot.goal_codes];
  if (snapshot.goal?.trim()) return ["custom_goal"];
  return ["reference_guided_design"];
}

export class PlanService {
  constructor({
    repository,
    designRequestService,
    mediaService,
    cardStore,
    config,
    roomAnalyzer,
    fetchImpl = globalThis.fetch,
    now = () => new Date()
  }) {
    this.repository = repository;
    this.designRequestService = designRequestService;
    this.mediaService = mediaService;
    this.cardStore = cardStore;
    this.config = config;
    this.roomAnalyzer = roomAnalyzer;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.scheduled = new Set();
    this.pending = new Set();
    this.stopping = false;
  }

  startRun(
    actorId,
    designRequestId,
    body,
    { planAssetId = null, parentPlanVersionId = null, revisionAction = null } = {}
  ) {
    assertNoOwnerId(body);
    rejectUnknownKeys(
      body,
      new Set(["schema_version", "reason", "retry_of_generation_run_id"]),
      "generation_run_invalid",
      "请求体"
    );
    const designRequest = this.repository.get(
      "designRequests",
      actorId,
      designRequestId
    );
    if (!designRequest.can_start_generation) {
      throw conflict(
        "design_request_not_startable",
        "该任务仍有阻断输入，不能开始生成",
        { missing_fields: designRequest.missing_fields }
      );
    }
    try {
      this.designRequestService.assertSourcesAvailable(actorId, designRequest);
    } catch (error) {
      if (error.statusCode === 404) {
        throw conflict(
          "design_request_source_unavailable",
          "任务引用的来源资产已删除，不能重新运行"
        );
      }
      throw error;
    }
    if (!body || !["initial", "retry"].includes(body.reason)) {
      throw invalid("generation_run_invalid", "reason 必须是 initial 或 retry");
    }
    const runs = this.repository
      .list("generationRuns", actorId)
      .filter((run) => run.design_request_id === designRequestId);
    const active = runs.find((run) => ACTIVE_STATUSES.has(run.status));
    if (active) {
      throw conflict(
        "generation_run_already_active",
        "该任务已有运行中的生成",
        { active_generation_run_id: active.generation_run_id }
      );
    }
    if (runs.some((run) => run.status === "succeeded")) {
      throw conflict(
        "design_request_already_succeeded",
        "该任务已经成功，不会重复生成"
      );
    }
    let retryOf = null;
    if (body.reason === "retry") {
      if (
        typeof body.retry_of_generation_run_id !== "string" ||
        !body.retry_of_generation_run_id.trim()
      ) {
        throw invalid(
          "generation_retry_invalid",
          "retry 必须提供 retry_of_generation_run_id"
        );
      }
      retryOf = this.repository.get(
        "generationRuns",
        actorId,
        body.retry_of_generation_run_id
      );
      if (
        retryOf.design_request_id !== designRequestId ||
        !["failed", "cancelled"].includes(retryOf.status)
      ) {
        throw invalid("generation_retry_invalid", "只能重试同一任务的失败或取消运行");
      }
    } else if (body.retry_of_generation_run_id !== undefined) {
      throw invalid(
        "generation_retry_invalid",
        "initial 不能提供 retry_of_generation_run_id"
      );
    }
    const createdAt = this.now().toISOString();
    const run = {
      schema_version: "1.0",
      generation_run_id: `generation-run-${randomUUID()}`,
      design_request_id: designRequestId,
      retry_of_generation_run_id: retryOf?.generation_run_id || null,
      status: "queued",
      phase: "input_validation",
      phase_index: 1,
      phase_total: GENERATION_PHASES.length,
      source_mode: null,
      retryable: false,
      result: null,
      error: null,
      plan_asset_id_target: planAssetId,
      parent_plan_version_id: parentPlanVersionId,
      revision_action: revisionAction ? clone(revisionAction) : null,
      cancel_requested: false,
      created_at: createdAt,
      updated_at: createdAt
    };
    this.repository.save("generationRuns", actorId, run);
    this.schedule(actorId, run.generation_run_id);
    return runSummary(run);
  }

  schedule(actorId, runId) {
    if (this.stopping || this.scheduled.has(runId)) return;
    this.scheduled.add(runId);
    const execution = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          if (!this.stopping) await this.process(actorId, runId);
        } finally {
          this.scheduled.delete(runId);
          resolve();
        }
      });
    });
    this.pending.add(execution);
    execution.finally(() => this.pending.delete(execution));
  }

  recover(actorId) {
    for (const run of this.repository.list("generationRuns", actorId)) {
      if (ACTIVE_STATUSES.has(run.status)) {
        run.status = "queued";
        run.phase = "input_validation";
        run.phase_index = 1;
        run.updated_at = this.now().toISOString();
        this.repository.save("generationRuns", actorId, run);
        this.schedule(actorId, run.generation_run_id);
      }
    }
  }

  async process(actorId, runId) {
    let run = this.repository.get("generationRuns", actorId, runId);
    if (!ACTIVE_STATUSES.has(run.status)) return;
    const designRequest = this.repository.get(
      "designRequests",
      actorId,
      run.design_request_id
    );
    let card = null;
    try {
      for (let index = 0; index < GENERATION_PHASES.length; index += 1) {
        run = this.repository.get("generationRuns", actorId, runId);
        if (run.cancel_requested || run.status === "cancelled") {
          run.status = "cancelled";
          run.updated_at = this.now().toISOString();
          this.repository.save("generationRuns", actorId, run);
          return;
        }
        run.status = "running";
        run.phase = GENERATION_PHASES[index];
        run.phase_index = index + 1;
        run.updated_at = this.now().toISOString();
        this.repository.save("generationRuns", actorId, run);
        if (run.phase === "planning") {
          card = await this.#executeWorkflow(actorId, run, designRequest);
          run.source_mode = card.source_mode;
          this.repository.save("generationRuns", actorId, run);
        }
        await nextTurn();
      }
      run = this.repository.get("generationRuns", actorId, runId);
      if (run.cancel_requested || run.status === "cancelled") return;
      const persisted = this.#persistResult(actorId, run, designRequest, card);
      run.status = "succeeded";
      run.phase = "packaging";
      run.phase_index = GENERATION_PHASES.length;
      run.source_mode = card.source_mode;
      run.result = persisted;
      run.retryable = false;
      run.error = null;
      run.updated_at = this.now().toISOString();
      this.repository.save("generationRuns", actorId, run);
    } catch (error) {
      run = this.repository.get("generationRuns", actorId, runId);
      if (run.status === "cancelled") return;
      run.status = "failed";
      run.retryable = true;
      run.result = null;
      run.error = {
        code: error.code || "generation_failed",
        message:
          error.statusCode && error.statusCode < 500
            ? error.message
            : "方案生成未完成，可以重试",
        retryable: true
      };
      run.updated_at = this.now().toISOString();
      this.repository.save("generationRuns", actorId, run);
    }
  }

  async stop() {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
  }

  getRun(actorId, runId) {
    const run = this.repository.get("generationRuns", actorId, runId);
    const projected = clone(run);
    if (projected.result?.plan_version) {
      projected.result.plan_version = this.#projectPlanVersion(
        actorId,
        projected.result.plan_version
      );
    } else if (projected.result?.aicard) {
      projected.result.aicard = this.#projectCard(actorId, projected.result.aicard);
    }
    return runSummary(projected);
  }

  cancel(actorId, runId) {
    const run = this.repository.get("generationRuns", actorId, runId);
    if (!ACTIVE_STATUSES.has(run.status)) {
      throw conflict("generation_run_not_cancellable", "该运行已是终态，不能取消");
    }
    run.cancel_requested = true;
    run.status = "cancelled";
    run.updated_at = this.now().toISOString();
    this.repository.save("generationRuns", actorId, run);
    return runSummary(run);
  }

  listPlans(actorId, query = {}) {
    const supportedQuery = new Set([
      "space_asset_id",
      "lifecycle",
      "decision_state",
      "cursor",
      "limit",
      "sort"
    ]);
    const unknownQuery = Object.keys(query).find(
      (key) => !supportedQuery.has(key)
    );
    if (unknownQuery) throw invalid("query_invalid", `不支持查询参数 ${unknownQuery}`);
    if (query.sort && query.sort !== "recent") {
      throw invalid("query_invalid", "sort 只支持 recent");
    }
    if (
      query.lifecycle &&
      !["draft", "saved", "archived"].includes(query.lifecycle)
    ) {
      throw invalid("query_invalid", "lifecycle 不受支持");
    }
    if (
      query.decision_state &&
      !["undecided", "selected", "executing", "completed"].includes(
        query.decision_state
      )
    ) {
      throw invalid("query_invalid", "decision_state 不受支持");
    }
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > this.config.listLimitMax) {
      throw invalid("query_invalid", `limit 必须是 1～${this.config.listLimitMax}`);
    }
    let plans = this.repository.list("planAssets", actorId);
    if (query.space_asset_id) {
      plans = plans.filter((plan) => plan.space_asset_id === query.space_asset_id);
    }
    if (query.lifecycle) plans = plans.filter((plan) => plan.lifecycle === query.lifecycle);
    if (query.decision_state) {
      plans = plans.filter((plan) => plan.decision_state === query.decision_state);
    }
    const offset = query.cursor
      ? Number(Buffer.from(query.cursor, "base64url").toString("utf8"))
      : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw invalid("cursor_invalid", "cursor 无效");
    }
    const page = plans.slice(offset, offset + limit).map((plan) => {
      const version = this.repository.get(
        "planVersions",
        actorId,
        plan.current_plan_version_id
      );
      return {
        plan_asset_id: plan.plan_asset_id,
        resource_version: plan.resource_version,
        lifecycle: plan.lifecycle,
        decision_state: plan.decision_state,
        current_plan_version_id: plan.current_plan_version_id,
        current_version: {
          plan_version_id: version.plan_version_id,
          version: version.version,
          title: version.aicard.plan?.title || null,
          total_price_cny: version.aicard.plan?.total_price_cny || null,
          status: version.aicard.status,
          source_mode: version.source_mode
        },
        space_asset_id: plan.space_asset_id,
        space_name: version.design_request_snapshot.space_snapshot.name,
        updated_at: plan.updated_at
      };
    });
    const nextOffset = offset + page.length;
    return {
      schema_version: "1.0",
      items: page,
      next_cursor:
        nextOffset < plans.length
          ? Buffer.from(String(nextOffset)).toString("base64url")
          : null,
      total: plans.length
    };
  }

  getPlan(actorId, planAssetId) {
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    const versions = this.repository
      .list("planVersions", actorId)
      .filter((version) => version.plan_asset_id === planAssetId)
      .sort((a, b) => a.version - b.version);
    return {
      schema_version: "1.0",
      plan_asset_id: plan.plan_asset_id,
      lifecycle: plan.lifecycle,
      decision_state: plan.decision_state,
      resource_version: plan.resource_version,
      root_design_request_id: plan.root_design_request_id,
      current_design_request_id: plan.current_design_request_id,
      current_plan_version_id: plan.current_plan_version_id,
      versions: versions.map((version) => ({
        plan_version_id: version.plan_version_id,
        version: version.version,
        parent_plan_version_id: version.parent_plan_version_id,
        design_request_id: version.design_request_id,
        title: version.aicard.plan?.title || null,
        total_price_cny: version.aicard.plan?.total_price_cny || null,
        source_mode: version.source_mode,
        revision_action: version.revision_action,
        created_at: version.created_at
      })),
      source_summary: {
        space_asset_id: plan.space_asset_id,
        reference_asset_ids: versions.at(-1)?.design_request_snapshot
          .reference_asset_ids || []
      },
      created_at: plan.created_at,
      updated_at: plan.updated_at
    };
  }

  getPlanVersion(actorId, planAssetId, versionId) {
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    const version = this.repository.get("planVersions", actorId, versionId);
    if (version.plan_asset_id !== planAssetId) {
      throw new ApiError("resource_not_found", "方案版本不存在", 404);
    }
    return {
      schema_version: "1.0",
      plan_asset_id: planAssetId,
      plan_resource_version: plan.resource_version,
      plan_version: this.#projectPlanVersion(actorId, version)
    };
  }

  createRevision(actorId, planAssetId, body) {
    assertNoOwnerId(body);
    rejectUnknownKeys(
      body,
      new Set(["schema_version", "parent_plan_version_id", "action"]),
      "plan_revision_invalid",
      "请求体"
    );
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    if (body?.parent_plan_version_id !== plan.current_plan_version_id) {
      throw conflict(
        "stale_parent_plan_version",
        "父版本不是当前版本，请刷新后重试",
        { current_plan_version_id: plan.current_plan_version_id }
      );
    }
    const active = this.repository
      .list("generationRuns", actorId)
      .find(
        (run) =>
          run.plan_asset_id_target === planAssetId &&
          ACTIVE_STATUSES.has(run.status)
      );
    if (active) {
      throw conflict("plan_revision_in_progress", "该方案已有调整正在进行", {
        active_generation_run_id: active.generation_run_id
      });
    }
    const action = body.action;
    if (!action || !["reduce_budget", "change_style"].includes(action.type)) {
      throw invalid("plan_revision_invalid", "action.type 不受支持");
    }
    rejectUnknownKeys(
      action,
      action.type === "reduce_budget"
        ? new Set(["type", "target_budget_cny"])
        : new Set(["type", "style_key", "reference_asset_ids"]),
      "plan_revision_invalid",
      "action"
    );
    const parentVersion = this.repository.get(
      "planVersions",
      actorId,
      plan.current_plan_version_id
    );
    if (action.type === "reduce_budget") {
      if (
        !Number.isInteger(action.target_budget_cny) ||
        action.target_budget_cny < 1 ||
        action.target_budget_cny >= parentVersion.aicard.plan.total_price_cny
      ) {
        throw invalid(
          "target_budget_not_lower",
          "目标预算必须是小于当前方案总价的正整数"
        );
      }
    } else {
      if (!STYLE_KEYS.has(action.style_key)) {
        throw invalid("plan_revision_invalid", "style_key 必须是 warm、compact 或 green");
      }
      if (
        !Array.isArray(action.reference_asset_ids) ||
        action.reference_asset_ids.length > 3
      ) {
        throw invalid("plan_revision_invalid", "reference_asset_ids 最多 3 个");
      }
    }
    const parentRequest = this.repository.get(
      "designRequests",
      actorId,
      parentVersion.design_request_id
    );
    const derivedSummary = this.designRequestService.createDerived(
      actorId,
      parentRequest,
      action
    );
    const run = this.startRun(
      actorId,
      derivedSummary.design_request_id,
      { schema_version: "1.0", reason: "initial" },
      {
        planAssetId,
        parentPlanVersionId: parentVersion.plan_version_id,
        revisionAction: action
      }
    );
    return {
      schema_version: "1.0",
      plan_asset_id: planAssetId,
      parent_plan_version_id: parentVersion.plan_version_id,
      design_request_id: derivedSummary.design_request_id,
      generation_run_id: run.generation_run_id,
      status: run.status
    };
  }

  patchPlan(actorId, planAssetId, body) {
    assertNoOwnerId(body);
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    if (body?.resource_version !== plan.resource_version) {
      throw conflict("resource_version_conflict", "方案状态已被更新", {
        current: {
          plan_asset_id: plan.plan_asset_id,
          resource_version: plan.resource_version,
          lifecycle: plan.lifecycle,
          decision_state: plan.decision_state
        }
      });
    }
    const changes = body.changes;
    if (!changes || typeof changes !== "object") {
      throw invalid("plan_patch_invalid", "changes 必须是对象");
    }
    rejectUnknownKeys(
      changes,
      new Set(["lifecycle", "decision_state"]),
      "plan_patch_invalid",
      "changes"
    );
    if (
      changes.lifecycle !== undefined &&
      !["draft", "saved", "archived"].includes(changes.lifecycle)
    ) {
      throw invalid("plan_patch_invalid", "lifecycle 不受支持");
    }
    if (
      changes.decision_state !== undefined &&
      !["undecided", "selected", "executing", "completed"].includes(
        changes.decision_state
      )
    ) {
      throw invalid("plan_patch_invalid", "decision_state 不受支持");
    }
    if (changes.lifecycle !== undefined) plan.lifecycle = changes.lifecycle;
    if (changes.decision_state !== undefined) {
      plan.decision_state = changes.decision_state;
    }
    plan.resource_version += 1;
    plan.updated_at = this.now().toISOString();
    this.repository.save("planAssets", actorId, plan);
    return clone(plan);
  }

  async generateLegacy(actorId, request) {
    const runId = `generation-run-${randomUUID()}`;
    const card = await this.#orchestrator(actorId, runId).generate(request);
    const now = this.now().toISOString();
    const spaceAssetId = `legacy-space-${randomUUID()}`;
    const spaceVersionId = `space-version-${randomUUID()}`;
    const designRequestId = `design-request-${randomUUID()}`;
    const planAssetId = card.plan ? `plan-${randomUUID()}` : null;
    const planVersionId = card.plan ? `plan-version-${randomUUID()}` : null;
    const sanitizedInput = clone(request);
    if (sanitizedInput.room_input?.image?.data_url) {
      delete sanitizedInput.room_input.image.data_url;
      sanitizedInput.room_input.image.reference = "asset://redacted/legacy-upload";
    }
    const snapshot = {
      trigger: "space_upload",
      space_asset_id: spaceAssetId,
      space_version_id: spaceVersionId,
      reference_asset_ids: [],
      goal: undefined,
      goal_codes: [...request.constraints.goals],
      constraints: {
        budget_cny: request.constraints.budget_cny,
        no_drilling: request.constraints.hard_constraints.includes("no_drilling"),
        keep_detected_object_ids: [],
        pet_context: request.constraints.hard_constraints.includes("pet_safe")
          ? "other"
          : "none"
      },
      editable_region_id: "desktop-and-back-wall",
      options: clone(request.options || {}),
      budget_source: "request",
      no_drilling_source: "request",
      actor_id: actorId,
      space_snapshot: {
        asset_id: spaceAssetId,
        resource_version: 1,
        name: "兼容接口临时空间",
        provenance: { kind: "upload" },
        attributes: {},
        space_version: {
          space_version_id: spaceVersionId,
          space_asset_id: spaceAssetId,
          state: "sealed",
          parse_state: "ready",
          resource_version: 1,
          media_ids: [],
          reference_width_cm: request.room_input.reference_width_cm ?? null,
          attributes: {
            scene_type: "desk_corner",
            editable_regions: [
              {
                editable_region_id: "desktop-and-back-wall",
                label: "桌面与后墙"
              }
            ],
            detected_objects: []
          },
          created_at: now,
          updated_at: now
        }
      },
      reference_snapshots: [],
      preference_snapshot: {},
      legacy_input: sanitizedInput,
      created_at: now
    };
    const record = {
      schema_version: "1.0",
      design_request_id: designRequestId,
      parent_design_request_id: null,
      validation_state: "valid",
      can_start_generation: true,
      missing_fields: [],
      input_snapshot: snapshot,
      created_at: now,
      updated_at: now
    };
    const expiresAt = new Date(
      this.now().getTime() +
        this.config.temporaryRetentionHours * 60 * 60 * 1000
    ).toISOString();
    const legacySpace = {
      schema_version: "1.0",
      asset_id: spaceAssetId,
      asset_type: "space",
      lifecycle: "temporary",
      parse_state: "ready",
      name: "兼容接口临时空间",
      tags: ["legacy_adapter"],
      is_default: false,
      resource_version: 1,
      current_space_version_id: spaceVersionId,
      expires_at: expiresAt,
      media_ids: [],
      provenance: {
        kind: request.room_input.image.reference?.startsWith("./")
          ? "demo_seed"
          : "upload"
      },
      attributes: {
        scene_type: "desk_corner",
        reference_width_cm: request.room_input.reference_width_cm ?? null,
        default_budget_cny: request.constraints.budget_cny,
        long_term_constraints: request.constraints.hard_constraints
      },
      dedup_key: null,
      last_used_at: now,
      deleted_at: null,
      created_at: now,
      updated_at: now
    };
    this.repository.transaction(() => {
      this.repository.save("assets", actorId, legacySpace);
      this.repository.save(
        "spaceVersions",
        actorId,
        record.input_snapshot.space_snapshot.space_version
      );
      this.repository.save("designRequests", actorId, record);
    });
    if (card.plan) {
      remapCardIdentity(card, {
        generationRunId: runId,
        planVersionId,
        version: 1,
        parentPlanVersionId: null,
        designRequestId,
        spaceVersionId,
        aggregateInspirationId: request.inspiration_input.inspiration_id,
        aggregateSourceType: request.inspiration_input.source_type,
        revisionAction: null
      });
      const planVersion = {
        schema_version: "1.0",
        plan_version_id: planVersionId,
        plan_asset_id: planAssetId,
        version: 1,
        parent_plan_version_id: null,
        design_request_id: designRequestId,
        generation_run_id: runId,
        design_request_snapshot: snapshot,
        revision_action: null,
        source_mode: card.source_mode,
        redactions: [],
        aicard: clone(card),
        created_at: now,
        updated_at: now
      };
      const plan = {
        schema_version: "1.0",
        plan_asset_id: planAssetId,
        root_design_request_id: designRequestId,
        current_design_request_id: designRequestId,
        current_plan_version_id: planVersionId,
        space_asset_id: spaceAssetId,
        lifecycle: "draft",
        decision_state: "undecided",
        resource_version: 1,
        created_at: now,
        updated_at: now
      };
      this.repository.save("planAssets", actorId, plan);
      this.repository.save("planVersions", actorId, planVersion);
      this.repository.bindMedia(
        actorId,
        spaceAssetId,
        generatedRenderMediaIds(card)
      );
    }
    const run = {
      schema_version: "1.0",
      generation_run_id: runId,
      design_request_id: designRequestId,
      retry_of_generation_run_id: null,
      status: "succeeded",
      phase: "packaging",
      phase_index: GENERATION_PHASES.length,
      phase_total: GENERATION_PHASES.length,
      source_mode: card.source_mode,
      retryable: false,
      result: planAssetId
        ? {
            plan_asset_id: planAssetId,
            plan_resource_version: 1,
            plan_version: this.repository.get(
              "planVersions",
              actorId,
              planVersionId
            )
          }
        : { plan_asset_id: null, plan_resource_version: null, plan_version: null, aicard: card },
      error: null,
      created_at: now,
      updated_at: now
    };
    this.repository.save("generationRuns", actorId, run);
    this.cardStore.set(card);
    return this.#projectCard(actorId, card);
  }

  async reviseLegacy(actorId, request) {
    const parentRun = this.repository.get(
      "generationRuns",
      actorId,
      request.request_id
    );
    const planAssetId = parentRun.result?.plan_asset_id;
    if (!planAssetId) throw new ApiError("plan_not_found", "原请求没有可调整方案", 404);
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    let parentVersion = this.repository.get(
      "planVersions",
      actorId,
      plan.current_plan_version_id
    );
    let planId = request.plan_id;
    if (planId !== parentVersion.plan_version_id) {
      const candidate = parentVersion.aicard.alternatives.find(
        (option) => option.plan.plan_id === planId
      );
      if (!candidate) throw new ApiError("plan_not_found", "找不到兼容方案候选", 404);
      const candidateCard = clone(parentVersion.aicard);
      candidateCard.plan = candidate.plan;
      candidateCard.validation = candidate.validation;
      candidateCard.products = candidate.products;
      candidateCard.render = candidate.render;
      candidateCard.alternatives = [];
      candidateCard.request_id = parentVersion.generation_run_id;
      this.cardStore.set(candidateCard);
      planId = candidate.plan.plan_id;
    }
    const runId = `generation-run-${randomUUID()}`;
    const generated = await this.#orchestrator(actorId, runId).revise({
      ...request,
      request_id: parentVersion.generation_run_id,
      plan_id: planId
    });
    const designRequest = this.repository.get(
      "designRequests",
      actorId,
      parentVersion.design_request_id
    );
    const derivedCreatedAt = this.now().toISOString();
    const derivedRecord = {
      schema_version: "1.0",
      design_request_id: `design-request-${randomUUID()}`,
      parent_design_request_id: designRequest.design_request_id,
      validation_state: "valid",
      can_start_generation: true,
      missing_fields: [],
      input_snapshot: {
        ...clone(designRequest.input_snapshot),
        trigger: "plan_continue",
        constraints: {
          ...clone(designRequest.input_snapshot.constraints),
          budget_cny: request.target_budget_cny
        },
        budget_source: "request",
        created_at: derivedCreatedAt
      },
      created_at: derivedCreatedAt,
      updated_at: derivedCreatedAt
    };
    this.repository.save("designRequests", actorId, derivedRecord);
    const versionNumber = parentVersion.version + 1;
    const versionId = `plan-version-${randomUUID()}`;
    remapCardIdentity(generated, {
      generationRunId: runId,
      planVersionId: versionId,
      version: versionNumber,
      parentPlanVersionId: parentVersion.plan_version_id,
      designRequestId: derivedRecord.design_request_id,
      spaceVersionId: derivedRecord.input_snapshot.space_version_id,
      aggregateInspirationId: parentVersion.aicard.inspiration_profile.inspiration_id,
      aggregateSourceType: parentVersion.aicard.inspiration_profile.source_type,
      revisionAction: {
        type: "reduce_budget",
        target_budget_cny: request.target_budget_cny
      }
    });
    const now = this.now().toISOString();
    const version = {
      schema_version: "1.0",
      plan_version_id: versionId,
      plan_asset_id: planAssetId,
      version: versionNumber,
      parent_plan_version_id: parentVersion.plan_version_id,
      design_request_id: derivedRecord.design_request_id,
      generation_run_id: runId,
      design_request_snapshot: clone(derivedRecord.input_snapshot),
      revision_action: {
        type: "reduce_budget",
        target_budget_cny: request.target_budget_cny
      },
      source_mode: generated.source_mode,
      redactions: [],
      aicard: clone(generated),
      created_at: now,
      updated_at: now
    };
    plan.current_plan_version_id = versionId;
    plan.current_design_request_id = derivedRecord.design_request_id;
    plan.resource_version += 1;
    plan.updated_at = now;
    this.repository.transaction(() => {
      this.repository.save("planVersions", actorId, version);
      this.repository.save("planAssets", actorId, plan);
    });
    const run = {
      schema_version: "1.0",
      generation_run_id: runId,
      design_request_id: derivedRecord.design_request_id,
      retry_of_generation_run_id: null,
      status: "succeeded",
      phase: "packaging",
      phase_index: GENERATION_PHASES.length,
      phase_total: GENERATION_PHASES.length,
      source_mode: generated.source_mode,
      retryable: false,
      result: {
        plan_asset_id: planAssetId,
        plan_resource_version: plan.resource_version,
        plan_version: version
      },
      error: null,
      created_at: now,
      updated_at: now
    };
    this.repository.save("generationRuns", actorId, run);
    this.cardStore.set(generated);
    return this.#projectCard(actorId, generated);
  }

  async #executeWorkflow(actorId, run, designRequest) {
    const snapshot = designRequest.input_snapshot;
    const parentVersion = run.parent_plan_version_id
      ? this.repository.get(
          "planVersions",
          actorId,
          run.parent_plan_version_id
        )
      : null;
    if (run.revision_action?.type === "reduce_budget") {
      return this.#orchestrator(actorId, run.generation_run_id).revise({
        schema_version: "1.0",
        request_id: parentVersion.generation_run_id,
        plan_id: parentVersion.plan_version_id,
        target_budget_cny: run.revision_action.target_budget_cny
      });
    }
    return this.#orchestrator(actorId, run.generation_run_id).generate(
      this.#toLegacyGenerateRequest(actorId, designRequest)
    );
  }

  #toLegacyGenerateRequest(actorId, designRequest) {
    const snapshot = designRequest.input_snapshot;
    const mediaId = snapshot.space_snapshot.space_version.media_ids?.[0];
    let image = {
      reference: mediaId
        ? `asset://private-media/${mediaId}`
        : "./assets/desk-before.png",
      media_type: "image/png"
    };
    if (mediaId && snapshot.options.analysis_mode !== "demo" && this.config.backendMode !== "demo") {
      const providerImage = this.mediaService.getForProvider(actorId, mediaId);
      image = {
        data_url: providerImage.dataUrl,
        media_type: providerImage.mediaType
      };
    }
    const detectedById = new Map(
      (
        snapshot.space_snapshot.space_version.attributes?.detected_objects || []
      ).map((item) => [item.detected_object_id, item])
    );
    const hardConstraints = [];
    if (snapshot.constraints.no_drilling) hardConstraints.push("no_drilling");
    for (const detectedId of snapshot.constraints.keep_detected_object_ids) {
      const category = detectedById.get(detectedId)?.category;
      if (category === "desk") hardConstraints.push("keep_desk");
      if (category === "chair") hardConstraints.push("keep_chair");
    }
    if (snapshot.constraints.pet_context !== "none") hardConstraints.push("pet_safe");
    const references = snapshot.reference_snapshots;
    const preferredStyle =
      snapshot.options.preferred_style_key ||
      references.find((item) => item.attributes?.style_key)?.attributes.style_key ||
      "warm";
    return {
      schema_version: "1.0",
      room_input: {
        room_id: snapshot.space_version_id,
        image,
        ...(Number.isInteger(
          snapshot.space_snapshot.space_version.reference_width_cm
        )
          ? {
              reference_width_cm:
                snapshot.space_snapshot.space_version.reference_width_cm
            }
          : {}),
        quality_hint: "clear"
      },
      inspiration_input: {
        inspiration_id: `aggregate-inspiration-${designRequest.design_request_id}`,
        source_type: references.length ? "user_owned" : "user_owned",
        style_key: preferredStyle
      },
      constraints: {
        budget_cny: snapshot.constraints.budget_cny,
        hard_constraints: [...new Set(hardConstraints)],
        soft_preferences: [
          ...(snapshot.preference_snapshot.styles || []),
          ...(snapshot.preference_snapshot.colors || [])
        ],
        goals: defaultGoalCodes(snapshot)
      },
      options: {
        analysis_mode: snapshot.options.analysis_mode,
        include_trace: snapshot.options.include_trace
      }
    };
  }

  #persistResult(actorId, run, designRequest, card) {
    const snapshot = designRequest.input_snapshot;
    if (!card.plan) {
      this.cardStore.set(card);
      return {
        plan_asset_id: null,
        plan_resource_version: null,
        plan_version: null,
        aicard: clone(card)
      };
    }
    const planAssetId = run.plan_asset_id_target || `plan-${randomUUID()}`;
    const existingPlan = run.plan_asset_id_target
      ? this.repository.get("planAssets", actorId, planAssetId)
      : null;
    const versionNumber = existingPlan
      ? this.repository
          .list("planVersions", actorId)
          .filter((item) => item.plan_asset_id === planAssetId).length + 1
      : 1;
    const planVersionId = `plan-version-${randomUUID()}`;
    const aggregateSourceType =
      snapshot.reference_asset_ids.length === 0
        ? "user_goal"
        : snapshot.reference_asset_ids.length > 1
          ? "aggregated_references"
          : snapshot.reference_snapshots[0].provenance.kind === "demo_seed"
            ? "demo"
            : "user_owned";
    remapCardIdentity(card, {
      generationRunId: run.generation_run_id,
      planVersionId,
      version: versionNumber,
      parentPlanVersionId: run.parent_plan_version_id,
      designRequestId: designRequest.design_request_id,
      spaceVersionId: snapshot.space_version_id,
      aggregateInspirationId: `aggregate-inspiration-${designRequest.design_request_id}`,
      aggregateSourceType,
      revisionAction: run.revision_action
    });
    const mediaId = snapshot.space_snapshot.space_version.media_ids?.[0];
    if (mediaId) {
      card.render.before_ref = `asset://private-media/${mediaId}`;
    }
    const createdAt = this.now().toISOString();
    const version = {
      schema_version: "1.0",
      plan_version_id: planVersionId,
      plan_asset_id: planAssetId,
      version: versionNumber,
      parent_plan_version_id: run.parent_plan_version_id,
      design_request_id: designRequest.design_request_id,
      generation_run_id: run.generation_run_id,
      design_request_snapshot: clone(snapshot),
      revision_action: clone(run.revision_action),
      source_mode: card.source_mode,
      redactions: [],
      aicard: clone(card),
      created_at: createdAt,
      updated_at: createdAt
    };
    const plan =
      existingPlan ||
      {
        schema_version: "1.0",
        plan_asset_id: planAssetId,
        root_design_request_id: designRequest.design_request_id,
        current_design_request_id: designRequest.design_request_id,
        current_plan_version_id: planVersionId,
        space_asset_id: snapshot.space_asset_id,
        lifecycle: "draft",
        decision_state: "undecided",
        resource_version: 1,
        created_at: createdAt,
        updated_at: createdAt
      };
    if (existingPlan) {
      plan.current_design_request_id = designRequest.design_request_id;
      plan.current_plan_version_id = planVersionId;
      plan.resource_version += 1;
      plan.updated_at = createdAt;
    }
    this.repository.transaction(() => {
      this.repository.save("planVersions", actorId, version);
      this.repository.save("planAssets", actorId, plan);
      this.repository.bindMedia(
        actorId,
        snapshot.space_asset_id,
        generatedRenderMediaIds(card)
      );
    });
    this.cardStore.set(card);
    return {
      plan_asset_id: planAssetId,
      plan_resource_version: plan.resource_version,
      plan_version: clone(version)
    };
  }

  #projectPlanVersion(actorId, version) {
    const projected = clone(version);
    projected.redactions = [...(projected.redactions || [])];
    projected.aicard = this.#projectCard(
      actorId,
      projected.aicard,
      projected.redactions,
      projected.design_request_snapshot
    );
    return projected;
  }

  #projectCard(actorId, card, redactions = [], snapshot = null) {
    const projected = clone(card);
    const sourceAvailable = snapshot
      ? Boolean(
          this.repository.find("assets", actorId, snapshot.space_asset_id)
        )
      : true;
    const projectRef = (reference, kind) => {
      const prefix = "asset://private-media/";
      if (!reference?.startsWith(prefix)) return reference;
      const mediaId = reference.slice(prefix.length);
      const media = this.repository.find("media", actorId, mediaId);
      if (!media || !sourceAvailable) {
        const code =
          kind === "source" ? "source_deleted" : "render_deleted";
        if (!redactions.some((item) => item.code === code)) {
          redactions.push({
            code,
            media_id: mediaId,
            message:
              kind === "source"
                ? "来源资产已删除，原图不再可见"
                : "派生效果图已删除"
          });
        }
        return kind === "source"
          ? "asset://redacted/source-deleted"
          : "asset://redacted/render-deleted";
      }
      return this.mediaService.project(actorId, media).access.url;
    };
    projected.render.before_ref = projectRef(
      projected.render.before_ref,
      "source"
    );
    const after = projectRef(projected.render.after_ref, "render");
    projected.render.after_ref = after;
    if (projected.plan) projected.plan.render_ref = after;
    for (const alternative of projected.alternatives) {
      alternative.render.before_ref = projectRef(
        alternative.render.before_ref,
        "source"
      );
      const alternativeAfter = projectRef(
        alternative.render.after_ref,
        "render"
      );
      alternative.render.after_ref = alternativeAfter;
      alternative.plan.render_ref = alternativeAfter;
    }
    return projected;
  }

  #orchestrator(actorId, requestId) {
    return createOrchestrator({
      config: this.config,
      roomAnalyzer: this.roomAnalyzer,
      persistGeneratedRender: ({ bytes, mediaType }) => {
        const media = this.mediaService.create(actorId, {
          file: {
            filename: generatedRenderFilename(mediaType),
            contentType: mediaType,
            bytes
          },
          purpose: "generated_render",
          retention: "temporary"
        });
        return `${PRIVATE_MEDIA_PREFIX}${media.media_id}`;
      },
      store: this.cardStore,
      requestIdFactory: () => requestId,
      now: this.now,
      fetchImpl: this.fetchImpl
    });
  }
}
