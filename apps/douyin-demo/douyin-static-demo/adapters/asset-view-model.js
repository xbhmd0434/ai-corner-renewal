/**
 * Asset ViewModel Adapter
 * 将后端 Asset 转换为前端展示模型
 * 符合 HANDOFF.md 3.2 后端对象边界
 */

/**
 * 将后端 Asset 转换为前端视图模型
 * @param {object} asset - 后端 Asset 对象
 * @returns {object} - AssetViewModel
 */
export function adaptAsset(asset) {
  if (!asset) return null;

  const {
    asset_id,
    asset_type,
    type,
    name,
    description,
    lifecycle,
    parse_state,
    resource_version,
    media_id,
    access_url,
    current_space_version_id,
    current_space_version,
    preview,
    attributes = {},
    created_at,
    updated_at
  } = asset;
  const detectedObjects =
    asset.detected_objects || attributes.detected_objects || [];
  const previewUrl = preview?.url || access_url || null;

  return {
    assetId: asset_id,
    type: asset_type || type || "unknown",
    name: name || "",
    description: description || "",
    lifecycle: lifecycle || "temporary",
    parseState: parse_state || "queued",
    resourceVersion: resource_version || 1,
    mediaId: media_id || null,
    accessUrl: previewUrl,
    currentSpaceVersionId:
      current_space_version_id ||
      current_space_version?.space_version_id ||
      null,
    spaceVersionState: current_space_version?.state || null,
    detectedObjects: detectedObjects.map(adaptDetectedObject),
    createdAt: created_at ? new Date(created_at) : null,
    updatedAt: updated_at ? new Date(updated_at) : null,
    canEdit: lifecycle === "saved",
    canSave: lifecycle === "temporary",
    canArchive: lifecycle === "saved",
    canDelete: lifecycle !== "deleted",
    isReady: parse_state === "ready",
    needsConfirmation: parse_state === "needs_confirmation",
    isFailed: parse_state === "failed",
    isParsing: parse_state === "parsing",
    objectCount: detectedObjects.filter(o => !o.removed).length
  };
}

/**
 * 适配检测到的物体
 * @param {object} detectedObject - 后端 detected_object
 * @returns {object} - DetectedObjectViewModel
 */
export function adaptDetectedObject(detectedObject) {
  if (!detectedObject) return null;

  const {
    detected_object_id,
    display_name,
    label,
    category,
    type,
    style,
    color,
    size,
    confidence,
    detection_confidence,
    bbox,
    disposition,
    removed
  } = detectedObject;

  return {
    detectedObjectId: detected_object_id,
    label: display_name || label || category || "",
    type: category || type || "",
    style: style || "",
    color: color || "",
    size: size || "",
    confidence: detection_confidence || confidence || 0,
    bbox: bbox || { x: 0, y: 0, width: 0, height: 0 },
    removed: removed === true || disposition === "remove",
    confidencePercent: Math.round(
      (detection_confidence || confidence || 0) * 100
    )
  };
}

/**
 * 获取资产类型显示文本
 * @param {string} type - 资产类型
 * @returns {string} - 显示文本
 */
export function getAssetTypeText(type) {
  const typeMap = {
    space: "空间",
    inspiration: "灵感",
    item: "单品"
  };
  return typeMap[type] || type || "未知";
}

/**
 * 获取生命周期显示文本
 * @param {string} lifecycle - 生命周期
 * @returns {string} - 显示文本
 */
export function getLifecycleText(lifecycle) {
  const lifecycleMap = {
    temporary: "临时",
    saved: "已保存",
    archived: "已归档",
    deleted: "已删除"
  };
  return lifecycleMap[lifecycle] || lifecycle || "未知";
}

/**
 * 获取解析状态显示文本
 * @param {string} parseState - 解析状态
 * @returns {string} - 显示文本
 */
export function getParseStateText(parseState) {
  const stateMap = {
    queued: "等待解析",
    parsing: "解析中",
    needs_confirmation: "待确认",
    ready: "已完成",
    failed: "解析失败"
  };
  return stateMap[parseState] || parseState || "未知";
}

/**
 * 获取解析状态样式类
 * @param {string} parseState - 解析状态
 * @returns {string} - CSS 类名
 */
export function getParseStateClass(parseState) {
  const classMap = {
    queued: "parse-queued",
    parsing: "parse-parsing",
    needs_confirmation: "parse-warning",
    ready: "parse-ready",
    failed: "parse-failed"
  };
  return classMap[parseState] || "parse-unknown";
}

/**
 * 获取生命周期样式类
 * @param {string} lifecycle - 生命周期
 * @returns {string} - CSS 类名
 */
export function getLifecycleClass(lifecycle) {
  const classMap = {
    temporary: "lifecycle-temporary",
    saved: "lifecycle-saved",
    archived: "lifecycle-archived",
    deleted: "lifecycle-deleted"
  };
  return classMap[lifecycle] || "lifecycle-unknown";
}

/**
 * 判断资产是否为示例/暂未开放
 * @param {object} asset - Asset 对象
 * @returns {boolean} - 是否为示例
 */
export function isDemoAsset(asset) {
  if (!asset) return false;
  return asset.source_mode === "demo" || asset.is_demo === true;
}

/**
 * 批量适配资产列表
 * @param {object[]} assets - 资产列表
 * @returns {object[]} - 适配后的资产列表
 */
export function adaptAssets(assets) {
  if (!Array.isArray(assets)) return [];
  return assets.map(adaptAsset).filter(Boolean);
}
