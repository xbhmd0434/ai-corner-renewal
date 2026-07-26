/**
 * Renewal Store
 * 统一状态管理
 * 符合 HANDOFF.md 3.1 前端对象边界
 * 符合 v2-parallel-development-contract.md 7.1 正交 slice 与 7.2 design_context_epoch
 */

import {
  readCapabilities,
  V2_CAPABILITIES,
  LEGACY_CAPABILITIES
} from "../api/capabilities.js";

const PRODUCT_DISCOVERY_RESUME_KEY = "renewal-product-discovery-resume-v1";
const DESIGN_CONTEXT_RESUME_KEY = "renewal-design-context-resume-v1";

function initialProductDiscoveryState() {
  return {
    contextId: null,
    planAssetId: null,
    planVersionId: null,
    runId: null,
    status: "not_started",
    stage: null,
    progress: 0,
    resultState: null,
    result: null,
    viewModel: null,
    error: null,
    polling: false,
    deliveryMode: "api",
    reconnectRequired: false
  };
}

/**
 * V2.1 协议 7.1 entry slice：灵感资产 + 意图解析 + 确认快照。
 * 子状态机 ENTRY_RECOGNIZING → INTENT_CONFIRMATION → CARD_READY。
 */
function initialEntryState() {
  return {
    referenceAssetId: null,
    referenceAssetType: null,
    // 兼容旧恢复数据；新代码统一读取 referenceAssetId。
    inspirationAssetId: null,
    parseState: "not_started", // not_started | parsing | needs_confirmation | ready | failed
    intentAnalysis: null, // InspirationIntentViewModel
    confirmedIntent: null, // { intentType, summary, confirmedBy, confirmedAt }
    error: null
  };
}

/**
 * V2.1 协议 7.1 designContext slice + 7.2 design_context_epoch。
 * 场景切换必须增加 epoch；旧 epoch 的响应不得写回。
 */
function initialDesignContextState() {
  return {
    epoch: 0,
    designRequestId: null,
    selectedScene: null,
    selectedSpaceVersionId: null
  };
}

/**
 * V2.1 协议 7.1 generation 子状态（正交）：
 * not_started | active | ready | failed | cancelled
 */
function initialGenerationState() {
  return {
    status: "not_started",
    generationRunId: null,
    abortController: null,
    currentRun: null,
    error: null
  };
}

/**
 * V2.1 协议 7.1 relatedDesigns 子状态（正交）：
 * not_started | active | ready | partial | empty | failed | cancelled
 */
function initialRelatedDesignsState() {
  return {
    status: "not_started",
    relatedDesignRunId: null,
    abortController: null,
    viewModel: null,
    error: null,
    polling: false
  };
}

/**
 * V2.1 协议 7.1 publication 子状态（正交）：
 * not_started | saving | saved | publishing | published | failed
 */
function initialPublicationState() {
  return {
    status: "not_started",
    publicationId: null,
    viewModel: null,
    error: null
  };
}

/**
 * V2.1 协议 7.1 implementation 子状态（正交）：
 * closed | loading | ready | partial | empty | failed
 */
function initialImplementationState() {
  return {
    status: "closed",
    viewModel: null,
    error: null,
    polling: false
  };
}

const INITIAL_STATE = {
  // 单页核心流程：IDLE / GENERATING / RESULT_READY / ADJUSTING
  // V2.1 保留作为顶层视图状态；具体子能力由正交 slice 表达
  mode: "space_to_inspiration",
  coreState: "IDLE",
  selectedReference: null,
  // 旧字段只为历史草稿/测试兼容保留，不再作为 V2.1 事实源。
  selectedInspiration: null,
  selectedSpace: null,
  selectedProductIds: [],
  constraints: {
    budget_cny: 500,
    no_drilling: true,
    pet_context: "none",
    rental: true,
    keep_detected_object_ids: [],
    user_note: ""
  },

  // V2.1 正交 slice
  entry: initialEntryState(),
  designContext: initialDesignContextState(),
  generation: initialGenerationState(),
  relatedDesigns: initialRelatedDesignsState(),
  publication: initialPublicationState(),
  implementation: initialImplementationState(),

  // V2.1 能力门控：readCapabilities(/api/health) 结果
  capabilities: {},

  // 当前路由
  currentRoute: "/home",

  // 资产列表
  assets: [],

  // 当前选中资产
  selectedAssetId: null,

  // 空间资产
  spaces: [],

  // 灵感资产
  inspirations: [],

  // 单品资产
  items: [],

  // 当前设计任务草稿
  designTaskDraft: null,

  // 当前生成任务（保留以维持向后兼容；V2.1 主流程改用 generation slice）
  currentGenerationRun: null,
  generationAbortController: null,

  // 方案列表
  plans: [],

  // 当前方案版本
  currentPlanVersion: null,

  // 当前 PlanVersion 独立拥有的商品发现运行。
  productDiscovery: initialProductDiscoveryState(),

  // 用户偏好
  preferences: null,

  // 后端连接状态与能力
  backendHealth: null,
  backendConnected: false,

  // UI 状态
  ui: {
    loading: false,
    error: null,
    toast: null,
    drawerOpen: null
  },

  // 视频入口上下文
  videoEntryContext: null,

  // 上传的文件（未提交前保留）
  pendingFile: null,
  pendingFilePreview: null,

  // 编辑历史（当前页面撤销/重做）
  editHistory: [],
  editHistoryIndex: -1
};

