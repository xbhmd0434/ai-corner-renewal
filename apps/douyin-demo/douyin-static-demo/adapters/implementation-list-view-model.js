/**
 * Implementation List ViewModel Adapter (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 6.5 节 ProductDiscoveryRun 的实施清单扩展。
 *
 * 协议要求：
 * - 现有 result.subjects 保持兼容，V2.1 增加 result.implementation_list
 * - origin_type ∈ video_selected | source_video | ai_supplement
 * - disposition ∈ existing | add | optional
 * - sort_group ∈ 0 | 1 | 2（同组由后端返回 sort_index）
 * - 商品去重键、数量合并和排序由后端完成
 * - 前端只维护本次面板的勾选状态，不重排来源
 *
 * 协议第 1 节：组件意图的来源圈选组件固定属于排序组 0；
 * 风格意图的原视频商品属于组 0；AI 补充商品属于组 1；可选替代属于组 2。
 */

const ORIGIN_TYPES = new Set(["video_selected", "source_video", "ai_supplement"]);
const DISPOSITIONS = new Set(["existing", "add", "optional"]);
const SORT_GROUPS = new Set([0, 1, 2]);

const ORIGIN_LABELS = {
  video_selected: "视频圈选",
  source_video: "原视频商品",
  ai_supplement: "AI 方案补充"
};

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

function adaptAlternativeMatches(ids) {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => text(id))
    .filter(Boolean)
    .slice(0, 8);
}

function adaptImplementationItem(item = {}) {
  const sortGroup = Number.isFinite(item.sort_group)
    ? item.sort_group
    : null;
  return {
    listItemId: text(item.list_item_id),
    subjectId: text(item.subject_id),
    displayName: text(item.display_name, "未命名项目"),
    originType: ORIGIN_TYPES.has(item.origin_type)
      ? item.origin_type
      : null,
    originLabel: item.origin_type
      ? ORIGIN_LABELS[item.origin_type] || text(item.origin_label)
      : text(item.origin_label, "来源未标注"),
    sortGroup: SORT_GROUPS.has(sortGroup) ? sortGroup : null,
    sortIndex: Number.isFinite(item.sort_index) ? item.sort_index : 0,
    disposition: DISPOSITIONS.has(item.disposition)
      ? item.disposition
      : "add",
    quantity: Math.max(1, Number(item.quantity) || 1),
    selectedMatchId: text(item.selected_match_id) || null,
    alternativeMatchIds: adaptAlternativeMatches(item.alternative_match_ids)
  };
}

/**
 * 把后端 ProductDiscoveryRun.result.implementation_list 转成前端 ViewModel。
 *
 * 协议明确：前端不重排来源，按后端 sort_group + sort_index 展示。
 * 但为了 UI 渲染稳定，本 Adapter 会按 (sort_group, sort_index) 升序复制一份，
 * 不改变后端返回的顺序语义。
 *
 * @param {object} run - 后端 ProductDiscoveryRun
 * @returns {object} - ImplementationListViewModel
 */
export function adaptImplementationList(run) {
  if (!run || typeof run !== "object") {
    return createEmptyImplementationList();
  }

  const result = run.result || {};
  const rawList = Array.isArray(result.implementation_list)
    ? result.implementation_list
    : [];
  const items = rawList.map(adaptImplementationItem);

  // 按 (sort_group, sort_index) 升序复制一份；不改变原数组顺序语义。
  // sortGroup 为 null 的项放到末尾。
  const sortedItems = [...items].sort((a, b) => {
    const ga = a.sortGroup ?? 99;
    const gb = b.sortGroup ?? 99;
    if (ga !== gb) return ga - gb;
    return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
  });

  return {
    runId: text(run.product_discovery_run_id),
    planAssetId: text(run.plan_asset_id),
    planVersionId: text(run.plan_version_id),
    items: sortedItems,
    totalItemCount: items.length,
    selectedCount: items.filter((item) => item.selectedMatchId).length,
    estimatedTotalCny: Number.isFinite(result.estimated_total_cny)
      ? Math.max(0, Math.floor(result.estimated_total_cny))
      : null,
    currency: text(result.currency, "CNY"),
    // 已选 match 集合，便于 CartIntent 调用
    selectedMatchIds: items
      .filter((item) => item.selectedMatchId)
      .map((item) => ({
        listItemId: item.listItemId,
        matchId: item.selectedMatchId,
        quantity: item.quantity
      }))
  };
}

/**
 * 构造空 ViewModel，用于 implementation slice 初始状态。
 *
 * @returns {object}
 */
export function createEmptyImplementationList() {
  return {
    runId: null,
    planAssetId: null,
    planVersionId: null,
    items: [],
    totalItemCount: 0,
    selectedCount: 0,
    estimatedTotalCny: null,
    currency: "CNY",
    selectedMatchIds: []
  };
}
