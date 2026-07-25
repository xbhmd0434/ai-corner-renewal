import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { ApiError, assertNoOwnerId, conflict, invalid } from "../errors.js";
import {
  UnconfiguredProductDiscoveryProvider,
  PlanGroundedDiscoveryProvider,
  validateAgentOutput
} from "../adapters/product-discovery-agent.js";
import {
  DemoCommerceCatalogAdapter,
  groundProductMatches
} from "../adapters/commerce-catalog.js";

const STAGES = Object.freeze([
  "queued",
  "analyzing_render",
  "building_queries",
  "retrieving_products",
  "grounding_matches",
  "packaging"
]);

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const RETRYABLE_STATUSES = new Set(["failed", "cancelled"]);

const ACTIVITY_STAGE_INDEX = {
  queued: 1,
  analyzing_render: 2,
  building_queries: 3,
  retrieving_products: 4,
  grounding_matches: 5,
  packaging: 6
};

const PRIVATE_MEDIA_PREFIX = "asset://private-media/";

const clone = (value) => structuredClone(value);
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function runProgress(run) {
  if (run.status === "succeeded") return 100;
  if (run.status === "queued" && run.stage === "queued") return 0;
  const stageIndex = ACTIVITY_STAGE_INDEX[run.stage] || 1;
  return Math.min(99, Math.max(0, Math.round((stageIndex / STAGES.length) * 100)));
}

function runStageIndex(stage) {
  return ACTIVITY_STAGE_INDEX[stage] || 1;
}

function runSummary(run) {
  const projected = clone(run);
  // 从不暴露完整内部数据，只返回协议字段
  return {
    schema_version: "1.0",
    product_discovery_run_id: projected.product_discovery_run_id,
    plan_asset_id: projected.plan_asset_id,
    plan_version_id: projected.plan_version_id,
    render_fingerprint: projected.render_fingerprint,
    status: projected.status,
    stage: projected.stage,
    stage_index: runStageIndex(projected.stage),
    stage_total: STAGES.length,
    progress: runProgress(projected),
    source_mode: projected.source_mode ?? null,
    result_state: projected.result_state ?? null,
    retryable: projected.retryable ?? false,
    result: projected.result ?? null,
    error: projected.error ?? null,
    created_at: projected.created_at,
    updated_at: projected.updated_at
  };
}

function runListItem(run) {
  const projected = clone(run);
  const summary = runSummary(projected);
  const subjectsCount = projected.result?.subjects_count ?? 0;
  const matchesCount = projected.result?.matches_count ?? 0;
  const item = {
    product_discovery_run_id: summary.product_discovery_run_id,
    status: summary.status,
    stage: summary.stage,
    progress: summary.progress,
    source_mode: summary.source_mode,
    result_state: summary.result_state,
    subjects_count: subjectsCount,
    matches_count: matchesCount,
    created_at: summary.created_at,
    updated_at: summary.updated_at
  };
  return item;
}

/**
 * ProductDiscoveryService
 *
 * 独立、可持久、可恢复的 PlanVersion 后置工作流：
 * queued → analyzing_render → building_queries → retrieving_products
 * → grounding_matches → packaging → succeeded | failed | cancelled
 */
export class ProductDiscoveryService {
  constructor({
    repository,
    mediaService,
    config,
    provider = null,
    catalogAdapter = null,
    fetchImpl = globalThis.fetch,
    now = () => new Date()
  }) {
    this.repository = repository;
    this.mediaService = mediaService;
    this.config = config;
    this.provider = provider || new UnconfiguredProductDiscoveryProvider();
    this.catalogAdapter = catalogAdapter || new DemoCommerceCatalogAdapter({ now });
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.scheduled = new Set();
    this.pending = new Set();
    this.stopping = false;
  }

