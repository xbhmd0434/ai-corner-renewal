import { randomUUID } from "node:crypto";
import { ApiError, assertNoOwnerId, conflict, invalid } from "../errors.js";

const STAGES = Object.freeze([
  "queued",
  "extracting_context",
  "retrieving_inspiration",
  "retrieving_scene",
  "reranking",
  "packaging"
]);

const STAGE_PROGRESS = {
  queued: 0,
  extracting_context: 15,
  retrieving_inspiration: 35,
  retrieving_scene: 55,
  reranking: 75,
  packaging: 90
};

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const RETRYABLE_STATUSES = new Set(["failed", "cancelled"]);
const CONTRACT_VERSION = "renewal-card/2.1";
const ALLOWED_SOURCES = new Set(["douyin", "user_publication"]);

const clone = (value) => structuredClone(value);
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

const OPEN_ACTION_ALLOWED_TYPES = new Set([
  "douyin_deeplink",
  "internal_publication",
  "unavailable"
]);

/**
 * DouyinContentProvider Port.
 * 真实抖音索引未接入前使用 DemoDouyinContentProvider；不得声称 live。
 */
export class UnconfiguredDouyinContentProvider {
  async search() {
    return { sourceType: "unavailable", items: [] };
  }
}

/**
 * 固定授权 Demo Douyin 内容目录。
 * 只返回 stable 的示例条目；带来源作者但不带真实链接除白名单外。
 */
export class DemoDouyinContentProvider {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.catalog = [
      {
        content_id: "douyin-content-demo-warm-desk",
        title: "原木书桌的一盏暖灯",
        author: { display_name: "示例作者-warm" },
        scene_types: ["desk_corner"],
        component_categories: ["vase", "table_lamp"],
        style_keywords: ["warm_cream", "japanese_natural"],
        cover: {
          media_id: null,
          access_url: "demo://covers/douyin-warm-desk-01.jpg"
        },
        open_action: {
          type: "douyin_deeplink",
          url: "snssdk1128://user/profile/example-warm"
        }
      },
      {
        content_id: "douyin-content-demo-green-desk",
        title: "轻绿治愈的书桌一角",
        author: { display_name: "示例作者-green" },
        scene_types: ["desk_corner"],
        component_categories: ["plant", "desk_riser"],
        style_keywords: ["green_soothing"],
        cover: {
          media_id: null,
          access_url: "demo://covers/douyin-green-desk.jpg"
        },
        open_action: {
          type: "douyin_deeplink",
          url: "snssdk1128://user/profile/example-green"
        }
      },
      {
        content_id: "douyin-content-demo-compact-desk",
        title: "高效收纳桌搭",
        author: { display_name: "示例作者-compact" },
        scene_types: ["desk_corner"],
        component_categories: ["desktop_storage", "cable_management"],
        style_keywords: ["compact"],
        cover: {
          media_id: null,
          access_url: "demo://covers/douyin-compact-desk.jpg"
        },
        open_action: {
          type: "douyin_deeplink",
          url: "snssdk1128://user/profile/example-compact"
        }
      }
    ];
  }

  async search({ sceneType, componentCategory, styleKeywords = [] }) {
    const items = this.catalog
      .map((entry) => {
        const sceneMatch = entry.scene_types.includes(sceneType);
        const componentMatch = componentCategory
          ? entry.component_categories.includes(componentCategory)
          : false;
        const styleMatch = styleKeywords.some((keyword) =>
          entry.style_keywords.includes(keyword)
        );
        return { entry, sceneMatch, componentMatch, styleMatch };
      })
      .filter(({ sceneMatch, componentMatch, styleMatch }) => sceneMatch || componentMatch || styleMatch)
      .map(({ entry, sceneMatch, componentMatch, styleMatch }) => ({
        content_id: entry.content_id,
        source_type: "douyin",
        title: entry.title,
        author: { display_name: entry.author.display_name },
        cover: entry.cover,
        open_action: entry.open_action,
        _internal: {
          sceneMatch,
          componentMatch,
          styleMatch
        }
      }));
    return { sourceType: "demo_catalog", items };
  }
}

/**
 * PublicationIndexProvider Port.
 * 从本地 SQLite 索引读取已发布 Publication，构造成 Related 项目。
 */
