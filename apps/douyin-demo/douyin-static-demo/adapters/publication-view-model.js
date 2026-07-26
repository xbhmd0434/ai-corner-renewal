/**
 * Publication ViewModel Adapter (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 6.4 节 Publication。
 *
 * 协议要求：
 * - 发布前必须先用现有 Plan PATCH 把 lifecycle 改为 saved
 * - status ∈ indexing | published | index_failed | withdrawn
 * - index_failed 不改变私人方案已保存事实；允许重试索引，禁止重复创建公开帖子
 * - publication_already_exists 时打开已有发布，不重复发帖
 * - 未主动发布的 PlanAsset/PlanVersion 不得进入 Related Design 公共索引
 */

const STATUS_VALUES = new Set([
  "indexing",
  "published",
  "index_failed",
  "withdrawn"
]);
const VISIBILITY_VALUES = new Set(["public", "private"]);

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * 把后端 Publication 转成前端 ViewModel。
 *
 * @param {object} publication - 后端 Publication
 * @returns {object} - PublicationViewModel
 */
export function adaptPublication(publication) {
  if (!publication || typeof publication !== "object") {
    return null;
  }

  const status = STATUS_VALUES.has(publication.status)
    ? publication.status
    : "indexing";
  const visibility = VISIBILITY_VALUES.has(publication.visibility)
    ? publication.visibility
    : "public";

  const snapshot = publication.published_snapshot || {};

  return {
    publicationId: text(publication.publication_id),
    planAssetId: text(publication.plan_asset_id),
    planVersionId: text(publication.plan_version_id),
    status,
    visibility,
    title: text(publication.title),
    statusLabel: STATUS_LABELS[status] || status,
    isIndexing: status === "indexing",
    isPublished: status === "published",
    isIndexFailed: status === "index_failed",
    isWithdrawn: status === "withdrawn",
    canRetryIndex: status === "index_failed",
    canWithdraw: status === "published" || status === "indexing",
    publishedSnapshot: {
      sceneType: text(snapshot.scene_type),
      intentType: text(snapshot.intent_type),
      sourceAttribution: text(snapshot.source_attribution)
    },
    createdAt: text(publication.created_at),
    updatedAt: text(publication.updated_at)
  };
}

const STATUS_LABELS = {
  indexing: "索引中",
  published: "已发布",
  index_failed: "索引失败",
  withdrawn: "已撤下"
};

/**
 * 构造未发布 ViewModel，用于 publication slice 初始状态。
 *
 * @returns {object}
 */
export function createNotStartedPublicationViewModel() {
  return {
    publicationId: null,
    planAssetId: null,
    planVersionId: null,
    status: "not_started",
    visibility: "private",
    title: "",
    statusLabel: "未发布",
    isIndexing: false,
    isPublished: false,
    isIndexFailed: false,
    isWithdrawn: false,
    canRetryIndex: false,
    canWithdraw: false,
    publishedSnapshot: {
      sceneType: null,
      intentType: null,
      sourceAttribution: null
    },
    createdAt: null,
    updatedAt: null
  };
}