  /**
   * 创建 ProductDiscoveryRun
   */
  create(actorId, planAssetId, planVersionId, body) {
    assertNoOwnerId(body);

    // 校验请求字段
    if (!body || !["initial", "retry", "refresh"].includes(body.reason)) {
      throw invalid(
        "product_discovery_request_invalid",
        "reason 必须是 initial、retry 或 refresh"
      );
    }

    // 校验 PlanAsset 和 PlanVersion 存在且属于同一个 PlanAsset
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    const planVersion = this.repository.get("planVersions", actorId, planVersionId);
    if (planVersion.plan_asset_id !== planAssetId) {
      throw new ApiError("resource_not_found", "方案版本不属于该方案", 404);
    }

    // 校验 options
    const options = body.options || {};
    const maxSubjects = Number.isInteger(options.max_subjects)
      ? Math.min(Math.max(options.max_subjects, 1), 8)
      : 6;
    const matchesPerSubject = Number.isInteger(options.matches_per_subject)
      ? Math.min(Math.max(options.matches_per_subject, 1), 5)
      : 3;
    const discoveryMode = ["auto", "live", "demo"].includes(options.discovery_mode)
      ? options.discovery_mode
      : "auto";

    // 检查 same PlanVersion active run
    const allRuns = this.repository
      .list("productDiscoveryRuns", actorId)
      .filter(
        (run) =>
          run.plan_asset_id === planAssetId &&
          run.plan_version_id === planVersionId
      );

    const active = allRuns.find((run) => ACTIVE_STATUSES.has(run.status));
    if (active) {
      throw conflict(
        "product_discovery_run_active",
        "该方案版本已有运行中的商品发现",
        { active_product_discovery_run_id: active.product_discovery_run_id }
      );
    }

    const succeeded = allRuns.find((run) => run.status === "succeeded");

    // reason 语义校验
    if (body.reason === "initial") {
      if (succeeded) {
        throw conflict(
          "product_discovery_already_succeeded",
          "该方案版本已经完成商品发现，请使用 refresh 或直接 list",
          { succeeded_product_discovery_run_id: succeeded.product_discovery_run_id }
        );
      }
      if (body.retry_of_product_discovery_run_id !== undefined) {
        throw invalid(
          "product_discovery_retry_invalid",
          "initial 不能提供 retry_of_product_discovery_run_id"
        );
      }
    } else if (body.reason === "retry") {
      if (!body.retry_of_product_discovery_run_id || typeof body.retry_of_product_discovery_run_id !== "string") {
        throw invalid(
          "product_discovery_retry_invalid",
          "retry 必须提供 retry_of_product_discovery_run_id"
        );
      }
      const retryTarget = this.repository.find(
        "productDiscoveryRuns",
        actorId,
        body.retry_of_product_discovery_run_id
      );
      if (!retryTarget) {
        throw new ApiError("resource_not_found", "retry 目标 run 不存在", 404);
      }
      if (retryTarget.plan_asset_id !== planAssetId || retryTarget.plan_version_id !== planVersionId) {
        throw invalid(
          "product_discovery_retry_invalid",
          "retry 目标必须属于同一 PlanVersion"
        );
      }
      if (!RETRYABLE_STATUSES.has(retryTarget.status)) {
        throw invalid(
          "product_discovery_retry_invalid",
          "只能重试 failed 或 cancelled 的运行"
        );
      }
    } else if (body.reason === "refresh") {
      if (!succeeded) {
        throw invalid(
          "product_discovery_retry_invalid",
          "refresh 要求已有 succeeded 的运行"
        );
      }
      if (body.retry_of_product_discovery_run_id !== undefined) {
        throw invalid(
          "product_discovery_retry_invalid",
          "refresh 不能提供 retry_of_product_discovery_run_id"
        );
      }
    }

    // Render 前置校验
    const renderCheck = this.#checkRenderAvailability(actorId, planVersion);
    if (!renderCheck.available) {
      throw conflict(renderCheck.code, renderCheck.message);
    }

    const renderFingerprint = renderCheck.fingerprint;

    // refresh: after 图 fingerprint 必须仍相同
    if (body.reason === "refresh" && succeeded) {
      if (succeeded.render_fingerprint !== renderFingerprint) {
        throw conflict(
          "product_discovery_retry_invalid",
          "after 图已变更，不能 refresh；请使用 initial"
        );
      }
    }

    const createdAt = this.now().toISOString();
    const run = {
      schema_version: "1.0",
      product_discovery_run_id: `product-discovery-run-${randomUUID()}`,
      plan_asset_id: planAssetId,
      plan_version_id: planVersionId,
      render_fingerprint: renderFingerprint,
      retry_of_product_discovery_run_id: body.reason === "retry"
        ? body.retry_of_product_discovery_run_id
        : null,
      reason: body.reason,
      options: { discovery_mode: discoveryMode, max_subjects: maxSubjects, matches_per_subject: matchesPerSubject },
      status: "queued",
      stage: "queued",
      source_mode: null,
      result_state: null,
      retryable: false,
      result: null,
      error: null,
      cancel_requested: false,
      notices: renderCheck.notices || [],
      created_at: createdAt,
      updated_at: createdAt
    };

    this.repository.save("productDiscoveryRuns", actorId, run);
    this.schedule(actorId, run.product_discovery_run_id);
    return runSummary(run);
  }