export class LocalPublicationIndexProvider {
  constructor({ repository, now = () => new Date() } = {}) {
    this.repository = repository;
    this.now = now;
  }

  async search({ actorId, sceneType, componentCategory, styleKeywords = [] }) {
    const publications = this.repository
      .list("publications", actorId)
      .filter((pub) => pub.status === "published");
    const items = publications
      .map((pub) => {
        const snapshotScene = pub.published_snapshot?.scene_type;
        const snapshotIntent = pub.published_snapshot?.intent_type;
        const snapshotKeywords = pub.published_snapshot?.style_keywords || [];
        const sceneMatch = snapshotScene && snapshotScene === sceneType;
        const componentMatch = Boolean(
          componentCategory &&
            (pub.published_snapshot?.component_categories || []).includes(componentCategory)
        );
        const styleMatch = styleKeywords.some((keyword) =>
          snapshotKeywords.includes(keyword)
        );
        if (!sceneMatch && !componentMatch && !styleMatch) return null;
        return {
          content_id: pub.publication_id,
          source_type: "user_publication",
          title: pub.title,
          author: { display_name: "社区作者" },
          cover: {
            media_id: null,
            access_url: pub.cover_access_url || null
          },
          open_action: {
            type: "internal_publication",
            internal_publication_id: pub.publication_id
          },
          _internal: {
            sceneMatch,
            componentMatch,
            styleMatch,
            snapshotIntent
          }
        };
      })
      .filter(Boolean);
    return { sourceType: "local_index", items };
  }
}

function runProgress(run) {
  if (run.status === "succeeded") return 100;
  if (run.status === "failed" || run.status === "cancelled") return 100;
  return STAGE_PROGRESS[run.stage] ?? 0;
}

function runSummary(run) {
  return {
    schema_version: "1.0",
    contract_version: CONTRACT_VERSION,
    related_design_run_id: run.related_design_run_id,
    design_request_id: run.design_request_id,
    context_fingerprint: run.context_fingerprint,
    reason: run.reason,
    status: run.status,
    stage: run.stage,
    progress: runProgress(run),
    result_state: run.result_state ?? null,
    source_mode: run.source_mode ?? null,
    retryable: run.retryable ?? false,
    result: run.result ?? null,
    error: run.error ?? null,
    created_at: run.created_at,
    updated_at: run.updated_at
  };
}

function sanitizeOpenAction(rawAction) {
  if (!rawAction || typeof rawAction !== "object" || !OPEN_ACTION_ALLOWED_TYPES.has(rawAction.type)) {
    return { type: "unavailable", url: null, internal_publication_id: null };
  }
  if (rawAction.type === "douyin_deeplink") {
    const url = typeof rawAction.url === "string" ? rawAction.url : null;
    if (!url || !url.startsWith("snssdk1128://")) {
      return { type: "unavailable", url: null, internal_publication_id: null };
    }
    return { type: "douyin_deeplink", url, internal_publication_id: null };
  }
  if (rawAction.type === "internal_publication") {
    if (typeof rawAction.internal_publication_id !== "string" || !rawAction.internal_publication_id.trim()) {
      return { type: "unavailable", url: null, internal_publication_id: null };
    }
    return {
      type: "internal_publication",
      url: null,
      internal_publication_id: rawAction.internal_publication_id.trim()
    };
  }
  return { type: "unavailable", url: null, internal_publication_id: null };
}

function relationsFor(item) {
  const inspiration =
    item._internal?.componentMatch || item._internal?.styleMatch
      ? {
          strength: "strong",
          reason_code: item._internal.componentMatch ? "same_component_match" : "same_style_match"
        }
      : { strength: "none", reason_code: "no_component_match" };
  const scene = item._internal?.sceneMatch
    ? { strength: "strong", reason_code: "same_scene_type" }
    : { strength: "none", reason_code: "no_scene_match" };
  return { inspiration, scene };
}

function fallbackDimensionFor(relations) {
  if (relations.inspiration.strength === "none" && relations.scene.strength !== "none") {
    return "inspiration";
  }
  if (relations.scene.strength === "none" && relations.inspiration.strength !== "none") {
    return "scene";
  }
  return null;
}