function freshInitialState() {
  return {
    ...INITIAL_STATE,
    constraints: { ...INITIAL_STATE.constraints },
    ui: { ...INITIAL_STATE.ui },
    entry: initialEntryState(),
    designContext: initialDesignContextState(),
    generation: initialGenerationState(),
    relatedDesigns: initialRelatedDesignsState(),
    publication: initialPublicationState(),
    implementation: initialImplementationState(),
    capabilities: {},
    assets: [],
    spaces: [],
    inspirations: [],
    items: [],
    plans: [],
    editHistory: [],
    productDiscovery: initialProductDiscoveryState()
  };
}

let state = freshInitialState();
let listeners = new Set();
let productDiscoveryContextSequence = 0;

/**
 * 获取完整状态
 * @returns {object} - 当前状态
 */
export function getState() {
  return { ...state };
}

/**
 * 获取指定路径的状态
 * @param {string} path - 状态路径（如 'assets', 'ui.loading'）
 * @returns {any} - 状态值
 */
export function get(path) {
  return path.split(".").reduce((acc, key) => acc?.[key], state);
}

/**
 * 更新状态
 * @param {object} updates - 状态更新对象
 */
export function update(updates) {
  state = { ...state, ...updates };
  notifyListeners();
}

/**
 * 更新深层状态
 * @param {string} path - 状态路径
 * @param {any} value - 新值
 */
export function set(path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  const parent = keys.reduce((acc, key) => acc?.[key], state);

  if (parent && typeof parent === "object") {
    parent[lastKey] = value;
    notifyListeners();
  }
}

/**
 * 监听状态变化
 * @param {Function} listener - 监听函数
 * @returns {Function} - 取消监听函数
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 通知所有监听器
 */
function notifyListeners() {
  listeners.forEach(listener => {
    try {
      listener({ ...state });
    } catch (e) {
      console.error("State listener error:", e);
    }
  });
}

/**
 * 重置状态
 */
export function reset() {
  state = freshInitialState();
  notifyListeners();
}

/**
 * 设置加载状态
 * @param {boolean} loading - 是否加载中
 */
export function setLoading(loading) {
  state.ui.loading = loading;
  notifyListeners();
}

/**
 * 设置错误
 * @param {object|null} error - 错误对象
 */
export function setError(error) {
  state.ui.error = error;
  notifyListeners();
}

/**
 * 显示 Toast
 * @param {string} message - Toast 消息
 */
export function showToast(message) {
  state.ui.toast = message;
  notifyListeners();

  setTimeout(() => {
    if (state.ui.toast === message) {
      state.ui.toast = null;
      notifyListeners();
    }
  }, 2000);
}

/**
 * 保存设计任务草稿
 *
 * V2.1 协议 7.3：sessionStorage 只保存业务 ID，不保存原图、短时 URL、bbox、
 * 商品 URL、Agent 正文或 Publication 私有快照。
 *
 * 这里持久化时按 allowlist 过滤，只保留：
 * - 资产/版本 IDs（space_asset_id / space_version_id / reference_asset_ids / editable_region_id）
 * - 必要的 UI 状态（trigger / space_sealed / space_parse_state / space_version_resource_version / updatedAt）
 *
 * 不保存：goal / goal_codes / constraints（含 budget_cny / no_drilling / pet_context）/ user_note。
 * 刷新后 hydrateStoredDraft 不会恢复 V2.1 P0 不显示的约束，符合协议第 1 节。
 *
 * 内存中 state.designTaskDraft 仍保留完整对象，供当前会话使用；只有持久化被收紧。
 *
 * @param {object} draft - 草稿数据
 */