  /**
   * 列出 PlanVersion 的 ProductDiscoveryRuns
   */
  list(actorId, planAssetId, planVersionId, query = {}) {
    // 校验所有权
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    const planVersion = this.repository.get("planVersions", actorId, planVersionId);
    if (planVersion.plan_asset_id !== planAssetId) {
      throw new ApiError("resource_not_found", "方案版本不属于该方案", 404);
    }

    const limit = query.limit === undefined ? 10 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > this.config.listLimitMax) {
      throw invalid("query_invalid", `limit 必须是 1～${this.config.listLimitMax}`);
    }

    let runs = this.repository
      .list("productDiscoveryRuns", actorId)
      .filter(
        (run) =>
          run.plan_asset_id === planAssetId &&
          run.plan_version_id === planVersionId
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = runs.length;
    const offset = query.cursor
      ? Number(Buffer.from(query.cursor, "base64url").toString("utf8"))
      : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw invalid("cursor_invalid", "cursor 无效");
    }

    const page = runs.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return {
      schema_version: "1.0",
      items: page.map(runListItem),
      next_cursor: nextOffset < total
        ? Buffer.from(String(nextOffset)).toString("base64url")
        : null,
      total
    };
  }

  /**
   * 获取单个 ProductDiscoveryRun
   */
  get(actorId, runId) {
    const run = this.repository.get("productDiscoveryRuns", actorId, runId);
    return runSummary(run);
  }

  /**
   * 取消 ProductDiscoveryRun
   */
  cancel(actorId, runId) {
    const run = this.repository.get("productDiscoveryRuns", actorId, runId);
    if (!ACTIVE_STATUSES.has(run.status)) {
      throw conflict(
        "product_discovery_not_cancellable",
        "该运行已是终态，不能取消"
      );
    }
    run.cancel_requested = true;
    run.status = "cancelled";
    run.updated_at = this.now().toISOString();
    this.repository.save("productDiscoveryRuns", actorId, run);
    return runSummary(run);
  }

  // ---- 调度与恢复 ----

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
    for (const run of this.repository.list("productDiscoveryRuns", actorId)) {
      if (ACTIVE_STATUSES.has(run.status)) {
        run.status = "queued";
        run.stage = "queued";
        run.updated_at = this.now().toISOString();
        this.repository.save("productDiscoveryRuns", actorId, run);
        this.schedule(actorId, run.product_discovery_run_id);
      }
    }
  }

  async stop() {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
  }

  // ---- 核心流程 ----

  async process(actorId, runId) {
    let run = this.repository.get("productDiscoveryRuns", actorId, runId);
    if (!ACTIVE_STATUSES.has(run.status)) return;

    // 阶段间的临时上下文，不写入数据库
    const context = {
      planVersion: null,
      providerImage: null,
      discoverySubjects: [],
      providerResult: null,
      usedFallback: false,
      notices: [],
      provenance: null,
      catalogCandidates: {},
      groundedSubjects: null
    };

    try {
      const planVersion = this.repository.get("planVersions", actorId, run.plan_version_id);
      context.planVersion = planVersion;

      // 阶段 1-6
      for (let index = 0; index < STAGES.length; index += 1) {
        run = this.repository.get("productDiscoveryRuns", actorId, runId);
        if (run.cancel_requested || run.status === "cancelled") {
          run.status = "cancelled";
          run.updated_at = this.now().toISOString();
          this.repository.save("productDiscoveryRuns", actorId, run);
          return;
        }

        run.status = "running";
        run.stage = STAGES[index];
        run.updated_at = this.now().toISOString();
        this.repository.save("productDiscoveryRuns", actorId, run);

        const updates = await this.#executeStage(actorId, run, context, STAGES[index]);
        if (updates) {
          // updates 可能包含 source_mode、result_state、result、notices 等持久字段
          run = this.repository.get("productDiscoveryRuns", actorId, runId);
          Object.assign(run, updates);
          run.updated_at = this.now().toISOString();
          this.repository.save("productDiscoveryRuns", actorId, run);
        }

        await nextTurn();
      }

      // 完成
      run = this.repository.get("productDiscoveryRuns", actorId, runId);
      if (run.cancel_requested || run.status === "cancelled") return;

      run.status = "succeeded";
      run.stage = "packaging";
      run.retryable = false;
      run.error = null;
      run.updated_at = this.now().toISOString();
      this.repository.save("productDiscoveryRuns", actorId, run);

    } catch (error) {
      run = this.repository.get("productDiscoveryRuns", actorId, runId);
      if (run.status === "cancelled") return;

      run.status = "failed";
      run.retryable = true;
      run.result = null;
      run.error = {
        code: error.code || "product_discovery_failed",
        message: error.statusCode && error.statusCode < 500
          ? error.message
          : "商品发现未完成，可以重试",
        retryable: true
      };
      run.updated_at = this.now().toISOString();
      this.repository.save("productDiscoveryRuns", actorId, run);
    }
  }

  async #executeStage(actorId, run, context, stage) {
    switch (stage) {
      case "queued":
        return null;

      case "analyzing_render": {
        const planVersion = context.planVersion;
        const renderCheck = this.#checkRenderAvailability(actorId, planVersion);
        if (!renderCheck.available) {
          throw conflict(renderCheck.code, renderCheck.message);
        }

        // 检测旧 AICard 兼容 notice
        for (const notice of renderCheck.notices || []) {
          context.notices.push(notice);
        }

        context.providerImage = this.#getProviderImage(actorId, planVersion);
        return null;
      }

      case "building_queries": {
        const planVersion = context.planVersion;
        const options = run.options || {};

        let providerResult;
        let usedFallback = false;
        let discoverySubjects = [];

        try {
          const aicard = planVersion?.aicard || {};
          const plan = aicard.plan || {};

          providerResult = await this.provider.discover({
            image: context.providerImage ? {
              dataUrl: context.providerImage.dataUrl,
              mediaType: context.providerImage.mediaType
            } : null,
            context: {
              planVersionId: run.plan_version_id,
              planAssetId: run.plan_asset_id,
              sceneType: planVersion?.design_request_snapshot?.space_snapshot?.space_version?.attributes?.scene_type || "desk_corner",
              planTitle: plan.title || "",
              placements: plan.placements || [],
              aicard,
              planVersion
            },
            limits: {
              maxSubjects: options.max_subjects || 6,
              maxQueriesPerSubject: 3
            },
            requestedMode: options.discovery_mode || "auto"
          });
        } catch (providerError) {
          if (providerError.code === "product_discovery_not_configured" || (providerError.statusCode && providerError.statusCode >= 500)) {
            const planGrounded = new PlanGroundedDiscoveryProvider({
              repository: this.repository,
              now: this.now
            });
            const aicard = planVersion?.aicard || {};
            providerResult = await planGrounded.discover({
              context: {
                planVersionId: run.plan_version_id,
                planAssetId: run.plan_asset_id,
                planTitle: aicard.plan?.title || "",
                placements: aicard.plan?.placements || [],
                aicard,
                planVersion
              },
              limits: {
                maxSubjects: options.max_subjects || 6,
                maxQueriesPerSubject: 3
              }
            });
            usedFallback = true;
            context.notices.push({
              code: "provider_failed_using_fallback",
              level: "warning",
              message: "图像 Agent 未配置或不可用，使用方案关联数据。"
            });
          } else {
            throw providerError;
          }
        }

        // 校验 Agent 输出
        const validation = validateAgentOutput(
          { schema_version: "1.0", subjects: providerResult.subjects },
          options.max_subjects || 6
        );

        if (!validation.valid && !usedFallback) {
          // Agent 输出非法 → fallback
          const planGrounded = new PlanGroundedDiscoveryProvider({
            repository: this.repository,
            now: this.now
          });
          const aicard = planVersion?.aicard || {};
          const fallbackResult = await planGrounded.discover({
            context: {
              planVersionId: run.plan_version_id,
              planAssetId: run.plan_asset_id,
              planTitle: aicard.plan?.title || "",
              placements: aicard.plan?.placements || [],
              aicard,
              planVersion
            },
            limits: {
              maxSubjects: options.max_subjects || 6,
              maxQueriesPerSubject: 3
            }
          });
          providerResult = fallbackResult;
          const fallbackValidation = validateAgentOutput(
            { schema_version: "1.0", subjects: fallbackResult.subjects },
            options.max_subjects || 6
          );
          discoverySubjects = fallbackValidation.subjects;
          usedFallback = true;
          context.notices.push({
            code: "agent_contract_invalid_using_fallback",
            level: "warning",
            message: "Agent 输出不符合协议，使用方案关联数据。"
          });
        } else {
          discoverySubjects = validation.subjects;
        }

        const sourceMode = usedFallback
          ? "fallback"
          : (providerResult.sourceType === "live" ? "live" : (providerResult.sourceType === "demo" ? "demo" : "fallback"));

        context.discoverySubjects = discoverySubjects;
        context.providerResult = providerResult;
        context.usedFallback = usedFallback;
        context.provenance = {
          image_analysis: {
            source_type: usedFallback ? "fallback" : (providerResult.sourceType || "fallback"),
            strategy: providerResult.strategy || (usedFallback ? "plan_grounded" : "unknown"),
            provider: providerResult.provider || null,
            model: providerResult.model || null,
            prompt_version: providerResult.promptVersion || null
          },
          commerce_catalog: null
        };

        return { source_mode: sourceMode };
      }

      case "retrieving_products": {
        const subjects = context.discoverySubjects || [];
        const options = run.options || {};
        const catalogCandidates = {};

        for (const subject of subjects) {
          try {
            const result = await this.catalogAdapter.retrieve({
              actorId,
              subject,
              limit: options.matches_per_subject || 3
            });
            catalogCandidates[subject.subject_id] = result.candidates;

            if (!context.provenance.commerce_catalog) {
              context.provenance.commerce_catalog = {
                source_type: result.sourceType,
                label: result.sourceType === "demo_catalog" ? "本地 Demo 商品目录" : "商品目录",
                checked_at: result.checkedAt
              };
            }
          } catch {
            catalogCandidates[subject.subject_id] = [];
          }
        }

        if (!context.provenance.commerce_catalog) {
          context.provenance.commerce_catalog = {
            source_type: "unavailable",
            label: "未调用商品目录",
            checked_at: this.now().toISOString()
          };
        }

        context.catalogCandidates = catalogCandidates;
        return null;
      }

      case "grounding_matches": {
        const subjects = context.discoverySubjects || [];
        const catalogCandidates = context.catalogCandidates || {};
        const options = run.options || {};

        groundProductMatches(subjects, catalogCandidates, {
          matchesPerSubject: options.matches_per_subject || 3,
          now: this.now().toISOString()
        });

        context.groundedSubjects = subjects;
        return null;
      }

      case "packaging": {
        const subjects = context.groundedSubjects || context.discoverySubjects || [];
        const notices = [...context.notices];

        if (run.source_mode === "fallback") {
          notices.push({
            code: "plan_grounded_fallback",
            level: "info",
            message: "当前结果根据本次方案关联，不代表图像 Agent 已实时识别。"
          });
        }
        if (context.provenance?.commerce_catalog?.source_type === "demo_catalog") {
          notices.push({
            code: "demo_commerce_catalog",
            level: "warning",
            message: "商品来自 Demo 目录，仅用于验证购买承接流程。"
          });
        }

        const matchedSubjects = subjects.filter((s) => s.match_state === "matched");
        const totalMatches = subjects.reduce((sum, s) => sum + (s.matches?.length || 0), 0);

        let resultState;
        if (subjects.length === 0) {
          resultState = "empty";
          notices.push({
            code: "no_reliable_product_subject",
            level: "info",
            message: "没有从效果图中找到足够可靠的可购买元素。"
          });
        } else if (matchedSubjects.length === 0) {
          resultState = "empty";
        } else if (matchedSubjects.length < subjects.length) {
          resultState = "partial";
        } else {
          resultState = "ready";
        }

        // === V2.1 implementation_list ===
        // 从 PlanVersion.implementation_source_roles 提取角色映射
        const planVersion = context.planVersion;
        const roleMap = new Map();
        for (const role of planVersion?.implementation_source_roles || []) {
          roleMap.set(role.product_id, role.role);
        }
        const originLabels = {
          video_selected: "视频圈选",
          source_video: "原视频里出现",
          ai_supplement: "AI 补充"
        };
        const originSortGroup = {
          video_selected: 0,
          source_video: 0,
          ai_supplement: 1
        };
        // 每个 matched subject → 一个 list item；使用第一个 match 决定 origin
        const implementationList = [];
        let cursor = 0;
        const bySortGroup = new Map();
        const seenProductIds = new Set();
        for (const subject of subjects) {
          if (subject.match_state !== "matched") continue;
          const matches = subject.matches || [];
          if (!matches.length) continue;
          // 商品去重：subject 主 match 若已被之前 subject 选中，尝试用备选
          let selected = matches.find((match) => !seenProductIds.has(match.product_id));
          if (!selected) continue;
          seenProductIds.add(selected.product_id);
          const alternatives = matches
            .filter((match) => match.match_id !== selected.match_id)
            .map((match) => match.match_id);
          const originType = roleMap.get(selected.product_id) || "ai_supplement";
          const sortGroup = originSortGroup[originType];
          const groupIndex = bySortGroup.get(sortGroup) || 0;
          bySortGroup.set(sortGroup, groupIndex + 1);
          implementationList.push({
            list_item_id: `implementation-item-${randomUUID()}`,
            subject_id: subject.subject_id,
            display_name: subject.label,
            origin_type: originType,
            origin_label: originLabels[originType],
            sort_group: sortGroup,
            sort_index: groupIndex,
            disposition: "add",
            quantity: 1,
            selected_match_id: selected.match_id,
            alternative_match_ids: alternatives
          });
          cursor += 1;
        }
        // 按 sort_group, sort_index 排序
        implementationList.sort(
          (a, b) => a.sort_group - b.sort_group || a.sort_index - b.sort_index
        );
        const estimatedTotal = implementationList.reduce((sum, item) => {
          const subject = subjects.find((s) => s.subject_id === item.subject_id);
          const match = subject?.matches?.find((m) => m.match_id === item.selected_match_id);
          const price = Number.isInteger(match?.price_cny) ? match.price_cny : 0;
          return sum + price * item.quantity;
        }, 0);

        return {
          result_state: resultState,
          result: {
            subjects,
            subjects_count: subjects.length,
            matched_subjects_count: matchedSubjects.length,
            matches_count: totalMatches,
            notices,
            provenance: context.provenance || {
              image_analysis: {
                source_type: "fallback",
                strategy: "plan_grounded",
                provider: null,
                model: null,
                prompt_version: null
              },
              commerce_catalog: {
                source_type: "unavailable",
                label: "未调用商品目录",
                checked_at: this.now().toISOString()
              }
            },
            implementation_list: implementationList,
            estimated_total_cny: estimatedTotal,
            currency: "CNY"
          }
        };
      }

      default:
        return null;
    }
  }

  // ---- Render 前置校验 ----

  #checkRenderAvailability(actorId, planVersion) {
    const notices = [];
    const aicard = planVersion.aicard || {};
    const render = aicard.render || {};

    // 检查 after_ref
    const afterRef = render.after_ref;
    if (!afterRef) {
      return {
        available: false,
        code: "plan_render_unavailable",
        message: "该方案版本没有可识别的 after 效果图",
        fingerprint: null,
        notices
      };
    }

    // 检查渲染状态
    if (render.consistency_status === "rejected") {
      return {
        available: false,
        code: "plan_render_rejected",
        message: "效果图评测未通过，不能用于商品识别",
        fingerprint: null,
        notices
      };
    }

    if (render.consistency_status === "unavailable") {
      return {
        available: false,
        code: "plan_render_unavailable",
        message: "没有可用的效果图",
        fingerprint: null,
        notices
      };
    }

    // stale 也拒绝（按协议要求）
    if (render.consistency_status === "stale") {
      return {
        available: false,
        code: "plan_render_unavailable",
        message: "效果图已过期，不能用于商品识别",
        fingerprint: null,
        notices
      };
    }

    // 旧 AICard v1 兼容（没有 consistency_status）
    if (!render.consistency_status) {
      // 只检查 after_ref 是否存在
      notices.push({
        code: "legacy_render_consistency_unverified",
        level: "warning",
        message: "该方案版本使用旧版 AICard，效果图一致性未经验证。"
      });
    }

    // 检查 after_ref 是否能读取
    let fingerprint;
    if (afterRef.startsWith(PRIVATE_MEDIA_PREFIX)) {
      const mediaId = afterRef.slice(PRIVATE_MEDIA_PREFIX.length);
      const media = this.repository.find("media", actorId, mediaId);
      if (!media || media.deleted_at) {
        return {
          available: false,
          code: "plan_render_unavailable",
          message: "效果图已删除或不可访问",
          fingerprint: null,
          notices
        };
      }
      fingerprint = `sha256:${createHash("sha256").update(mediaId).digest("hex").slice(0, 16)}`;
    } else if (afterRef.startsWith("asset://redacted/")) {
      return {
        available: false,
        code: "plan_render_unavailable",
        message: "效果图已被脱敏或删除",
        fingerprint: null,
        notices
      };
    } else {
      // Demo 引用
      fingerprint = `sha256:${createHash("sha256").update(afterRef).digest("hex").slice(0, 16)}`;
    }

    return {
      available: true,
      code: null,
      message: null,
      fingerprint,
      notices
    };
  }

  #getProviderImage(actorId, planVersion) {
    const aicard = planVersion.aicard || {};
    const render = aicard.render || {};
    const afterRef = render.after_ref;

    if (!afterRef) return null;

    if (afterRef.startsWith(PRIVATE_MEDIA_PREFIX)) {
      const mediaId = afterRef.slice(PRIVATE_MEDIA_PREFIX.length);
      try {
        return this.mediaService.getForProvider(actorId, mediaId);
      } catch {
        return null;
      }
    }

    return null;
  }
}
