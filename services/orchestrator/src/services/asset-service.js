import { randomUUID } from "node:crypto";
import { ApiError, assertNoOwnerId, conflict, invalid } from "../errors.js";

const ASSET_TYPES = new Set(["space", "inspiration", "item"]);
const LIFECYCLES = new Set(["temporary", "saved", "archived"]);
const PARSE_STATES = new Set([
  "queued",
  "parsing",
  "needs_confirmation",
  "ready",
  "failed"
]);
const DISPOSITIONS = new Set(["keep", "movable", "removable"]);
const BBOX_KEYS = ["x", "y", "width", "height"];

const clone = (value) => structuredClone(value);
const uniqueStrings = (value) =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "string" && item.trim()) &&
  new Set(value).size === value.length;

function rejectUnknownKeys(value, allowed, code = "field_not_allowed") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw invalid(code, `不支持字段 ${unknown}`);
}

function requireVersion(actual, provided, summary) {
  if (!Number.isInteger(provided) || provided !== actual) {
    throw conflict(
      "resource_version_conflict",
      "资源已被其他操作更新，请刷新后重试",
      { current: summary }
    );
  }
}

function validateBbox(bbox, path) {
  if (!bbox || typeof bbox !== "object") {
    throw invalid("bbox_invalid", "圈选区域必须是对象", [
      { path, code: "bbox_required", message: "请提供 x、y、width、height" }
    ]);
  }
  for (const key of BBOX_KEYS) {
    if (
      typeof bbox[key] !== "number" ||
      !Number.isFinite(bbox[key]) ||
      bbox[key] < 0 ||
      bbox[key] > 1
    ) {
      throw invalid("bbox_invalid", "圈选区域必须使用 0～1 坐标");
    }
  }
  if (bbox.width <= 0 || bbox.height <= 0 || bbox.x + bbox.width > 1 || bbox.y + bbox.height > 1) {
    throw invalid("bbox_invalid", "圈选区域超出图片边界");
  }
}

function provenanceDedupKey(actorId, body) {
  const provenance = body.provenance;
  if (provenance?.kind !== "video_context") return null;
  const bbox = provenance.selection_bbox;
  const normalizedBbox = bbox
    ? BBOX_KEYS.map((key) => Math.round(bbox[key] * 100) / 100)
    : [];
  return JSON.stringify([
    actorId,
    body.asset_type,
    provenance.provider,
    provenance.external_content_id,
    Math.floor((provenance.timestamp_ms || 0) / 500),
    normalizedBbox
  ]);
}

function seedAssets(now) {
  const createdAt = now.toISOString();
  const spaces = [
    {
      asset_id: "space-demo-desk",
      name: "我的默认书桌",
      is_default: true,
      width: 120
    },
    {
      asset_id: "space-demo-balcony",
      name: "阳台阅读角",
      is_default: false,
      width: 180,
      sceneType: "balcony_corner"
    }
  ].map((seed) => ({
    schema_version: "1.0",
    asset_id: seed.asset_id,
    asset_type: "space",
    lifecycle: "saved",
    parse_state: "ready",
    name: seed.name,
    tags: ["demo_seed"],
    is_default: seed.is_default,
    resource_version: 1,
    current_space_version_id: `${seed.asset_id}-v1`,
    expires_at: null,
    media_ids: [],
    provenance: { kind: "demo_seed" },
    attributes: {
      scene_type: seed.sceneType || "desk_corner",
      reference_width_cm: seed.width,
      default_budget_cny: 500,
      long_term_constraints: ["no_drilling"],
      scene_origin: "ai_example",
      read_only: true
    },
    dedup_key: null,
    last_used_at: createdAt,
    deleted_at: null,
    created_at: createdAt,
    updated_at: createdAt
  }));

  const inspirations = [
    ["inspiration-demo-warm", "原木暖光桌搭", "warm"],
    ["inspiration-demo-compact", "高效收纳桌搭", "compact"],
    ["inspiration-demo-green", "轻绿治愈桌搭", "green"]
  ].map(([assetId, name, styleKey]) => ({
    schema_version: "1.0",
    asset_id: assetId,
    asset_type: "inspiration",
    lifecycle: "saved",
    parse_state: "ready",
    name,
    tags: ["demo_seed", styleKey],
    is_default: false,
    resource_version: 1,
    current_space_version_id: null,
    expires_at: null,
    media_ids: [],
    provenance: {
      kind: "video_context",
      provider: "douyin_demo",
      external_content_id: `video-${styleKey}`,
      timestamp_ms: 3200
    },
    attributes: {
      inspiration_scope: "overall",
      style_key: styleKey,
      styles: [styleKey],
      colors: styleKey === "green" ? ["green", "warm_white"] : ["wood", "warm_white"],
      materials: ["wood", "fabric"],
      intent_analysis: {
        state: "ready",
        suggested_type: "style",
        summary: name,
        component_reference: null,
        style_reference: {
          style_keywords: [styleKey],
          colors: styleKey === "green" ? ["green", "warm_white"] : ["wood", "warm_white"],
          materials: ["wood", "fabric"]
        },
        candidates: [],
        source_mode: "demo",
        provider: "deterministic-demo",
        model: null
      },
      confirmed_intent: {
        intent_type: "style",
        summary: name,
        confirmed_by: "system_default",
        confirmed_at: createdAt
      }
    },
    dedup_key: `demo:${assetId}`,
    last_used_at: createdAt,
    deleted_at: null,
    created_at: createdAt,
    updated_at: createdAt
  }));

  const items = [
    ["item-demo-riser", "浅橡木桌上架", "desk_riser"],
    ["item-demo-lamp", "暖白夹式台灯", "lighting"],
    ["item-demo-board", "亚麻织物留言板", "display_board"],
    ["item-demo-cable-box", "隐藏式理线盒", "cable_management"],
    ["item-demo-trays", "奶油白收纳盘", "desktop_storage"]
  ].map(([assetId, name, category]) => ({
    schema_version: "1.0",
    asset_id: assetId,
    asset_type: "item",
    lifecycle: "saved",
    parse_state: "ready",
    name,
    tags: ["demo_seed", category],
    is_default: false,
    resource_version: 1,
    current_space_version_id: null,
    expires_at: null,
    media_ids: [],
    provenance: { kind: "demo_seed" },
    attributes: {
      category,
      user_role: "reference",
      identity_level: "category_only"
    },
    dedup_key: null,
    last_used_at: createdAt,
    deleted_at: null,
    created_at: createdAt,
    updated_at: createdAt
  }));

  const versions = spaces.map((asset) => ({
    schema_version: "1.0",
    space_version_id: asset.current_space_version_id,
    space_asset_id: asset.asset_id,
    parent_space_version_id: null,
    state: "sealed",
    resource_version: 1,
    parse_state: "ready",
    media_ids: [],
    reference_width_cm: asset.attributes.reference_width_cm,
    attributes: {
      scene_type: asset.attributes.scene_type,
      scene_origin: "ai_example",
      read_only: true,
      reference_width_cm: asset.attributes.reference_width_cm,
      editable_regions: [
        {
          editable_region_id: "desktop-and-back-wall",
          label: "桌面与后墙"
        }
      ],
      detected_objects: [
        {
          detected_object_id: `detected-${asset.asset_id}-desk`,
          category: "desk",
          display_name: "书桌",
          bbox: { x: 0.08, y: 0.48, width: 0.84, height: 0.42 },
          detection_confidence: 0.96,
          disposition: "keep",
          confirmation_state: "confirmed"
        },
        {
          detected_object_id: `detected-${asset.asset_id}-monitor`,
          category: "monitor",
          display_name: "显示器",
          bbox: { x: 0.31, y: 0.18, width: 0.28, height: 0.31 },
          detection_confidence: 0.94,
          disposition: "keep",
          confirmation_state: "confirmed"
        }
      ],
      uncertainties: [
        {
          code: "desk_depth_unknown",
          message: "桌面深度未知，购买前需要复测"
        }
      ]
    },
    sealed_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt
  }));
  return { assets: [...spaces, ...inspirations, ...items], versions };
}