export function saveDesignTaskDraft(draft) {
  state.designTaskDraft = draft;
  notifyListeners();

  // 持久化时按 allowlist 收紧
  const ALLOWED_DRAFT_KEYS = new Set([
    "trigger",
    "space_asset_id",
    "space_version_id",
    "editable_region_id",
    "reference_asset_ids",
    "space_sealed",
    "space_parse_state",
    "space_version_resource_version",
    "updatedAt"
  ]);
  const safeDraft = {};
  for (const key of Object.keys(draft || {})) {
    if (ALLOWED_DRAFT_KEYS.has(key)) {
      safeDraft[key] = draft[key];
    }
  }
  try {
    sessionStorage.setItem("design-task-draft", JSON.stringify(safeDraft));
  } catch (e) {
    console.warn("Failed to save draft to sessionStorage:", e);
  }
}

/**
 * 加载设计任务草稿
 * @returns {object|null} - 草稿数据
 */
export function loadDesignTaskDraft() {
  try {
    const data = sessionStorage.getItem("design-task-draft");
    if (data) {
      const draft = JSON.parse(data);
      state.designTaskDraft = draft;
      notifyListeners();
      return draft;
    }
  } catch (e) {
    console.warn("Failed to load draft from sessionStorage:", e);
  }
  return null;
}

/**
 * 清除设计任务草稿
 */
export function clearDesignTaskDraft() {
  state.designTaskDraft = null;
  notifyListeners();

  try {
    sessionStorage.removeItem("design-task-draft");
  } catch (e) {
    console.warn("Failed to clear draft from sessionStorage:", e);
  }
}

/**
 * 设置视频入口上下文
 *
 * V2.1 协议 7.3：sessionStorage 不保存 bbox、短时 URL、Agent 正文。
 * 持久化时按 allowlist 收紧，只保留 IDs 和必要的展示字段：
 * - reference_asset_id / provider / external_content_id / video_id
 * - author_display / timestamp_ms / name（用于显示，不含敏感数据）
 *
 * 不保存：caption / selection_bbox（bbox 是协议明确禁止的字段）。
 * 内存中 state.videoEntryContext 仍保留完整对象，供当前会话使用。
 *
 * @param {object} context - 视频上下文
 */
export function setVideoEntryContext(context) {
  state.videoEntryContext = context;
  notifyListeners();

  const ALLOWED_CONTEXT_KEYS = new Set([
    "reference_asset_id",
    "inspiration_asset_id",
    "provider",
    "external_content_id",
    "video_id",
    "author_display",
    "timestamp_ms",
    "confirmed_intent_type",
    "name"
  ]);
  const safeContext = {};
  for (const key of Object.keys(context || {})) {
    if (ALLOWED_CONTEXT_KEYS.has(key)) {
      safeContext[key] = context[key];
    }
  }
  try {
    sessionStorage.setItem("video-entry-context", JSON.stringify(safeContext));
  } catch (e) {
    console.warn("Failed to save video context:", e);
  }
}

/**
 * 加载视频入口上下文
 * @returns {object|null} - 视频上下文
 */
export function loadVideoEntryContext() {
  try {
    const data = sessionStorage.getItem("video-entry-context");
    if (data) {
      const context = JSON.parse(data);
      state.videoEntryContext = context;
      notifyListeners();
      return context;
    }
  } catch (e) {
    console.warn("Failed to load video context:", e);
  }
  return null;
}

/**
 * 清除视频入口上下文
 */
export function clearVideoEntryContext() {
  state.videoEntryContext = null;
  notifyListeners();

  try {
    sessionStorage.removeItem("video-entry-context");
  } catch (e) {
    console.warn("Failed to clear video context:", e);
  }
}

/**
 * 设置待上传文件
 * @param {File} file - 文件对象
 * @param {string} preview - 预览 URL
 */
export function setPendingFile(file, preview) {
  // 释放之前的预览 URL
  if (state.pendingFilePreview) {
    URL.revokeObjectURL(state.pendingFilePreview);
  }

  state.pendingFile = file;
  state.pendingFilePreview = preview;
  notifyListeners();
}

