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
