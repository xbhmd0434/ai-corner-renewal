/**
 * DesignTaskBuilder
 * 统一任务请求构建器
 * 符合 HANDOFF.md 7. 统一任务请求示例
 */

/**
 * 构建 DesignRequest
 * @param {object} params - 构建参数
 * @param {string} params.trigger - 触发方式: video_apply / space_upload / space_reuse / asset_detail
 * @param {string} params.space_asset_id - 空间资产 ID
 * @param {string} params.space_version_id - 空间版本 ID
 * @param {string[]} [params.reference_asset_ids] - 参考资产 IDs (0~3个)
 * @param {string} [params.goal] - 目标文本
 * @param {string[]} [params.goal_codes] - 目标代码列表
 * @param {object} [params.constraints] - 约束条件
 * @param {number} [params.constraints.budget_cny] - 预算（整数元）
 * @param {boolean} [params.constraints.no_drilling] - 是否不打孔
 * @param {string[]} [params.constraints.keep_detected_object_ids] - 保留物体 IDs
 * @param {string} [params.constraints.pet_context] - 宠物上下文: none / cat / dog
 * @param {string} [params.editable_region_id] - 可编辑区域 ID
 * @param {object} [params.options] - 选项
 * @param {string} [params.options.analysis_mode] - 分析模式: auto / demo / live
 * @param {boolean} [params.options.include_trace] - 是否包含 trace
 * @returns {object} - DesignRequest
 */
export function buildDesignRequest(params) {
  const {
    trigger,
    space_asset_id,
    space_version_id,
    reference_asset_ids = [],
    goal,
    goal_codes = [],
    constraints = {},
    editable_region_id,
    options = {}
  } = params;

  // 先截断参考资产，最多保留3个
  const trimmedReferenceAssetIds = reference_asset_ids.slice(0, 3);

  // 验证约束（使用截断后的数据）
  validateDesignRequest({
    trigger,
    space_asset_id,
    space_version_id,
    reference_asset_ids: trimmedReferenceAssetIds,
    goal,
    goal_codes,
    constraints
  });

  const request = {
    schema_version: "1.0",
    trigger,
    space_asset_id,
    space_version_id,
    reference_asset_ids: trimmedReferenceAssetIds,
    goal: goal || "",
    goal_codes: [...goal_codes],
    constraints: {
      ...(constraints.budget_cny !== undefined
        ? { budget_cny: Number(constraints.budget_cny) }
        : {}),
      no_drilling: constraints.no_drilling === true,
      keep_detected_object_ids: [
        ...(constraints.keep_detected_object_ids || [])
      ],
      pet_context: constraints.pet_context || "none"
    },
    editable_region_id: editable_region_id || "",
    options: {
      analysis_mode: options.analysis_mode || "auto",
      include_trace: options.include_trace !== false,
      experience_contract:
        options.experience_contract || "renewal-card/2.1"
    }
  };

  // 移除空字段
  if (!request.goal) delete request.goal;
  if (!request.editable_region_id) delete request.editable_region_id;

  return request;
}

/**
 * 验证 DesignRequest 参数
 * @param {object} params - 构建参数
 * @throws {Error} - 验证失败时抛出错误
 */
export function validateDesignRequest(params) {
  const errors = [];

  // 必填字段验证
  if (!params.trigger) {
    errors.push("trigger 不能为空");
  }
  if (!params.space_asset_id) {
    errors.push("space_asset_id 不能为空");
  }
  if (!params.space_version_id) {
    errors.push("space_version_id 不能为空");
  }

  // 参考资产数量验证
  if (params.reference_asset_ids && params.reference_asset_ids.length > 3) {
    errors.push("reference_asset_ids 最多3个");
  }

  // 目标验证（至少有一项）
  const hasGoal = params.goal && params.goal.trim();
  const hasGoalCodes = params.goal_codes && params.goal_codes.length > 0;
  const hasReferences = params.reference_asset_ids && params.reference_asset_ids.length > 0;
  if (!hasGoal && !hasGoalCodes && !hasReferences) {
    errors.push("goal、goal_codes 或 reference_asset_ids 至少有一项");
  }

  // 预算验证
  if (params.constraints?.budget_cny !== undefined) {
    const budget = Number(params.constraints.budget_cny);
    if (!Number.isInteger(budget) || budget < 1) {
      errors.push("budget_cny 必须为正整数");
    }
  }

  // 宠物上下文验证
  if (
    params.constraints?.pet_context &&
    !["none", "cat", "dog", "other"].includes(params.constraints.pet_context)
  ) {
    errors.push("pet_context 必须为 none / cat / dog / other");
  }

  if (errors.length > 0) {
    throw new Error(`DesignRequest 验证失败: ${errors.join("; ")}`);
  }
}