export class MatchingService {
  reasons(asset, compatible) {
    const reasons = [];
    if (
      asset.asset_type === "space" &&
      asset.attributes?.scene_type === "desk_corner"
    ) {
      reasons.push("同为书桌场景");
    }
    if (asset.is_default) reasons.push("这是你的默认空间");
    if (asset.attributes?.long_term_constraints?.includes("no_drilling")) {
      reasons.push("不需要打孔");
    }
    if (compatible?.asset_type === "inspiration" && compatible.parse_state === "ready") {
      reasons.push("参考灵感已完成解析");
    }
    return reasons;
  }
}

export class AssetParseService {
  constructor({ repository, adapter, now = () => new Date() }) {
    this.repository = repository;
    this.adapter = adapter;
    this.now = now;
    this.scheduled = new Set();
    this.pending = new Set();
    this.stopping = false;
  }

  enqueue(actorId, asset, spaceVersion = null, retryOf = null) {
    const targetId = spaceVersion?.space_version_id || asset.asset_id;
    const active = this.repository
      .list("parseRuns", actorId)
      .find(
        (run) =>
          run.target_id === targetId &&
          ["queued", "running"].includes(run.status)
      );
    if (active) {
      throw conflict(
        "asset_parse_already_active",
        "该资产已有解析任务",
        { active_parse_run_id: active.parse_run_id }
      );
    }
    const now = this.now().toISOString();
    const run = {
      schema_version: "1.0",
      parse_run_id: `parse-run-${randomUUID()}`,
      asset_id: asset.asset_id,
      space_version_id: spaceVersion?.space_version_id || null,
      target_id: targetId,
      status: "queued",
      retry_of: retryOf,
      source_mode: null,
      provider_trace: null,
      error: null,
      created_at: now,
      updated_at: now
    };
    this.repository.save("parseRuns", actorId, run);
    this.schedule(actorId, run.parse_run_id);
    return clone(run);
  }

  schedule(actorId, parseRunId) {
    if (this.stopping || this.scheduled.has(parseRunId)) return;
    this.scheduled.add(parseRunId);
    const execution = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          if (!this.stopping) await this.process(actorId, parseRunId);
        } catch {
          // stop/close 竞态兜底：避免未处理的 promise rejection 污染进程。
        } finally {
          this.scheduled.delete(parseRunId);
          resolve();
        }
      });
    });
    this.pending.add(execution);
    execution.finally(() => this.pending.delete(execution));
  }

  recover(actorId) {
    for (const run of this.repository.list("parseRuns", actorId)) {
      if (["queued", "running"].includes(run.status)) {
        run.status = "queued";
        run.updated_at = this.now().toISOString();
        this.repository.save("parseRuns", actorId, run);
        this.schedule(actorId, run.parse_run_id);
      }
    }
  }

  async process(actorId, parseRunId) {
    const run = this.repository.get("parseRuns", actorId, parseRunId);
    if (!["queued", "running"].includes(run.status)) return;
    const asset = this.repository.get("assets", actorId, run.asset_id);
    const spaceVersion = run.space_version_id
      ? this.repository.get("spaceVersions", actorId, run.space_version_id)
      : null;
    run.status = "running";
    run.updated_at = this.now().toISOString();
    this.repository.save("parseRuns", actorId, run);
    asset.parse_state = "parsing";
    asset.updated_at = run.updated_at;
    this.repository.save("assets", actorId, asset);
    if (spaceVersion) {
      spaceVersion.parse_state = "parsing";
      spaceVersion.updated_at = run.updated_at;
      this.repository.save("spaceVersions", actorId, spaceVersion);
    }
    try {
      const result = await this.adapter.analyze({ asset, spaceVersion });
      const completedAt = this.now().toISOString();
      this.repository.transaction(() => {
        const latestAsset = this.repository.get("assets", actorId, asset.asset_id);
        latestAsset.parse_state = result.parse_state;
        latestAsset.attributes = {
          ...latestAsset.attributes,
          ...(asset.asset_type === "space" ? {} : result.attributes)
        };
        latestAsset.resource_version += 1;
        latestAsset.updated_at = completedAt;
        this.repository.save("assets", actorId, latestAsset);
        if (spaceVersion) {
          const latestVersion = this.repository.get(
            "spaceVersions",
            actorId,
            spaceVersion.space_version_id
          );
          latestVersion.parse_state = result.parse_state;
          latestVersion.attributes = result.attributes;
          latestVersion.resource_version += 1;
          latestVersion.updated_at = completedAt;
          this.repository.save("spaceVersions", actorId, latestVersion);
        }
        run.status = "succeeded";
        run.source_mode = result.source_mode;
        run.provider_trace = result.provider_trace;
        run.updated_at = completedAt;
        this.repository.save("parseRuns", actorId, run);
      });
    } catch (error) {
      const failedAt = this.now().toISOString();
      const latestAsset = this.repository.get("assets", actorId, asset.asset_id);
      latestAsset.parse_state = "failed";
      latestAsset.updated_at = failedAt;
      this.repository.save("assets", actorId, latestAsset);
      if (spaceVersion) {
        const latestVersion = this.repository.get(
          "spaceVersions",
          actorId,
          spaceVersion.space_version_id
        );
        latestVersion.parse_state = "failed";
        latestVersion.updated_at = failedAt;
        this.repository.save("spaceVersions", actorId, latestVersion);
      }
      run.status = "failed";
      run.error = {
        code: error.code || "asset_parse_failed",
        message: "资产解析失败，可保留原素材后重试"
      };
      run.updated_at = failedAt;
      this.repository.save("parseRuns", actorId, run);
    }
  }

  async stop() {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
  }
}

