import { randomUUID } from "node:crypto";
import { ApiError, assertNoOwnerId, conflict, invalid } from "../errors.js";

const CONTRACT_VERSION = "renewal-card/2.1";

const clone = (value) => structuredClone(value);
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

/**
 * PublicationService — 保存 ≠ 发布。
 * 独立不可变 Publication 对象；异步进入 local index，允许重试且不影响私人方案。
 */
export class PublicationService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository;
    this.now = now;
    this.pending = new Set();
    this.stopping = false;
    this.testFailNextIndexOnce = false;
  }

  create(actorId, planAssetId, planVersionId, body) {
    assertNoOwnerId(body);
    if (!body || body.schema_version !== "1.0") {
      throw invalid("publication_invalid", "schema_version 必须是 1.0");
    }
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 100) {
      throw invalid("publication_invalid", "title 必须是 1～100 字符");
    }
    if (body.cover_source !== "plan_render") {
      throw invalid("publication_invalid", "cover_source 只支持 plan_render");
    }
    if (body.source_attribution_acknowledged !== true) {
      throw invalid(
        "publication_invalid",
        "必须显式确认来源标注（source_attribution_acknowledged=true）"
      );
    }
    const plan = this.repository.get("planAssets", actorId, planAssetId);
    if (plan.lifecycle !== "saved") {
      throw conflict(
        "publication_requires_saved_plan",
        "请先将方案 lifecycle 设为 saved 再发布"
      );
    }
    const planVersion = this.repository.get("planVersions", actorId, planVersionId);
    if (planVersion.plan_asset_id !== planAssetId) {
      throw new ApiError("resource_not_found", "方案版本不属于该方案", 404);
    }
    // 检查现存 Publication：允许一个 actor 对同一 planVersion 有 0 或 1 个未撤下 Publication
    const existing = this.repository
      .list("publications", actorId)
      .filter(
        (pub) =>
          pub.plan_asset_id === planAssetId &&
          pub.plan_version_id === planVersionId &&
          pub.status !== "withdrawn"
      );
    if (existing.length > 0) {
      throw conflict(
        "publication_already_exists",
        "该方案版本已有一个未撤下的 Publication",
        { publication_id: existing[0].publication_id }
      );
    }
    const now = this.now().toISOString();
    const sceneType =
      planVersion.design_request_snapshot?.space_snapshot?.attributes?.scene_type ||
      planVersion.design_request_snapshot?.space_snapshot?.space_version?.attributes?.scene_type ||
      "desk_corner";
    const inspirationSnapshot = planVersion.design_request_snapshot?.reference_snapshots?.find(
      (item) => item.asset_type === "inspiration"
    );
    const intentType = inspirationSnapshot?.confirmed_intent?.intent_type || "style";
    // 从 confirmed_intent 派生检索关键字，用于 RelatedDesign local index
    const styleKeywords =
      intentType === "style"
        ? inspirationSnapshot?.attributes?.intent_analysis?.style_reference?.style_keywords || []
        : [];
    const componentCategory =
      intentType === "component"
        ? inspirationSnapshot?.attributes?.intent_analysis?.component_reference?.category_code
        : null;
    const publication = {
      schema_version: "1.0",
      contract_version: CONTRACT_VERSION,
      publication_id: `publication-${randomUUID()}`,
      plan_asset_id: planAssetId,
      plan_version_id: planVersionId,
      status: "indexing",
      visibility: "public",
      title: body.title.trim(),
      published_snapshot: {
        scene_type: sceneType,
        intent_type: intentType,
        source_attribution: "基于用户主动发布的一角焕新 AI 效果示意",
        style_keywords: styleKeywords,
        component_categories: componentCategory ? [componentCategory] : []
      },
      // 私人渲染引用不复制到公开索引；LocalPublicationIndexProvider 只读 cover_access_url
      cover_access_url: null,
      error: null,
      withdrawn_at: null,
      created_at: now,
      updated_at: now
    };
    this.repository.save("publications", actorId, publication);
    this.scheduleIndex(actorId, publication.publication_id);
    return this.summary(publication);
  }

  get(actorId, publicationId) {
    const publication = this.repository.get("publications", actorId, publicationId);
    return this.summary(publication);
  }

  withdraw(actorId, publicationId) {
    const publication = this.repository.get("publications", actorId, publicationId);
    if (publication.status === "withdrawn") return;
    publication.status = "withdrawn";
    publication.withdrawn_at = this.now().toISOString();
    publication.updated_at = publication.withdrawn_at;
    this.repository.save("publications", actorId, publication);
  }

  summary(publication) {
    return {
      schema_version: "1.0",
      contract_version: CONTRACT_VERSION,
      publication_id: publication.publication_id,
      plan_asset_id: publication.plan_asset_id,
      plan_version_id: publication.plan_version_id,
      status: publication.status,
      visibility: publication.visibility,
      title: publication.title,
      published_snapshot: clone(publication.published_snapshot),
      error: publication.error ? clone(publication.error) : null,
      withdrawn_at: publication.withdrawn_at || null,
      created_at: publication.created_at,
      updated_at: publication.updated_at
    };
  }

  scheduleIndex(actorId, publicationId) {
    if (this.stopping) return;
    const execution = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          if (!this.stopping) await this.processIndex(actorId, publicationId);
        } catch {
          // stop/close 竞态兜底：避免未处理的 promise rejection 污染进程。
        } finally {
          resolve();
        }
      });
    });
    this.pending.add(execution);
    execution.finally(() => this.pending.delete(execution));
  }

  async processIndex(actorId, publicationId) {
    let publication;
    try {
      publication = this.repository.get("publications", actorId, publicationId);
    } catch {
      return;
    }
    if (publication.status !== "indexing") return;
    await nextTurn();
    // 本地 SQLite 就是索引本身；此步骤是显式 "index_ready"
    if (this.testFailNextIndexOnce) {
      this.testFailNextIndexOnce = false;
      publication.status = "index_failed";
      publication.error = { code: "index_failed", message: "本地索引写入失败（模拟）" };
      publication.updated_at = this.now().toISOString();
      this.repository.save("publications", actorId, publication);
      return;
    }
    publication.status = "published";
    publication.updated_at = this.now().toISOString();
    this.repository.save("publications", actorId, publication);
  }

  retryIndex(actorId, publicationId) {
    const publication = this.repository.get("publications", actorId, publicationId);
    if (publication.status !== "index_failed") {
      throw conflict("publication_retry_invalid", "仅 index_failed 的 Publication 可以重试");
    }
    publication.status = "indexing";
    publication.error = null;
    publication.updated_at = this.now().toISOString();
    this.repository.save("publications", actorId, publication);
    this.scheduleIndex(actorId, publicationId);
    return this.summary(publication);
  }

  recover(actorId) {
    for (const publication of this.repository.list("publications", actorId)) {
      if (publication.status === "indexing") {
        this.scheduleIndex(actorId, publication.publication_id);
      }
    }
  }

  async stop() {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
  }
}
