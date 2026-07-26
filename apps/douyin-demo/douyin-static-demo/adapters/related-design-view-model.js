/**
 * Related Design ViewModel Adapter (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 6.3 节 RelatedDesignRun。
 *
 * 协议要求：
 * - result_state ∈ ready | partial | empty
 * - 正常项必须同时有 inspiration 关系和 scene 关系
 * - 单路降级时 fallback_dimension=inspiration|scene 且必须提供真实理由
 * - empty 是成功结果，不得使用通用“网络错误”文案
 * - 只显示后端返回的 reason_labels，不在前端重新推断
 * - 通过 open_action 打开抖音内容或内部 Publication；open_action=unavailable 不拼 URL
 */

const RESULT_STATES = new Set(["ready", "partial", "empty"]);
const SOURCE_TYPES = new Set(["douyin", "user_publication"]);
const OPEN_ACTION_TYPES = new Set([
  "douyin_deeplink",
  "internal_publication",
  "unavailable"
]);

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
    .slice(0, 16);
}

function adaptRelation(relation = {}) {
  return {
    strength: text(relation.strength, "weak"),
    reasonCode: text(relation.reason_code)
  };
}

function adaptOpenAction(action = {}) {
  const type = OPEN_ACTION_TYPES.has(action.type) ? action.type : "unavailable";
  return {
    type,
    url: text(action.url) || null,
    internalPublicationId: text(action.internal_publication_id) || null
  };
}

function adaptRelatedItem(item = {}) {
  const sourceType = SOURCE_TYPES.has(item.source_type)
    ? item.source_type
    : null;
  const cover = item.cover || null;
  return {
    contentId: text(item.content_id),
    sourceType,
    sourceLabel:
      sourceType === "douyin"
        ? "抖音内容"
        : sourceType === "user_publication"
          ? "用户发布"
          : "来源未标注",
    title: text(item.title, "相关设计"),
    cover: cover
      ? {
          mediaId: text(cover.media_id),
          accessUrl: text(cover.access_url)
        }
      : null,
    author: {
      displayName: text(item.author?.display_name)
    },
    relations: {
      inspiration: adaptRelation(item.relations?.inspiration || {}),
      scene: adaptRelation(item.relations?.scene || {})
    },
    reasonLabels: asStringArray(item.reason_labels),
    fallbackDimension: text(item.fallback_dimension) || null,
    openAction: adaptOpenAction(item.open_action || {})
  };
}

/**
 * 把后端 RelatedDesignRun 转成前端 ViewModel。
 *
 * @param {object} run - 后端 RelatedDesignRun
 * @returns {object} - RelatedDesignViewModel
 */
export function adaptRelatedDesignRun(run) {
  if (!run || typeof run !== "object") {
    throw new TypeError("RelatedDesignRun is required");
  }

  const result = run.result || {};
  const items = Array.isArray(result.items)
    ? result.items.map(adaptRelatedItem)
    : [];
  const resultState = RESULT_STATES.has(run.result_state)
    ? run.result_state
    : null;

  return {
    runId: text(run.related_design_run_id),
    designRequestId: text(run.design_request_id),
    contextFingerprint: text(run.context_fingerprint),
    status: text(run.status), // succeeded | failed | cancelled | ...
    stage: text(run.stage) || null,
    progress: Math.max(0, Math.min(100, Number(run.progress) || 0)),
    resultState,
    sourceMode: text(run.source_mode, "demo"),
    retryable: Boolean(run.retryable),
    items,
    notices: Array.isArray(result.notices)
      ? result.notices.map((notice) => ({
          code: text(notice.code),
          level: text(notice.level, "info"),
          message: text(notice.message)
        }))
      : [],
    provenance: {
      douyinContent: text(result.provenance?.douyin_content),
      userPublications: text(result.provenance?.user_publications)
    },
    error: run.error
      ? {
          code: text(run.error.code),
          message: text(run.error.message)
        }
      : null,
    createdAt: text(run.created_at),
    updatedAt: text(run.updated_at)
  };
}

/**
 * 构造空 ViewModel，用于 capability 不可用 / 离线 Demo。
 * 协议第 8 节：related_designs=false 时隐藏或显示“演示数据”入口，不请求不存在路由。
 *
 * @param {string} reason
 * @returns {object}
 */
export function createUnavailableRelatedDesignViewModel(reason) {
  return {
    runId: null,
    designRequestId: null,
    contextFingerprint: null,
    status: "unavailable",
    stage: null,
    progress: 0,
    resultState: null,
    sourceMode: "demo",
    retryable: false,
    items: [],
    notices: [],
    provenance: { douyinContent: null, userPublications: null },
    error: null,
    createdAt: null,
    updatedAt: null,
    description: text(reason, "相关设计服务尚未开放。")
  };
}