export class AssetService {
  constructor({
    repository,
    mediaService,
    parseService,
    matchingService = new MatchingService(),
    config,
    now = () => new Date()
  }) {
    this.repository = repository;
    this.mediaService = mediaService;
    this.parseService = parseService;
    this.matchingService = matchingService;
    this.config = config;
    this.now = now;
  }

  seed(actorId) {
    if (this.repository.list("assets", actorId, { includeDeleted: true }).length) return;
    const seeds = seedAssets(this.now());
    this.repository.transaction(() => {
      for (const asset of seeds.assets) this.repository.save("assets", actorId, asset);
      for (const version of seeds.versions) {
        this.repository.save("spaceVersions", actorId, version);
      }
    });
  }

  create(actorId, body) {
    assertNoOwnerId(body);
    rejectUnknownKeys(
      body,
      new Set([
        "schema_version",
        "asset_type",
        "lifecycle",
        "media_ids",
        "provenance",
        "attributes"
      ]),
      "asset_invalid"
    );
    if (body?.schema_version !== "1.0") {
      throw invalid("asset_invalid", "schema_version 必须是 1.0");
    }
    if (!ASSET_TYPES.has(body.asset_type)) {
      throw invalid("asset_invalid", "asset_type 必须是 space、inspiration 或 item");
    }
    if (!LIFECYCLES.has(body.lifecycle) || body.lifecycle === "archived") {
      throw invalid("asset_invalid", "创建资产时 lifecycle 必须是 temporary 或 saved");
    }
    if (!Array.isArray(body.media_ids) || new Set(body.media_ids).size !== body.media_ids.length) {
      throw invalid("asset_invalid", "media_ids 必须是唯一字符串数组");
    }
    if (
      body.asset_type === "space" &&
      body.media_ids.length < 1
    ) {
      throw invalid("asset_invalid", "空间资产至少需要一张媒体");
    }
    if (!body.provenance || typeof body.provenance !== "object") {
      throw invalid("asset_invalid", "provenance 必须是对象");
    }
    if (!["upload", "video_context"].includes(body.provenance.kind)) {
      throw invalid("asset_invalid", "provenance.kind 必须是 upload 或 video_context");
    }
    if (body.provenance.kind === "upload" && body.media_ids.length < 1) {
      throw invalid("asset_invalid", "upload 来源至少需要一张媒体");
    }
    rejectUnknownKeys(
      body.provenance,
      body.provenance.kind === "upload"
        ? new Set(["kind"])
        : new Set([
            "kind",
            "provider",
            "external_content_id",
            "author_display",
            "timestamp_ms",
            "selection_bbox"
          ]),
      "asset_invalid"
    );
    if (body.provenance.kind === "video_context") {
      if (
        typeof body.provenance.provider !== "string" ||
        !body.provenance.provider.trim() ||
        typeof body.provenance.external_content_id !== "string" ||
        !body.provenance.external_content_id.trim() ||
        !Number.isInteger(body.provenance.timestamp_ms) ||
        body.provenance.timestamp_ms < 0
      ) {
        throw invalid("asset_invalid", "视频来源缺少 provider、内容 ID 或有效时间点");
      }
    }
    if (
      body.attributes !== undefined &&
      (!body.attributes ||
        typeof body.attributes !== "object" ||
        Array.isArray(body.attributes))
    ) {
      throw invalid("asset_invalid", "attributes 必须是对象");
    }
    const attributeAllowlist =
      body.asset_type === "space"
        ? new Set([
            "name",
            "scene_type",
            "reference_width_cm",
            "default_budget_cny",
            "long_term_constraints"
          ])
        : body.asset_type === "inspiration"
          ? new Set(["name", "inspiration_scope", "user_note"])
          : new Set(["name", "user_role", "user_note"]);
    rejectUnknownKeys(body.attributes || {}, attributeAllowlist, "asset_invalid");
    const attributes = body.attributes || {};
    if (
      attributes.name !== undefined &&
      (typeof attributes.name !== "string" ||
        !attributes.name.trim() ||
        attributes.name.length > 100)
    ) {
      throw invalid("asset_invalid", "attributes.name 必须是 1～100 字符");
    }
    if (
      attributes.reference_width_cm !== undefined &&
      (!Number.isInteger(attributes.reference_width_cm) ||
        attributes.reference_width_cm < 40 ||
        attributes.reference_width_cm > 400)
    ) {
      throw invalid("asset_invalid", "reference_width_cm 必须是 40～400 整数");
    }
    if (
      attributes.scene_type !== undefined &&
      (typeof attributes.scene_type !== "string" ||
        !attributes.scene_type.trim() ||
        attributes.scene_type.length > 64)
    ) {
      throw invalid("asset_invalid", "scene_type 必须是 1～64 字符");
    }
    if (
      attributes.default_budget_cny !== undefined &&
      (!Number.isInteger(attributes.default_budget_cny) ||
        attributes.default_budget_cny < 1 ||
        attributes.default_budget_cny > 1_000_000)
    ) {
      throw invalid("asset_invalid", "default_budget_cny 必须是有效正整数");
    }
    if (
      attributes.long_term_constraints !== undefined &&
      (!uniqueStrings(attributes.long_term_constraints) ||
        attributes.long_term_constraints.length > 20)
    ) {
      throw invalid("asset_invalid", "long_term_constraints 必须是唯一字符串数组");
    }
    if (
      attributes.inspiration_scope !== undefined &&
      !["overall", "item", "color", "material"].includes(
        attributes.inspiration_scope
      )
    ) {
      throw invalid("asset_invalid", "inspiration_scope 不受支持");
    }
    if (
      attributes.user_role !== undefined &&
      !["owned", "wanted", "reference"].includes(attributes.user_role)
    ) {
      throw invalid("asset_invalid", "user_role 不受支持");
    }
    if (
      attributes.user_note !== undefined &&
      (typeof attributes.user_note !== "string" ||
        attributes.user_note.length > 500)
    ) {
      throw invalid("asset_invalid", "user_note 最多 500 字符");
    }
    if (
      body.provenance.selection_bbox !== undefined &&
      body.provenance.selection_bbox !== null
    ) {
      validateBbox(body.provenance.selection_bbox, "/provenance/selection_bbox");
    }
    for (const mediaId of body.media_ids) {
      const media = this.repository.get("media", actorId, mediaId);
      const expectedPurpose =
        body.asset_type === "space" ? "space_source" : "reference_source";
      if (media.purpose !== expectedPurpose) {
        throw invalid(
          "media_purpose_mismatch",
          `${mediaId} 不能用于 ${body.asset_type} 资产`
        );
      }
    }

    const dedupKey = provenanceDedupKey(actorId, body);
    if (dedupKey) {
      const existing = this.repository
        .list("assets", actorId)
        .find((asset) => asset.dedup_key === dedupKey);
      if (existing) {
        if (existing.lifecycle === "temporary" && body.lifecycle === "saved") {
          this.repository.transaction(() => {
            existing.lifecycle = "saved";
            existing.expires_at = null;
            existing.resource_version += 1;
            existing.updated_at = this.now().toISOString();
            this.repository.save("assets", actorId, existing);
            for (const mediaId of existing.media_ids) {
              const media = this.repository.get("media", actorId, mediaId);
              media.retention_expires_at = null;
              media.updated_at = existing.updated_at;
              this.repository.save("media", actorId, media);
            }
          });
        }
        return { status: 200, value: { ...this.summary(existing), deduplicated: true } };
      }
    }

    const createdAt = this.now();
    const expiresAt =
      body.lifecycle === "temporary"
        ? new Date(
            createdAt.getTime() +
              this.config.temporaryRetentionHours * 60 * 60 * 1000
          ).toISOString()
        : null;
    const assetId = `${body.asset_type}-${randomUUID()}`;
    const spaceVersionId =
      body.asset_type === "space" ? `space-version-${randomUUID()}` : null;
    const asset = {
      schema_version: "1.0",
      asset_id: assetId,
      asset_type: body.asset_type,
      lifecycle: body.lifecycle,
      parse_state: "queued",
      name:
        body.attributes?.name ||
        (body.asset_type === "space" ? "未命名空间" : "未命名资产"),
      tags: [],
      is_default: false,
      resource_version: 1,
      current_space_version_id: spaceVersionId,
      expires_at: expiresAt,
      media_ids: [...body.media_ids],
      provenance: clone(body.provenance),
      attributes: clone(body.attributes || {}),
      dedup_key: dedupKey,
      last_used_at: createdAt.toISOString(),
      deleted_at: null,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString()
    };
    const spaceVersion =
      body.asset_type === "space"
        ? {
            schema_version: "1.0",
            space_version_id: spaceVersionId,
            space_asset_id: assetId,
            parent_space_version_id: null,
            state: "draft",
            resource_version: 1,
            parse_state: "queued",
            media_ids: [...body.media_ids],
            reference_width_cm:
              body.attributes?.reference_width_cm ?? null,
            attributes: {},
            sealed_at: null,
            created_at: createdAt.toISOString(),
            updated_at: createdAt.toISOString()
          }
        : null;
    this.repository.transaction(() => {
      this.repository.save("assets", actorId, asset);
      if (spaceVersion) this.repository.save("spaceVersions", actorId, spaceVersion);
      this.repository.bindMedia(actorId, assetId, body.media_ids);
      if (body.lifecycle === "saved") {
        for (const mediaId of body.media_ids) {
          const media = this.repository.get("media", actorId, mediaId);
          media.retention_expires_at = null;
          media.updated_at = createdAt.toISOString();
          this.repository.save("media", actorId, media);
        }
      }
    });
    this.parseService.enqueue(actorId, asset, spaceVersion);
    return { status: 201, value: this.summary(asset) };
  }

