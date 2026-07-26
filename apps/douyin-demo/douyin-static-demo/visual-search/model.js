export const MIN_SELECTION_AREA = 0.012;

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSelection(start, end) {
  const left = clamp(Math.min(start.x, end.x));
  const top = clamp(Math.min(start.y, end.y));
  const right = clamp(Math.max(start.x, end.x));
  const bottom = clamp(Math.max(start.y, end.y));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function selectionArea(selection) {
  return Math.max(0, selection?.width || 0) * Math.max(0, selection?.height || 0);
}

export function isValidSelection(selection) {
  return selectionArea(selection) >= MIN_SELECTION_AREA;
}

export function selectionToCss(selection) {
  return {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.width * 100}%`,
    height: `${selection.height * 100}%`
  };
}

export function buildVideoSourceContext(slide, video, selection) {
  return {
    provider: "douyin_static_demo",
    external_content_id: slide.dataset.videoId || "unknown-video",
    author_display: slide.dataset.author || "视频作者",
    caption: slide.dataset.caption || "当前视频",
    timestamp_ms: Math.max(0, Math.round((video.currentTime || 0) * 1000)),
    selection_bbox: {
      x: Number(selection.x.toFixed(4)),
      y: Number(selection.y.toFixed(4)),
      width: Number(selection.width.toFixed(4)),
      height: Number(selection.height.toFixed(4))
    }
  };
}

export function serializeLocalAsset(candidate, context) {
  return {
    schema_version: "1.0",
    local_asset_id: `local-item-${Date.now()}`,
    asset_type: "item",
    lifecycle: "saved",
    name: candidate.name,
    candidate_id: candidate.candidate_id,
    product_id: candidate.product_id || null,
    preview_kind: candidate.visual_kind,
    model_state: "preview_2d_ready",
    source_context: context,
    created_at: new Date().toISOString()
  };
}

export function buildRenewalEntryContext(persistence, sourceContext, candidate) {
  const referenceAssetId =
    persistence?.asset_id ||
    persistence?.item_asset?.asset_id ||
    persistence?.asset?.asset_id ||
    null;
  return {
    reference_asset_id: referenceAssetId,
    provider: sourceContext?.provider || "douyin_static_demo",
    external_content_id:
      sourceContext?.external_content_id || "unknown-video",
    author_display: sourceContext?.author_display || "视频作者",
    timestamp_ms: Number.isInteger(sourceContext?.timestamp_ms)
      ? sourceContext.timestamp_ms
      : 0,
    name: candidate?.name || "视频圈选组件"
  };
}

export function hasGenerationReadySourceComponent(persistence) {
  const sourceComponent =
    persistence?.source_component ||
    persistence?.asset?.attributes?.source_component ||
    persistence?.item_asset?.attributes?.source_component ||
    null;
  return (
    sourceComponent?.immutable_anchor === true &&
    typeof sourceComponent.source_component_id === "string" &&
    sourceComponent.source_component_id.length > 0
  );
}

/**
 * 视频入口完成意图确认后，交给「搬进我家」页的最小业务上下文。
 *
 * InspirationAsset 是跨页面稳定身份；圈选 bbox、裁剪图和短时媒体地址都由后端资产
 * 持有，不写入 sessionStorage。这样焕新页只需按 ID 重新读取权威详情。
 */
export function buildInspirationEntryContext(
  inspirationAsset,
  sourceContext,
  confirmedIntent
) {
  const assetId =
    inspirationAsset?.asset_id ||
    inspirationAsset?.asset?.asset_id ||
    null;
  const intentType = confirmedIntent?.intent_type || null;
  const summary =
    confirmedIntent?.summary ||
    inspirationAsset?.attributes?.confirmed_intent?.summary ||
    inspirationAsset?.attributes?.intent_analysis?.summary ||
    inspirationAsset?.name ||
    "视频家居灵感";

  return {
    reference_asset_id: assetId,
    inspiration_asset_id: assetId,
    provider: sourceContext?.provider || "douyin_static_demo",
    external_content_id:
      sourceContext?.external_content_id || "unknown-video",
    author_display: sourceContext?.author_display || "视频作者",
    timestamp_ms: Number.isInteger(sourceContext?.timestamp_ms)
      ? sourceContext.timestamp_ms
      : 0,
    confirmed_intent_type: intentType,
    name: String(summary).slice(0, 100)
  };
}