/**
 * 清除待上传文件
 */
export function clearPendingFile() {
  if (state.pendingFilePreview) {
    URL.revokeObjectURL(state.pendingFilePreview);
  }

  state.pendingFile = null;
  state.pendingFilePreview = null;
  notifyListeners();
}

/**
 * 添加编辑历史
 * @param {object} snapshot - 快照数据
 * @param {string} label - 操作标签
 */
export function pushEditHistory(snapshot, label) {
  const entry = {
    timestamp: Date.now(),
    label,
    snapshot
  };

  // 截断当前索引之后的历史
  state.editHistory = state.editHistory.slice(0, state.editHistoryIndex + 1);
  state.editHistory.push(entry);
  state.editHistoryIndex = state.editHistory.length - 1;
  notifyListeners();
}

/**
 * 撤销编辑
 * @returns {object|null} - 上一个快照
 */
export function undoEdit() {
  if (state.editHistoryIndex <= 0) return null;

  state.editHistoryIndex--;
  const entry = state.editHistory[state.editHistoryIndex];
  notifyListeners();
  return entry?.snapshot;
}

/**
 * 重做编辑
 * @returns {object|null} - 下一个快照
 */
export function redoEdit() {
  if (state.editHistoryIndex >= state.editHistory.length - 1) return null;

  state.editHistoryIndex++;
  const entry = state.editHistory[state.editHistoryIndex];
  notifyListeners();
  return entry?.snapshot;
}

/**
 * 检查是否可撤销
 * @returns {boolean} - 是否可撤销
 */
export function canUndo() {
  return state.editHistoryIndex > 0;
}

/**
 * 检查是否可重做
 * @returns {boolean} - 是否可重做
 */
export function canRedo() {
  return state.editHistoryIndex < state.editHistory.length - 1;
}

/**
 * 清除编辑历史
 */
export function clearEditHistory() {
  state.editHistory = [];
  state.editHistoryIndex = -1;
  notifyListeners();
}

/**
 * 设置当前生成任务
 * @param {object} run - GenerationRun
 * @param {AbortController} abortController - AbortController
 */
export function setGenerationRun(run, abortController) {
  state.currentGenerationRun = run;
  state.generationAbortController = abortController;
  notifyListeners();
}

/**
 * 更新后端健康状态。
 * 同时刷新 V2.1 capabilities（readCapabilities 结果），供 capabilityGate 使用。
 * @param {object|null} health - /api/health 响应
 */
export function setBackendHealth(health) {
  state.backendHealth = health;
  state.backendConnected = health?.status === "ok";
  state.capabilities = readCapabilities(health);
  notifyListeners();
}

/**
 * 获取当前能力门控结果。
 * 调用方应使用 `hasFeature(state.capabilities, name)` 或
 * `createCapabilityGate(state.capabilities)` 进行门控判断。
 * @returns {object}
 */
export function getCapabilities() {
  return state.capabilities;
}

/**
 * 判断指定能力是否可用。在 health 未声明时返回 false。
 * @param {string} name - V2_CAPABILITIES / LEGACY_CAPABILITIES 之一
 * @returns {boolean}
 */
export function hasCapability(name) {
  return Boolean(state.capabilities && state.capabilities[name] === true);
}

/**
 * 取消当前生成任务
 */
export function cancelGeneration() {
  if (state.generationAbortController) {
    state.generationAbortController.abort();
    state.generationAbortController = null;
  }
  state.currentGenerationRun = null;
  notifyListeners();
}

/**
 * 检查生成任务是否可取消
 * @returns {boolean} - 是否可取消
 */
export function canCancelGeneration() {
  return !!state.currentGenerationRun &&
         !!state.generationAbortController &&
         state.currentGenerationRun.status !== "succeeded" &&
         state.currentGenerationRun.status !== "failed" &&
         state.currentGenerationRun.status !== "cancelled";
}

/**
 * 验证旧 run 的迟到响应
 * @param {string} generationRunId - GenerationRun ID
 * @returns {boolean} - 是否为当前 run
 */
export function isValidGenerationRun(generationRunId) {
  return state.currentGenerationRun?.generation_run_id === generationRunId;
}

/**
 * 更新资产列表
 * @param {object[]} assets - 资产列表
 */