  /**
   * Trusted server-side constructor for a component selected from a video frame.
   * Clients cannot write component identity fields through the generic asset API.
   */
  createSourceComponent(
    actorId,
    { mediaId, sourceContext, componentIdentity, selectedCandidate, lifecycle = "saved" }
  ) {
    const media = this.repository.get("media", actorId, mediaId);
    if (media.purpose !== "visual_search_query") {
      throw invalid(
        "media_purpose_mismatch",
        `${mediaId} 不是视频圈选组件的视觉查询图片`
      );
    }
    if (!sourceContext || typeof sourceContext !== "object") {
      throw invalid("source_context_invalid", "缺少视频来源上下文");
    }
    validateBbox(sourceContext.selection_bbox, "/source_context/selection_bbox");
    if (!["temporary", "saved"].includes(lifecycle)) {
      throw invalid("asset_lifecycle_invalid", "组件资产只能是 temporary 或 saved");
    }

    const createdAt = this.now();
    const assetId = `item-${randomUUID()}`;
    const sourceComponentId = `source-component-${randomUUID()}`;
    const categoryCode =
      componentIdentity?.category_code ||
      selectedCandidate?.category_code ||
      "unknown_component";
    const name =
      selectedCandidate?.name ||
      componentIdentity?.label ||
      "视频圈选组件";
    const asset = {
      schema_version: "1.0",
      asset_id: assetId,
      asset_type: "item",
      lifecycle,
      parse_state: "ready",
      name,
      tags: ["source_component", categoryCode],
      is_default: false,
      resource_version: 1,
      current_space_version_id: null,
      expires_at:
        lifecycle === "temporary"
          ? new Date(
              createdAt.getTime() +
                this.config.temporaryRetentionHours * 60 * 60 * 1000
            ).toISOString()
          : null,
      media_ids: [mediaId],
      provenance: {
        kind: "video_context",
        provider: sourceContext.provider,
        external_content_id: sourceContext.external_content_id,
        author_display: sourceContext.author_display || null,
        timestamp_ms: sourceContext.timestamp_ms,
        selection_bbox: clone(sourceContext.selection_bbox)
      },
      attributes: {
        user_role: "wanted",
        identity_level: "visual_component",
        source_component: {
          source_component_id: sourceComponentId,
          immutable_anchor: true,
          query_media_id: mediaId,
          category_code: categoryCode,
          label: componentIdentity?.label || name,
          colors: clone(componentIdentity?.colors || []),
          materials: clone(componentIdentity?.materials || []),
          shape_keywords: clone(componentIdentity?.shape_keywords || []),
          style_keywords: clone(componentIdentity?.style_keywords || []),
          search_queries: clone(componentIdentity?.search_queries || []),
          visual_confidence: componentIdentity?.confidence ?? null,
          selected_catalog_candidate: selectedCandidate
            ? {
                candidate_id: selectedCandidate.candidate_id,
                product_id: selectedCandidate.product_id || null,
                name: selectedCandidate.name,
                category_code: selectedCandidate.category_code,
                match_type: selectedCandidate.match_type || "visual_similar"
              }
            : null
        }
      },
      dedup_key: null,
      last_used_at: createdAt.toISOString(),
      deleted_at: null,
      created_at: createdAt.toISOString(),
      updated_at: createdAt.toISOString()
    };

    this.repository.transaction(() => {
      this.repository.save("assets", actorId, asset);
      this.repository.bindMedia(actorId, assetId, [mediaId]);
      if (lifecycle === "saved") {
        media.retention_expires_at = null;
        media.updated_at = createdAt.toISOString();
        this.repository.save("media", actorId, media);
      }
    });
    return {
      ...this.summary(asset),
      source_component: clone(asset.attributes.source_component)
    };
  }

