import { randomUUID } from "node:crypto";
import { invalid } from "../errors.js";

const clone = (value) => structuredClone(value);

function rejectUnknownKeys(value, allowed, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw invalid(code, `不支持字段 ${unknown}`);
}

function validateSourceContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("visual_search_source_invalid", "source_context 必须是对象");
  }
  rejectUnknownKeys(
    value,
    new Set([
      "provider",
      "external_content_id",
      "author_display",
      "caption",
      "timestamp_ms",
      "selection_bbox"
    ]),
    "visual_search_source_invalid"
  );
  for (const key of ["provider", "external_content_id"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      throw invalid("visual_search_source_invalid", `source_context.${key} 不能为空`);
    }
  }
  if (!Number.isInteger(value.timestamp_ms) || value.timestamp_ms < 0) {
    throw invalid(
      "visual_search_source_invalid",
      "source_context.timestamp_ms 必须是非负整数"
    );
  }
  for (const key of ["author_display", "caption"]) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || value[key].length > 500)
    ) {
      throw invalid(
        "visual_search_source_invalid",
        `source_context.${key} 必须是 500 字以内文本`
      );
    }
  }
  const bbox = value.selection_bbox;
  if (!bbox || typeof bbox !== "object") {
    throw invalid("visual_search_source_invalid", "缺少 selection_bbox");
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (typeof bbox[key] !== "number" || bbox[key] < 0 || bbox[key] > 1) {
      throw invalid(
        "visual_search_source_invalid",
        `selection_bbox.${key} 必须在 0..1`
      );
    }
  }
  if (
    bbox.width <= 0 ||
    bbox.height <= 0 ||
    bbox.x + bbox.width > 1.000001 ||
    bbox.y + bbox.height > 1.000001
  ) {
    throw invalid("visual_search_source_invalid", "selection_bbox 超出画面");
  }
}

function candidateFromCatalog(candidate, identity, index) {
  return {
    candidate_id: `candidate-${index + 1}-${candidate.product_id}`,
    product_id: candidate.product_id,
    name: candidate.title,
    category: identity.label,
    category_code: candidate.category_code,
    price_cny: candidate.price_cny,
    visual_kind: identity.materials.includes("木") ? "oak" : "neutral",
    similarity_score: Math.max(0.62, 0.9 - index * 0.08),
    match_type: "visual_similar",
    match_reasons: [
      identity.category_code === candidate.category_code ? "品类相符" : "用途相近",
      ...(identity.colors.length ? [`颜色线索：${identity.colors[0]}`] : [])
    ],
    commerce_action: clone(candidate.commerce_action)
  };
}

export class VisualSearchService {
  constructor({
    repository,
    mediaService,
    assetService,
    componentProvider,
    catalogAdapter,
    config,
    now = () => new Date()
  }) {
    this.repository = repository;
    this.mediaService = mediaService;
    this.assetService = assetService;
    this.componentProvider = componentProvider;
    this.catalogAdapter = catalogAdapter;
    this.config = config;
    this.now = now;
  }

  async create(actorId, body) {
    if (!body || body.schema_version !== "1.0") {
      throw invalid("visual_search_query_invalid", "schema_version 必须是 1.0");
    }
    rejectUnknownKeys(
      body,
      new Set(["schema_version", "query_media_id", "source_context", "options"]),
      "visual_search_query_invalid"
    );
    rejectUnknownKeys(
      body.options || {},
      new Set(["max_candidates", "search_scope"]),
      "visual_search_query_invalid"
    );
    validateSourceContext(body.source_context);
    const media = this.repository.get("media", actorId, body.query_media_id);
    if (media.purpose !== "visual_search_query") {
      throw invalid(
        "visual_search_query_invalid",
        "query_media_id 必须引用 visual_search_query 媒体"
      );
    }
    const maxCandidates = Math.min(
      12,
      Math.max(1, Number(body.options?.max_candidates) || 8)
    );
    const createdAt = this.now().toISOString();
    const query = {
      schema_version: "1.0",
      visual_search_query_id: `visual-search-${randomUUID()}`,
      query_media_id: body.query_media_id,
      source_context: clone(body.source_context),
      status: "running",
      source_mode: null,
      component_identity: null,
      candidates: [],
      selected_asset_id: null,
      error: null,
      created_at: createdAt,
      updated_at: createdAt
    };
    this.repository.save("visualSearchQueries", actorId, query);
    try {
      const image = this.mediaService.getForProvider(actorId, body.query_media_id);
      const understood = await this.componentProvider({
        imageDataUrl: image.dataUrl,
        sourceContext: body.source_context,
        requestedMode: this.config.backendMode === "demo" ? "demo" : "auto"
      });
      const identity = understood.identity;
      const catalog = await this.catalogAdapter.retrieve({
        actorId,
        subject: {
          category_code: identity.category_code,
          search_queries: identity.search_queries
        },
        limit: maxCandidates
      });
      query.status = "succeeded";
      query.source_mode = understood.sourceType;
      query.component_identity = identity;
      query.candidates = catalog.candidates
        .slice(0, maxCandidates)
        .map((candidate, index) =>
          candidateFromCatalog(candidate, identity, index)
        );
      query.provider_trace = {
        prompt_version: understood.promptVersion,
        model: understood.model,
        latency_ms: understood.latencyMs,
        fallback_reason: understood.reason || null,
        catalog_source: catalog.sourceType
      };
      query.updated_at = this.now().toISOString();
      this.repository.save("visualSearchQueries", actorId, query);
      return clone(query);
    } catch (error) {
      query.status = "failed";
      query.error = {
        code: error.code || "visual_search_failed",
        message: "圈选组件识别或候选检索失败"
      };
      query.updated_at = this.now().toISOString();
      this.repository.save("visualSearchQueries", actorId, query);
      return clone(query);
    }
  }

  get(actorId, queryId) {
    return clone(this.repository.get("visualSearchQueries", actorId, queryId));
  }

  select(actorId, queryId, body) {
    if (!body || body.schema_version !== "1.0") {
      throw invalid("visual_search_selection_invalid", "schema_version 必须是 1.0");
    }
    rejectUnknownKeys(
      body,
      new Set([
        "schema_version",
        "candidate_id",
        "asset_lifecycle",
        "modeling_mode"
      ]),
      "visual_search_selection_invalid"
    );
    const query = this.repository.get("visualSearchQueries", actorId, queryId);
    if (query.status !== "succeeded") {
      throw invalid("visual_search_selection_invalid", "视觉搜索尚未成功完成");
    }
    const candidate = query.candidates.find(
      (item) => item.candidate_id === body.candidate_id
    );
    if (!candidate) {
      throw invalid("visual_search_selection_invalid", "候选组件不存在");
    }
    const asset = this.assetService.createSourceComponent(actorId, {
      mediaId: query.query_media_id,
      sourceContext: query.source_context,
      componentIdentity: query.component_identity,
      selectedCandidate: candidate,
      lifecycle: body.asset_lifecycle || "saved"
    });
    query.selected_asset_id = asset.asset_id;
    query.updated_at = this.now().toISOString();
    this.repository.save("visualSearchQueries", actorId, query);
    return {
      schema_version: "1.0",
      visual_search_query_id: queryId,
      candidate_id: candidate.candidate_id,
      asset,
      source_component: clone(asset.source_component),
      modeling_mode: body.modeling_mode || "preview_2d",
      model_state: "preview_2d_ready"
    };
  }
}