export function updateAssets(assets) {
  state.assets = assets;

  // 按类型分类
  state.spaces = assets.filter(a => a.type === "space");
  state.inspirations = assets.filter(a => a.type === "inspiration");
  state.items = assets.filter(a => a.type === "item");

  notifyListeners();
}

/**
 * 更新方案列表
 * @param {object[]} plans - 方案列表
 */
export function updatePlans(plans) {
  state.plans = plans;
  notifyListeners();
}

/**
 * 设置当前方案版本
 * @param {object} planVersion - PlanVersion
 */
export function setCurrentPlanVersion(planVersion) {
  state.currentPlanVersion = planVersion;
  notifyListeners();
}

/**
 * 为一个不可变 PlanVersion 开始新的商品发现上下文。
 * 即使 planVersionId 相同，显式刷新/重试也会获得新 contextId，旧请求无法写回。
 */
export function beginProductDiscoveryContext(
  planAssetId,
  planVersionId,
  { deliveryMode = "api" } = {}
) {
  productDiscoveryContextSequence += 1;
  const contextId = `${planVersionId}:${productDiscoveryContextSequence}`;
  state.productDiscovery = {
    ...initialProductDiscoveryState(),
    contextId,
    planAssetId,
    planVersionId,
    deliveryMode
  };
  notifyListeners();
  return contextId;
}

export function isCurrentProductDiscoveryContext(contextId, planVersionId) {
  const current = state.productDiscovery;
  return (
    Boolean(contextId) &&
    current.contextId === contextId &&
    (!planVersionId || current.planVersionId === planVersionId)
  );
}

/**
 * 只在上下文仍属于当前 PlanVersion 时写入。返回 false 表示响应已迟到。
 */
export function updateProductDiscoveryForContext(contextId, patch) {
  if (!isCurrentProductDiscoveryContext(contextId, patch?.planVersionId)) {
    return false;
  }
  state.productDiscovery = {
    ...state.productDiscovery,
    ...patch,
    contextId
  };
  notifyListeners();
  return true;
}

export function applyProductDiscoveryViewModel(contextId, viewModel) {
  if (!viewModel || !isCurrentProductDiscoveryContext(contextId, viewModel.planVersionId)) {
    return false;
  }
  return updateProductDiscoveryForContext(contextId, {
    runId: viewModel.runId,
    status: viewModel.status,
    stage: viewModel.stage,
    progress: viewModel.progress,
    resultState: ["ready", "partial", "empty"].includes(viewModel.status)
      ? viewModel.status
      : null,
    result: viewModel.subjects,
    viewModel,
    error: viewModel.errorMessage,
    deliveryMode: viewModel.deliveryMode,
    reconnectRequired: false
  });
}

export function persistProductDiscoveryResume(value) {
  const safeValue = {
    planAssetId: value?.planAssetId || null,
    planVersionId: value?.planVersionId || null,
    runId: value?.runId || null
  };
  try {
    sessionStorage.setItem(PRODUCT_DISCOVERY_RESUME_KEY, JSON.stringify(safeValue));
  } catch (error) {
    console.warn("Failed to persist product discovery resume IDs:", error);
  }
}

export function loadProductDiscoveryResume() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PRODUCT_DISCOVERY_RESUME_KEY) || "null");
    if (value?.planAssetId && value?.planVersionId) return value;
  } catch (error) {
    console.warn("Failed to load product discovery resume IDs:", error);
  }
  return null;
}

/* =========================================================================
 * V2.1 正交 slice helpers
 * 依据 v2-parallel-development-contract.md 第 7 节
 * ========================================================================= */

/**
 * entry slice：更新灵感资产 + 意图解析状态。
 * 协议 6.1：parseState ∈ parsing | needs_confirmation | ready | failed
 * @param {object} patch
 */
export function updateEntry(patch) {
  state.entry = { ...state.entry, ...patch };
  notifyListeners();
}

/**
 * entry slice：设置已确认意图。confirmedIntent 是不可变输入快照。
 * 协议第 2.1 节：confirmedIntent 一旦写入不覆盖；纠正需创建新 InspirationAsset。
 * @param {object} confirmed - { intentType, summary, confirmedBy, confirmedAt }
 */
export function setConfirmedIntent(confirmed) {
  state.entry = {
    ...state.entry,
    confirmedIntent: confirmed,
    parseState: "ready"
  };
  notifyListeners();
}