  list(actorId, query = {}) {
    const supportedQuery = new Set([
      "asset_type",
      "lifecycle",
      "parse_state",
      "sort",
      "compatible_with_asset_id",
      "cursor",
      "limit"
    ]);
    const unknownQuery = Object.keys(query).find(
      (key) => !supportedQuery.has(key)
    );
    if (unknownQuery) throw invalid("query_invalid", `不支持查询参数 ${unknownQuery}`);
    if (query.sort && !["recent", "match"].includes(query.sort)) {
      throw invalid("query_invalid", "sort 必须是 recent 或 match");
    }
    const limit =
      query.limit === undefined
        ? 20
        : Math.min(Number(query.limit), this.config.listLimitMax);
    if (!Number.isInteger(limit) || limit < 1) {
      throw invalid("query_invalid", "limit 必须是正整数");
    }
    if (query.asset_type && !ASSET_TYPES.has(query.asset_type)) {
      throw invalid("query_invalid", "asset_type 不受支持");
    }
    if (query.lifecycle && !LIFECYCLES.has(query.lifecycle)) {
      throw invalid("query_invalid", "lifecycle 不受支持");
    }
    if (query.parse_state && !PARSE_STATES.has(query.parse_state)) {
      throw invalid("query_invalid", "parse_state 不受支持");
    }
    const compatible = query.compatible_with_asset_id
      ? this.repository.get("assets", actorId, query.compatible_with_asset_id)
      : null;
    let values = this.repository
      .list("assets", actorId)
      .filter((asset) => query.asset_type ? asset.asset_type === query.asset_type : true)
      .filter((asset) => query.lifecycle ? asset.lifecycle === query.lifecycle : asset.lifecycle !== "archived")
      .filter((asset) => query.parse_state ? asset.parse_state === query.parse_state : true);
    const withReasons = values.map((asset) => ({
      ...this.summary(asset),
      ...(compatible
        ? { match_reasons: this.matchingService.reasons(asset, compatible) }
        : {})
    }));
    if (query.sort === "match") {
      withReasons.sort(
        (a, b) =>
          (b.match_reasons?.length || 0) - (a.match_reasons?.length || 0) ||
          b.updated_at.localeCompare(a.updated_at)
      );
    }
    const offset = query.cursor
      ? Number(Buffer.from(query.cursor, "base64url").toString("utf8"))
      : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw invalid("cursor_invalid", "cursor 无效");
    }
    const page = withReasons.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      schema_version: "1.0",
      items: page,
      next_cursor:
        nextOffset < withReasons.length
          ? Buffer.from(String(nextOffset)).toString("base64url")
          : null,
      total: withReasons.length
    };
  }

  detail(actorId, assetId) {
    const asset = this.repository.get("assets", actorId, assetId);
    const currentVersion = asset.current_space_version_id
      ? this.repository.get(
          "spaceVersions",
          actorId,
          asset.current_space_version_id
        )
      : null;
    const media = asset.media_ids
      .map((mediaId) => this.repository.find("media", actorId, mediaId))
      .find(Boolean);
    const parseRuns = this.repository
      .list("parseRuns", actorId)
      .filter((run) => run.asset_id === assetId);
    const relatedPlanCount = this.repository
      .list("planAssets", actorId)
      .filter((plan) => plan.space_asset_id === assetId).length;
    return {
      ...this.summary(asset),
      provenance: clone(asset.provenance),
      attributes: currentVersion?.attributes || clone(asset.attributes),
      current_space_version: currentVersion
        ? {
            space_version_id: currentVersion.space_version_id,
            state: currentVersion.state,
            resource_version: currentVersion.resource_version,
            parse_state: currentVersion.parse_state
          }
        : null,
      preview: media ? this.mediaService.project(actorId, media).access : null,
      latest_parse_run: parseRuns[0] || null,
      related_plan_count: relatedPlanCount
    };
  }

  patch(actorId, assetId, body) {
    assertNoOwnerId(body);
    const asset = this.repository.get("assets", actorId, assetId);
    if (asset.attributes?.scene_origin === "ai_example") {
      throw conflict(
        "ai_example_scene_read_only",
        "AI 示例场景为只读，请复制后再编辑"
      );
    }
    requireVersion(asset.resource_version, body?.resource_version, this.summary(asset));
    const changes = body?.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw invalid("asset_patch_invalid", "changes 必须是对象");
    }
    const allowed = new Set(["name", "lifecycle", "is_default", "tags", "attributes"]);
    for (const key of Object.keys(changes)) {
      if (!allowed.has(key)) throw invalid("asset_patch_invalid", `不支持修改 ${key}`);
    }
    if (changes.name !== undefined && (typeof changes.name !== "string" || !changes.name.trim() || changes.name.length > 100)) {
      throw invalid("asset_patch_invalid", "name 必须是 1～100 字符");
    }
    if (changes.lifecycle !== undefined && !LIFECYCLES.has(changes.lifecycle)) {
      throw invalid("asset_patch_invalid", "lifecycle 不受支持");
    }
    if (changes.tags !== undefined && (!uniqueStrings(changes.tags) || changes.tags.length > 20)) {
      throw invalid("asset_patch_invalid", "tags 必须是最多 20 个唯一字符串");
    }
    const next = clone(asset);
    if (changes.name !== undefined) next.name = changes.name.trim();
    if (changes.lifecycle !== undefined) {
      next.lifecycle = changes.lifecycle;
      next.expires_at = changes.lifecycle === "temporary" ? next.expires_at : null;
    }
    if (changes.tags !== undefined) next.tags = [...changes.tags];
    if (changes.attributes !== undefined) {
      if (!changes.attributes || typeof changes.attributes !== "object" || Array.isArray(changes.attributes)) {
        throw invalid("asset_patch_invalid", "attributes 必须是对象");
      }
      const attributeAllowlist =
        asset.asset_type === "space"
          ? new Set(["default_budget_cny", "long_term_constraints"])
          : new Set(["user_note", "user_role"]);
      for (const key of Object.keys(changes.attributes)) {
        if (!attributeAllowlist.has(key)) {
          throw invalid("asset_patch_invalid", `不支持通过 Asset PATCH 修改 attributes.${key}`);
        }
      }
      if (
        changes.attributes.default_budget_cny !== undefined &&
        (!Number.isInteger(changes.attributes.default_budget_cny) ||
          changes.attributes.default_budget_cny < 1 ||
          changes.attributes.default_budget_cny > 1_000_000)
      ) {
        throw invalid("asset_patch_invalid", "default_budget_cny 必须是有效正整数");
      }
      if (
        changes.attributes.long_term_constraints !== undefined &&
        (!uniqueStrings(changes.attributes.long_term_constraints) ||
          changes.attributes.long_term_constraints.length > 20)
      ) {
        throw invalid("asset_patch_invalid", "long_term_constraints 必须是唯一字符串数组");
      }
      if (
        changes.attributes.user_note !== undefined &&
        (typeof changes.attributes.user_note !== "string" ||
          changes.attributes.user_note.length > 500)
      ) {
        throw invalid("asset_patch_invalid", "user_note 最多 500 字符");
      }
      if (
        changes.attributes.user_role !== undefined &&
        !["owned", "wanted", "reference"].includes(
          changes.attributes.user_role
        )
      ) {
        throw invalid("asset_patch_invalid", "user_role 不受支持");
      }
      next.attributes = { ...next.attributes, ...clone(changes.attributes) };
    }
    if (changes.is_default !== undefined) {
      if (typeof changes.is_default !== "boolean") {
        throw invalid("asset_patch_invalid", "is_default 必须是布尔值");
      }
      if (changes.is_default && (asset.asset_type !== "space" || next.lifecycle !== "saved")) {
        throw invalid("default_space_invalid", "默认空间必须是 saved space");
      }
      next.is_default = changes.is_default;
    }
    next.resource_version += 1;
    next.updated_at = this.now().toISOString();
    this.repository.transaction(() => {
      if (next.is_default) {
        for (const other of this.repository.list("assets", actorId)) {
          if (
            other.asset_id !== assetId &&
            other.asset_type === "space" &&
            other.is_default
          ) {
            other.is_default = false;
            other.resource_version += 1;
            other.updated_at = next.updated_at;
            this.repository.save("assets", actorId, other);
          }
        }
      }
      this.repository.save("assets", actorId, next);
      if (next.lifecycle === "saved") {
        for (const mediaId of next.media_ids) {
          const media = this.repository.get("media", actorId, mediaId);
          media.retention_expires_at = null;
          media.updated_at = next.updated_at;
          this.repository.save("media", actorId, media);
        }
      }
    });
    return this.summary(next);
  }

  confirmIntent(actorId, assetId, body) {
    assertNoOwnerId(body);
    const asset = this.repository.get("assets", actorId, assetId);
    if (asset.asset_type !== "inspiration") {
      throw invalid("intent_confirmation_invalid", "只有 inspiration 资产支持意图确认");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw invalid("intent_confirmation_invalid", "请求体必须是对象");
    }
    if (body.schema_version !== "1.0") {
      throw invalid("intent_confirmation_invalid", "schema_version 必须是 1.0");
    }
    rejectUnknownKeys(
      body,
      new Set(["schema_version", "resource_version", "intent_type", "summary"]),
      "intent_confirmation_invalid"
    );
    requireVersion(asset.resource_version, body.resource_version, this.summary(asset));
    if (!["component", "style"].includes(body.intent_type)) {
      throw invalid("intent_confirmation_invalid", "intent_type 必须是 component 或 style");
    }
    if (
      typeof body.summary !== "string" ||
      !body.summary.trim() ||
      body.summary.length > 200
    ) {
      throw invalid("intent_confirmation_invalid", "summary 必须是 1～200 字符");
    }
    const analysis = asset.attributes?.intent_analysis;
    if (!analysis || analysis.state === "failed") {
      throw conflict(
        "intent_confirmation_unavailable",
        "该资产尚未完成意图分析或分析已失败"
      );
    }
    // 组件/风格与 analysis 的引用不一致时仍允许纠正，但确认后 confirmed_intent 是唯一权威
    const now = this.now().toISOString();
    const next = clone(asset);
    next.attributes = clone(asset.attributes || {});
    next.attributes.confirmed_intent = {
      intent_type: body.intent_type,
      summary: body.summary.trim(),
      confirmed_by: "user",
      confirmed_at: now
    };
    // 用户确认后 parse_state 必然是 ready
    next.parse_state = "ready";
    next.resource_version += 1;
    next.updated_at = now;
    this.repository.save("assets", actorId, next);
    return this.summary(next);
  }

  retryParse(actorId, assetId, body) {
    assertNoOwnerId(body);
    rejectUnknownKeys(
      body,
      new Set(["schema_version", "reason", "space_version_id"]),
      "parse_retry_invalid"
    );
    const asset = this.repository.get("assets", actorId, assetId);
    if (body?.reason !== "user_retry") {
      throw invalid("parse_retry_invalid", "reason 必须是 user_retry");
    }
    let target = null;
    if (asset.asset_type === "space") {
      if (!body.space_version_id) {
        throw invalid("parse_retry_invalid", "空间资产必须提供 space_version_id");
      }
      target = this.repository.get(
        "spaceVersions",
        actorId,
        body.space_version_id
      );
      if (
        target.space_asset_id !== assetId ||
        target.state !== "draft" ||
        target.parse_state !== "failed"
      ) {
        throw conflict("asset_parse_not_retryable", "该空间版本当前不可重试");
      }
    } else if (asset.parse_state !== "failed") {
      throw conflict("asset_parse_not_retryable", "只有 failed 资产可以重试");
    }
    const previous = this.repository
      .list("parseRuns", actorId)
      .find((run) => run.target_id === (target?.space_version_id || assetId));
    return this.parseService.enqueue(
      actorId,
      asset,
      target,
      previous?.parse_run_id || null
    );
  }

  createSpaceVersion(actorId, assetId, body) {
    assertNoOwnerId(body);
    rejectUnknownKeys(
      body,
      new Set([
        "schema_version",
        "parent_space_version_id",
        "media_ids",
        "reference_width_cm"
      ]),
      "space_version_invalid"
    );
    const asset = this.repository.get("assets", actorId, assetId);
    if (asset.asset_type !== "space") throw invalid("asset_type_invalid", "仅空间资产支持版本");
    if (!Array.isArray(body?.media_ids) || body.media_ids.length < 1) {
      throw invalid("space_version_invalid", "media_ids 至少包含一张图片");
    }
    for (const mediaId of body.media_ids) {
      const media = this.repository.get("media", actorId, mediaId);
      if (media.purpose !== "space_source") {
        throw invalid("media_purpose_mismatch", `${mediaId} 不能用于空间版本`);
      }
    }
    let parent = null;
    if (body.parent_space_version_id) {
      parent = this.repository.get(
        "spaceVersions",
        actorId,
        body.parent_space_version_id
      );
      if (parent.space_asset_id !== assetId) {
        throw invalid("space_version_invalid", "父版本不属于该空间");
      }
    }
    const now = this.now().toISOString();
    const version = {
      schema_version: "1.0",
      space_version_id: `space-version-${randomUUID()}`,
      space_asset_id: assetId,
      parent_space_version_id: parent?.space_version_id || null,
      state: "draft",
      resource_version: 1,
      parse_state: "queued",
      media_ids: [...body.media_ids],
      reference_width_cm:
        body.reference_width_cm ?? parent?.reference_width_cm ?? null,
      attributes: parent ? clone(parent.attributes) : {},
      sealed_at: null,
      created_at: now,
      updated_at: now
    };
    this.repository.transaction(() => {
      this.repository.save("spaceVersions", actorId, version);
      asset.current_space_version_id = version.space_version_id;
      asset.media_ids = [...body.media_ids];
      asset.parse_state = "queued";
      asset.resource_version += 1;
      asset.updated_at = now;
      this.repository.save("assets", actorId, asset);
      this.repository.bindMedia(actorId, assetId, body.media_ids);
    });
    this.parseService.enqueue(actorId, asset, version);
    return clone(version);
  }

  patchSpaceVersion(actorId, assetId, versionId, body) {
    assertNoOwnerId(body);
    const asset = this.repository.get("assets", actorId, assetId);
    const version = this.repository.get("spaceVersions", actorId, versionId);
    if (asset.asset_type !== "space" || version.space_asset_id !== assetId) {
      throw new ApiError("resource_not_found", "空间版本不存在", 404);
    }
    if (version.state !== "draft") {
      throw conflict("space_version_immutable", "sealed 空间版本不可修改");
    }
    requireVersion(version.resource_version, body?.resource_version, {
      space_version_id: versionId,
      resource_version: version.resource_version,
      state: version.state
    });
    const changes = body?.changes;
    if (!changes || typeof changes !== "object") {
      throw invalid("space_version_invalid", "changes 必须是对象");
    }
    rejectUnknownKeys(
      changes,
      new Set([
        "reference_width_cm",
        "editable_region_id",
        "detected_object_confirmations",
        "seal"
      ]),
      "space_version_invalid"
    );
    if (changes.reference_width_cm !== undefined) {
      if (
        !Number.isInteger(changes.reference_width_cm) ||
        changes.reference_width_cm < 40 ||
        changes.reference_width_cm > 400
      ) {
        throw invalid("space_version_invalid", "reference_width_cm 必须是 40～400 整数");
      }
      version.reference_width_cm = changes.reference_width_cm;
      version.attributes.reference_width_cm = changes.reference_width_cm;
    }
    if (changes.editable_region_id !== undefined) {
      const known = version.attributes.editable_regions?.some(
        (region) => region.editable_region_id === changes.editable_region_id
      );
      if (!known) throw invalid("editable_region_invalid", "可编辑区不属于该空间版本");
      version.attributes.selected_editable_region_id = changes.editable_region_id;
    }
    if (changes.detected_object_confirmations !== undefined) {
      if (!Array.isArray(changes.detected_object_confirmations)) {
        throw invalid("detected_object_confirmations_invalid", "确认项必须是数组");
      }
      const objects = new Map(
        (version.attributes.detected_objects || []).map((item) => [
          item.detected_object_id,
          item
        ])
      );
      for (const confirmation of changes.detected_object_confirmations) {
        const object = objects.get(confirmation.detected_object_id);
        if (!object || !DISPOSITIONS.has(confirmation.disposition)) {
          throw invalid("detected_object_confirmation_invalid", "检测物或处置方式无效");
        }
        object.disposition = confirmation.disposition;
        object.confirmation_state = "confirmed";
      }
      version.attributes.detected_objects = [...objects.values()];
    }
    if (changes.seal === true) {
      if (!["needs_confirmation", "ready"].includes(version.parse_state)) {
        throw conflict(
          "space_version_not_confirmable",
          "当前解析状态不能封存"
        );
      }
      const issues = [];
      if (!version.media_ids.length) {
        issues.push({ path: "/media_ids", code: "media_required", message: "至少需要一张可访问图片" });
      }
      if (!version.attributes.scene_type) {
        issues.push({ path: "/attributes/scene_type", code: "scene_type_required", message: "缺少空间类型" });
      }
      if (!version.attributes.editable_regions?.length) {
        issues.push({ path: "/attributes/editable_regions", code: "editable_region_required", message: "至少需要一个可编辑区" });
      }
      if (issues.length) {
        throw invalid("space_version_incomplete", "空间版本仍有阻断项", issues);
      }
      version.state = "sealed";
      version.parse_state = "ready";
      version.sealed_at = this.now().toISOString();
      asset.parse_state = "ready";
    }
    version.resource_version += 1;
    version.updated_at = this.now().toISOString();
    this.repository.transaction(() => {
      this.repository.save("spaceVersions", actorId, version);
      if (asset.current_space_version_id === versionId) {
        asset.resource_version += 1;
        asset.updated_at = version.updated_at;
        this.repository.save("assets", actorId, asset);
      }
    });
    return clone(version);
  }

  listSpaceVersions(actorId, assetId) {
    const asset = this.repository.get("assets", actorId, assetId);
    if (asset.asset_type !== "space") throw invalid("asset_type_invalid", "仅空间资产支持版本");
    const planVersions = this.repository.list("planVersions", actorId);
    return {
      schema_version: "1.0",
      items: this.repository
        .list("spaceVersions", actorId)
        .filter((version) => version.space_asset_id === assetId)
        .map((version) => ({
          space_version_id: version.space_version_id,
          parent_space_version_id: version.parent_space_version_id,
          state: version.state,
          parse_state: version.parse_state,
          resource_version: version.resource_version,
          reference_width_cm: version.reference_width_cm,
          related_plan_count: planVersions.filter(
            (plan) =>
              plan.design_request_snapshot?.space_version_id ===
              version.space_version_id
          ).length,
          created_at: version.created_at,
          updated_at: version.updated_at
        }))
    };
  }

  delete(actorId, assetId) {
    const asset = this.repository.find("assets", actorId, assetId, {
      includeDeleted: true
    });
    if (!asset) throw new ApiError("resource_not_found", "资产不存在", 404);
    if (asset.attributes?.scene_origin === "ai_example") {
      throw conflict(
        "ai_example_scene_read_only",
        "AI 示例场景为只读，不能删除"
      );
    }
    if (asset.deleted_at && !asset.deletion_pending) return;
    const deletedAt = this.now().toISOString();
    asset.deleted_at = deletedAt;
    asset.deletion_pending = true;
    asset.is_default = false;
    asset.updated_at = deletedAt;
    this.repository.save("assets", actorId, asset);
    try {
      const mediaIds = this.repository.transaction(() =>
        this.repository.unbindAssetMedia(actorId, assetId)
      );
      for (const mediaId of mediaIds) {
        this.mediaService.deleteIfUnreferenced(actorId, mediaId);
      }
      asset.deletion_pending = false;
      asset.updated_at = this.now().toISOString();
      this.repository.save("assets", actorId, asset);
      this.repository.saveAudit(actorId, {
        audit_id: `audit-${randomUUID()}`,
        action: "asset_delete",
        entity_type: "asset",
        entity_id: assetId,
        outcome: "completed",
        created_at: asset.updated_at
      });
    } catch {
      this.repository.saveAudit(actorId, {
        audit_id: `audit-${randomUUID()}`,
        action: "asset_delete",
        entity_type: "asset",
        entity_id: assetId,
        outcome: "deletion_pending",
        created_at: this.now().toISOString()
      });
      throw new ApiError(
        "asset_deletion_incomplete",
        "资产访问已撤销，但部分私有文件清理未完成",
        500
      );
    }
  }

  cleanupExpired(actorId) {
    const nowMs = this.now().getTime();
    for (const asset of this.repository.list("assets", actorId)) {
      if (
        asset.lifecycle === "temporary" &&
        asset.expires_at &&
        Date.parse(asset.expires_at) <= nowMs
      ) {
        this.delete(actorId, asset.asset_id);
      }
    }
  }

  summary(asset) {
    return {
      schema_version: "1.0",
      asset_id: asset.asset_id,
      asset_type: asset.asset_type,
      lifecycle: asset.lifecycle,
      parse_state: asset.parse_state,
      name: asset.name,
      tags: [...asset.tags],
      is_default: asset.is_default,
      resource_version: asset.resource_version,
      current_space_version_id: asset.current_space_version_id,
      expires_at: asset.expires_at,
      created_at: asset.created_at,
      updated_at: asset.updated_at
    };
  }
}