/**
 * 从视频入口构建 DesignRequest
 * @param {object} videoContext - 视频上下文
 * @param {string} videoContext.reference_asset_id - 参考资产 ID
 * @param {string} videoContext.space_asset_id - 空间资产 ID
 * @param {string} videoContext.space_version_id - 空间版本 ID
 * @param {string} [videoContext.goal] - 目标文本
 * @param {string[]} [videoContext.goal_codes] - 目标代码
 * @param {object} [videoContext.constraints] - 约束条件
 * @returns {object} - DesignRequest
 */
export function buildVideoEntryRequest(videoContext) {
  return buildDesignRequest({
    trigger: "video_apply",
    ...videoContext
  });
}

/**
 * 从空间上传入口构建 DesignRequest
 * @param {object} spaceContext - 空间上下文
 * @param {string} spaceContext.space_asset_id - 空间资产 ID
 * @param {string} spaceContext.space_version_id - 空间版本 ID
 * @param {string[]} [spaceContext.reference_asset_ids] - 参考资产 IDs
 * @param {string} [spaceContext.goal] - 目标文本
 * @param {string[]} [spaceContext.goal_codes] - 目标代码
 * @param {object} [spaceContext.constraints] - 约束条件
 * @returns {object} - DesignRequest
 */
export function buildSpaceUploadRequest(spaceContext) {
  return buildDesignRequest({
    trigger: "space_upload",
    ...spaceContext
  });
}

/**
 * 从资产选择入口构建 DesignRequest
 * @param {object} assetContext - 资产上下文
 * @param {string} assetContext.space_asset_id - 空间资产 ID
 * @param {string} assetContext.space_version_id - 空间版本 ID
 * @param {string[]} assetContext.reference_asset_ids - 参考资产 IDs
 * @param {string} [assetContext.goal] - 目标文本
 * @param {object} [assetContext.constraints] - 约束条件
 * @returns {object} - DesignRequest
 */
export function buildAssetSelectRequest(assetContext) {
  return buildDesignRequest({
    trigger: "asset_detail",
    ...assetContext
  });
}

/**
 * 创建 DesignTaskDraft（未提交的草稿）
 * @param {object} draft - 草稿数据
 * @returns {object} - DesignTaskDraft
 */
export function createDesignTaskDraft(draft) {
  return {
    id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...draft
  };
}

/**
 * 保存草稿到 sessionStorage
 * @param {object} draft - DesignTaskDraft
 */
export function saveDraftToStorage(draft) {
  try {
    sessionStorage.setItem("design-task-draft", JSON.stringify({
      ...draft,
      updatedAt: Date.now()
    }));
  } catch (e) {
    console.warn("Failed to save draft to sessionStorage:", e);
  }
}

/**
 * 从 sessionStorage 加载草稿
 * @returns {object|null} - DesignTaskDraft 或 null
 */
export function loadDraftFromStorage() {
  try {
    const data = sessionStorage.getItem("design-task-draft");
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("Failed to load draft from sessionStorage:", e);
  }
  return null;
}

/**
 * 清除 sessionStorage 中的草稿
 */
export function clearDraftFromStorage() {
  try {
    sessionStorage.removeItem("design-task-draft");
  } catch (e) {
    console.warn("Failed to clear draft from sessionStorage:", e);
  }
}