/**
 * designContext slice：开始新设计上下文，自增 epoch。
 * 协议 7.2：用户切换场景必须创建新 DesignRequest，并增加 design_context_epoch。
 * 旧 epoch 的响应不得写回。
 *
 * @param {object} params
 * @param {string} [params.designRequestId] - 创建 DesignRequest 后回填
 * @param {object} [params.selectedScene] - 选中的 SceneAsset ViewModel
 * @param {string} [params.selectedSpaceVersionId] - sealed SpaceVersion ID
 * @returns {number} 新 epoch
 */
export function beginDesignContext(params = {}) {
  state.designContext = {
    epoch: state.designContext.epoch + 1,
    designRequestId: params.designRequestId || null,
    selectedScene: params.selectedScene || null,
    selectedSpaceVersionId: params.selectedSpaceVersionId || null
  };
  // 切换场景必须重置 generation / relatedDesigns 子状态，但保留 entry / publication
  state.generation = initialGenerationState();
  state.relatedDesigns = initialRelatedDesignsState();
  notifyListeners();
  return state.designContext.epoch;
}

/**
 * 在创建 DesignRequest 成功后回填 design_request_id 到当前 epoch。
 * 若 epoch 已变化（用户切换场景），拒绝写回。
 *
 * @param {number} epoch
 * @param {string} designRequestId
 * @returns {boolean} 是否成功写回
 */
export function setDesignRequestIdForEpoch(epoch, designRequestId) {
  if (state.designContext.epoch !== epoch) return false;
  state.designContext = {
    ...state.designContext,
    designRequestId
  };
  notifyListeners();
  return true;
}

/**
 * 校验异步响应是否属于当前 design_context_epoch + design_request_id。
 * 协议 7.2：只有 design_request_id + design_context_epoch 都匹配的响应能写回。
 *
 * @param {object} expected - { epoch, designRequestId }
 * @returns {boolean}
 */
export function isCurrentDesignContext(expected) {
  if (!expected) return false;
  if (expected.epoch !== state.designContext.epoch) return false;
  if (
    expected.designRequestId &&
    state.designContext.designRequestId &&
    expected.designRequestId !== state.designContext.designRequestId
  ) {
    return false;
  }
  return true;
}

/**
 * 校验异步响应是否属于当前 epoch + design_request_id + 指定 run_id。
 * 任一不匹配则拒绝写回（迟到响应隔离）。
 *
 * @param {object} expected - { epoch, designRequestId, runId }
 * @param {string} [runIdKey] - runId 在 expected 中的键名，默认 'runId'
 * @returns {boolean}
 */
export function isValidForCurrentEpoch(expected, runIdKey = "runId") {
  if (!isCurrentDesignContext(expected)) return false;
  if (!expected[runIdKey]) return true;
  // generation / relatedDesigns slice 中的 runId 必须匹配
  if (runIdKey === "generationRunId") {
    return state.generation.generationRunId === expected.generationRunId;
  }
  if (runIdKey === "relatedDesignRunId") {
    return state.relatedDesigns.relatedDesignRunId === expected.relatedDesignRunId;
  }
  return true;
}

/**
 * generation slice：更新生成运行状态。
 * 协议 7.1：generation 是正交子状态，与 relatedDesigns 独立失败、恢复、重试。
 *
 * @param {object} patch - { status, generationRunId, currentRun, error, abortController }
 */
export function updateGeneration(patch) {
  state.generation = { ...state.generation, ...patch };
  notifyListeners();
}

/**
 * generation slice：仅在 epoch + designRequestId + generationRunId 都匹配时写回。
 * 用于异步轮询响应的迟到隔离。
 *
 * @param {object} expected - { epoch, designRequestId, generationRunId }
 * @param {object} patch
 * @returns {boolean} 是否成功写回
 */
export function updateGenerationForContext(expected, patch) {
  if (!isCurrentDesignContext(expected)) return false;
  if (
    expected.generationRunId &&
    state.generation.generationRunId &&
    expected.generationRunId !== state.generation.generationRunId
  ) {
    return false;
  }
  state.generation = { ...state.generation, ...patch };
  notifyListeners();
  return true;
}

/**
 * relatedDesigns slice：更新相关设计运行状态。
 * 协议第 5 节：Related Design 与 Generation 并发、独立成功或失败，互不阻塞。
 *
 * @param {object} patch - { status, relatedDesignRunId, viewModel, error, polling, abortController }
 */