function reasonLabelsFor(relations, item) {
  const labels = [];
  if (relations.inspiration.strength === "strong" && relations.scene.strength === "strong") {
    labels.push("同款元素的同类空间搭配");
  } else if (relations.inspiration.strength === "strong") {
    labels.push("同款元素在不同空间");
  } else if (relations.scene.strength === "strong") {
    labels.push("同类空间的另一种思路");
  }
  return labels;
}

/**
 * RelatedDesignService — 与 GenerationRun 并行的相关设计运行。
 * 状态机、幂等和 actor 隔离；DemoDouyin + LocalPublication 双 Provider。
 */
export class RelatedDesignService {
  constructor({
    repository,
    designRequestService,
    douyinProvider = null,
    publicationProvider = null,
    now = () => new Date()
  }) {
    this.repository = repository;
    this.designRequestService = designRequestService;
    this.douyinProvider = douyinProvider || new DemoDouyinContentProvider({ now });
    this.publicationProvider =
      publicationProvider || new LocalPublicationIndexProvider({ repository, now });
    this.now = now;
    this.scheduled = new Set();
    this.pending = new Set();
    this.stopping = false;
  }

  create(actorId, designRequestId, body) {
    assertNoOwnerId(body);
    if (!body || body.schema_version !== "1.0") {
      throw invalid("related_design_request_invalid", "schema_version 必须是 1.0");
    }
    if (!["initial", "retry", "refresh"].includes(body.reason)) {
      throw invalid("related_design_request_invalid", "reason 必须是 initial、retry 或 refresh");
    }
    const options = body.options || {};
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 24)) {
      throw invalid("related_design_request_invalid", "limit 必须是 1～24 整数");
    }
    if (options.sources !== undefined) {
      if (!Array.isArray(options.sources) || options.sources.length === 0) {
        throw invalid("related_design_request_invalid", "sources 必须是非空数组");
      }
      for (const source of options.sources) {
        if (!ALLOWED_SOURCES.has(source)) {
          throw invalid("related_design_request_invalid", `sources 不支持 ${source}`);
        }
      }
    }

    const designRequest = this.repository.get("designRequests", actorId, designRequestId);
    // 只允许 renewal-card/2.1 experience contract
    const contract = designRequest.input_snapshot?.options?.experience_contract;
    if (contract !== "renewal-card/2.1") {
      throw invalid(
        "related_design_request_invalid",
        "只有 renewal-card/2.1 的 DesignRequest 支持 RelatedDesignRun"
      );
    }

    const contextFingerprint = designRequest.input_snapshot.context_fingerprint;
    if (!contextFingerprint) {
      throw invalid(
        "related_design_request_invalid",
        "DesignRequest 缺少 context_fingerprint，请重新创建"
      );
    }

    const allRuns = this.repository
      .list("relatedDesignRuns", actorId)
      .filter((run) => run.design_request_id === designRequestId);
    const active = allRuns.find((run) => ACTIVE_STATUSES.has(run.status));
    if (active) {
      throw conflict(
        "related_design_run_active",
        "该 DesignRequest 已有运行中的相关设计",
        { active_related_design_run_id: active.related_design_run_id }
      );
    }
    if (body.reason === "retry") {
      const target = allRuns.find((run) => RETRYABLE_STATUSES.has(run.status));
      if (!target) {
        throw invalid(
          "related_design_request_invalid",
          "没有失败/取消的 run 可以重试"
        );
      }
    }
    if (body.reason === "initial" && allRuns.some((run) => run.status === "succeeded")) {
      throw conflict(
        "related_design_already_succeeded",
        "该 DesignRequest 已有成功的相关设计，请使用 refresh"
      );
    }

    const now = this.now().toISOString();
    const run = {
      schema_version: "1.0",
      related_design_run_id: `related-run-${randomUUID()}`,
      design_request_id: designRequestId,
      context_fingerprint: contextFingerprint,
      reason: body.reason,
      options: {
        limit: options.limit || 12,
        sources: options.sources ? [...options.sources] : ["douyin", "user_publication"]
      },
      status: "queued",
      stage: "queued",
      source_mode: null,
      result_state: null,
      retryable: false,
      result: null,
      error: null,
      cancel_requested: false,
      created_at: now,
      updated_at: now
    };
    this.repository.save("relatedDesignRuns", actorId, run);
    this.schedule(actorId, run.related_design_run_id);
    return runSummary(run);
  }

  list(actorId, designRequestId) {
    // 拒绝跨 actor 访问：如果 designRequest 不属于 actor，get 会 404
    this.repository.get("designRequests", actorId, designRequestId);
    const runs = this.repository
      .list("relatedDesignRuns", actorId)
      .filter((run) => run.design_request_id === designRequestId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return {
      schema_version: "1.0",
      items: runs.map(runSummary)
    };
  }

  get(actorId, runId) {
    const run = this.repository.get("relatedDesignRuns", actorId, runId);
    return runSummary(run);
  }

  cancel(actorId, runId) {
    const run = this.repository.get("relatedDesignRuns", actorId, runId);
    if (!ACTIVE_STATUSES.has(run.status)) {
      throw conflict(
        "related_design_not_cancellable",
        "该运行已是终态，不能取消"
      );
    }
    run.cancel_requested = true;
    run.status = "cancelled";
    run.updated_at = this.now().toISOString();
    this.repository.save("relatedDesignRuns", actorId, run);
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
    for (const run of this.repository.list("relatedDesignRuns", actorId)) {
      if (ACTIVE_STATUSES.has(run.status)) {
        run.status = "queued";
        run.stage = "queued";
        run.updated_at = this.now().toISOString();
        this.repository.save("relatedDesignRuns", actorId, run);
        this.schedule(actorId, run.related_design_run_id);
      }
    }
  }

  async stop() {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
  }

  async process(actorId, runId) {
    let run = this.repository.get("relatedDesignRuns", actorId, runId);
    if (!ACTIVE_STATUSES.has(run.status)) return;

    const designRequest = this.repository.get(
      "designRequests",
      actorId,
      run.design_request_id
    );
    const snapshot = designRequest.input_snapshot;
    const currentFingerprint = snapshot.context_fingerprint;
    if (currentFingerprint !== run.context_fingerprint) {
      // 迟到运行，DesignRequest 被替换：直接取消，避免污染新结果
      run.status = "cancelled";
      run.updated_at = this.now().toISOString();
      run.error = { code: "context_fingerprint_stale", message: "上下文已更新，本次相关设计已放弃", retryable: false };
      this.repository.save("relatedDesignRuns", actorId, run);
      return;
    }

    const context = {
      douyinResult: null,
      publicationResult: null,
      merged: [],
      notices: []
    };

    try {
      for (let index = 0; index < STAGES.length; index += 1) {
        run = this.repository.get("relatedDesignRuns", actorId, runId);
        if (run.cancel_requested || run.status === "cancelled") {
          run.status = "cancelled";
          run.updated_at = this.now().toISOString();
          this.repository.save("relatedDesignRuns", actorId, run);
          return;
        }
        run.status = "running";
        run.stage = STAGES[index];
        run.updated_at = this.now().toISOString();
        this.repository.save("relatedDesignRuns", actorId, run);

        const updates = await this.#executeStage(actorId, run, context, snapshot, STAGES[index]);
        if (updates) {
          run = this.repository.get("relatedDesignRuns", actorId, runId);
          Object.assign(run, updates);
          run.updated_at = this.now().toISOString();
          this.repository.save("relatedDesignRuns", actorId, run);
        }
        await nextTurn();
      }

      run = this.repository.get("relatedDesignRuns", actorId, runId);
      if (run.cancel_requested || run.status === "cancelled") return;
      run.status = "succeeded";
      run.stage = "packaging";
      run.retryable = false;
      run.error = null;
      run.updated_at = this.now().toISOString();
      this.repository.save("relatedDesignRuns", actorId, run);
    } catch (error) {
      run = this.repository.get("relatedDesignRuns", actorId, runId);
      if (run.status === "cancelled") return;
      run.status = "failed";
      run.retryable = true;
      run.error = {
        code: error.code || "related_design_failed",
        message:
          error.statusCode && error.statusCode < 500
            ? error.message
            : "相关设计生成失败，可以重试",
        retryable: true
      };
      run.updated_at = this.now().toISOString();
      this.repository.save("relatedDesignRuns", actorId, run);
    }
  }

  async #executeStage(actorId, run, context, snapshot, stage) {
    switch (stage) {
      case "queued":
        return null;
      case "extracting_context": {
        const sceneType =
          snapshot.space_snapshot?.attributes?.scene_type ||
          snapshot.space_snapshot?.space_version?.attributes?.scene_type ||
          "desk_corner";
        const inspirationSnapshot = snapshot.reference_snapshots?.find(
          (item) => item.asset_type === "inspiration"
        );
        const confirmed = inspirationSnapshot?.confirmed_intent || null;
        context.searchParams = {
          sceneType,
          componentCategory:
            confirmed?.intent_type === "component"
              ? inspirationSnapshot.attributes?.intent_analysis?.component_reference?.category_code || null
              : null,
          styleKeywords:
            confirmed?.intent_type === "style"
              ? inspirationSnapshot.attributes?.intent_analysis?.style_reference?.style_keywords || []
              : []
        };
        return null;
      }
      case "retrieving_inspiration": {
        const sources = run.options.sources;
        if (sources.includes("douyin")) {
          context.douyinResult = await this.douyinProvider.search(context.searchParams);
        } else {
          context.douyinResult = { sourceType: "skipped", items: [] };
        }
        return null;
      }
      case "retrieving_scene": {
        const sources = run.options.sources;
        if (sources.includes("user_publication")) {
          context.publicationResult = await this.publicationProvider.search({
            actorId,
            ...context.searchParams
          });
        } else {
          context.publicationResult = { sourceType: "skipped", items: [] };
        }
        return null;
      }
      case "reranking": {
        const merged = [];
        const seen = new Set();
        for (const source of run.options.sources) {
          const bucket =
            source === "douyin" ? context.douyinResult?.items : context.publicationResult?.items;
          for (const raw of bucket || []) {
            if (seen.has(raw.content_id)) continue;
            seen.add(raw.content_id);
            const relations = relationsFor(raw);
            if (relations.inspiration.strength === "none" && relations.scene.strength === "none") continue;
            merged.push({
              content_id: raw.content_id,
              source_type: raw.source_type,
              title: raw.title,
              cover: raw.cover,
              author: raw.author,
              relations,
              reason_labels: reasonLabelsFor(relations, raw),
              fallback_dimension: fallbackDimensionFor(relations),
              open_action: sanitizeOpenAction(raw.open_action)
            });
          }
        }
        context.merged = merged.slice(0, run.options.limit);
        return null;
      }
      case "packaging": {
        const items = context.merged;
        const notices = [...context.notices];
        // provenance 标签
        const provenance = {};
        const sources = run.options.sources;
        if (sources.includes("douyin")) {
          provenance.douyin_content =
            context.douyinResult?.sourceType === "demo_catalog" ? "demo_catalog" : "unavailable";
        }
        if (sources.includes("user_publication")) {
          provenance.user_publications =
            context.publicationResult?.sourceType === "local_index" ? "local_index" : "unavailable";
        }
        const sourceMode = "fallback";
        let resultState;
        if (items.length === 0) {
          resultState = "empty";
          notices.push({
            code: "no_related_content",
            level: "info",
            message: "没有找到与你的灵感和场景同时匹配的公开帖子。"
          });
        } else if (items.some((item) => item.fallback_dimension)) {
          resultState = "partial";
          const dimensions = new Set(items.map((item) => item.fallback_dimension).filter(Boolean));
          if (dimensions.has("inspiration")) {
            notices.push({
              code: "inspiration_dimension_unavailable",
              level: "info",
              message: "没有同款元素的内容可关联，本次仅按场景推荐相关帖子。"
            });
          }
          if (dimensions.has("scene")) {
            notices.push({
              code: "scene_dimension_unavailable",
              level: "info",
              message: "没有同类空间的内容可关联，本次仅按元素推荐相关帖子。"
            });
          }
        } else {
          resultState = "ready";
        }
        return {
          source_mode: sourceMode,
          result_state: resultState,
          result: {
            items,
            notices,
            provenance
          }
        };
      }
      default:
        return null;
    }
  }
}