export function updateRelatedDesigns(patch) {
  state.relatedDesigns = { ...state.relatedDesigns, ...patch };
  notifyListeners();
}

/**
 * relatedDesigns slice：仅在 epoch + designRequestId + relatedDesignRunId 都匹配时写回。
 *
 * @param {object} expected - { epoch, designRequestId, relatedDesignRunId }
 * @param {object} patch
 * @returns {boolean} 是否成功写回
 */
export function updateRelatedDesignsForContext(expected, patch) {
  if (!isCurrentDesignContext(expected)) return false;
  if (
    expected.relatedDesignRunId &&
    state.relatedDesigns.relatedDesignRunId &&
    expected.relatedDesignRunId !== state.relatedDesigns.relatedDesignRunId
  ) {
    return false;
  }
  state.relatedDesigns = { ...state.relatedDesigns, ...patch };
  notifyListeners();
  return true;
}

/**
 * publication slice：更新发布状态。
 * 协议 6.4：保存与发布是两个明确动作；index_failed 不改变私人保存状态。
 *
 * @param {object} patch - { status, publicationId, viewModel, error }
 */
export function updatePublication(patch) {
  state.publication = { ...state.publication, ...patch };
  notifyListeners();
}

/**
 * publication slice：重置为初始状态。切换 PlanVersion 时按版本隔离 Publication。
 */
export function resetPublication() {
  state.publication = initialPublicationState();
  notifyListeners();
}

/**
 * implementation slice：更新实施清单状态。
 * 协议 6.5：前端不重排来源，按后端 sort_group + sort_index 展示。
 *
 * @param {object} patch - { status, viewModel, error, polling }
 */
export function updateImplementation(patch) {
  state.implementation = { ...state.implementation, ...patch };
  notifyListeners();
}

/**
 * implementation slice：重置为关闭状态。关闭面板不取消服务端 run。
 */
export function resetImplementation() {
  state.implementation = initialImplementationState();
  notifyListeners();
}

/**
 * 持久化 design_context_resume：协议 7.3 只保存业务 ID。
 * 不保存原图、bbox、商品 URL、Agent 正文或 Publication 私有快照。
 *
 * @param {object} value - { designRequestId, generationRunId, relatedDesignRunId, planAssetId, planVersionId }
 */
export function persistDesignContextResume(value) {
  let previous = {};
  try {
    previous = JSON.parse(
      sessionStorage.getItem(DESIGN_CONTEXT_RESUME_KEY) || "{}"
    );
  } catch {
    previous = {};
  }
  const safeValue = {
    designRequestId:
      value?.designRequestId ?? previous.designRequestId ?? null,
    generationRunId:
      value?.generationRunId ?? previous.generationRunId ?? null,
    relatedDesignRunId:
      value?.relatedDesignRunId ?? previous.relatedDesignRunId ?? null,
    planAssetId: value?.planAssetId ?? previous.planAssetId ?? null,
    planVersionId: value?.planVersionId ?? previous.planVersionId ?? null,
    publicationId:
      value?.publicationId ?? previous.publicationId ?? null
  };
  try {
    sessionStorage.setItem(
      DESIGN_CONTEXT_RESUME_KEY,
      JSON.stringify(safeValue)
    );
  } catch (error) {
    console.warn("Failed to persist design context resume IDs:", error);
  }
}

/**
 * 读取 design_context_resume：刷新/重启恢复时使用。
 * 恢复时先 GET/List，不自动创建第二个 run。
 *
 * @returns {object|null}
 */
export function loadDesignContextResume() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(DESIGN_CONTEXT_RESUME_KEY) || "null"
    );
    if (value?.designRequestId || value?.planAssetId) return value;
  } catch (error) {
    console.warn("Failed to load design context resume IDs:", error);
  }
  return null;
}

/**
 * 清除 design_context_resume。
 */
export function clearDesignContextResume() {
  try {
    sessionStorage.removeItem(DESIGN_CONTEXT_RESUME_KEY);
  } catch (error) {
    console.warn("Failed to clear design context resume IDs:", error);
  }
}

// 重新导出 V2.1 capabilities 常量，方便调用方一处 import
export { V2_CAPABILITIES, LEGACY_CAPABILITIES };
