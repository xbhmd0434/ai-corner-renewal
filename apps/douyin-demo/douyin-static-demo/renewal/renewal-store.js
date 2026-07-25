/**
 * Renewal Store
 * 统一状态管理
 * 符合 HANDOFF.md 3.1 前端对象边界
 */

const PRODUCT_DISCOVERY_RESUME_KEY = "renewal-product-discovery-resume-v1";

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

const INITIAL_STATE = {
  // 单页核心流程：IDLE / GENERATING / RESULT_READY / ADJUSTING
  mode: "space_to_inspiration",
  coreState: "IDLE",
  selectedInspiration: null,
  selectedSpace: null,
  constraints: {
    budget_cny: 500,
    no_drilling: true,
    pet_context: "none",
    rental: true,
    keep_detected_object_ids: [],
    user_note: ""
  },

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

  // 当前生成任务
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
 * @param {object} draft - 草稿数据
 */
export function saveDesignTaskDraft(draft) {
  state.designTaskDraft = draft;
  notifyListeners();

  // 同时保存到 sessionStorage
  try {
    sessionStorage.setItem("design-task-draft", JSON.stringify(draft));
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
 * @param {object} context - 视频上下文
 */
export function setVideoEntryContext(context) {
  state.videoEntryContext = context;
  notifyListeners();

  // 保存到 sessionStorage（短期）
  try {
    sessionStorage.setItem("video-entry-context", JSON.stringify(context));
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
 * @param {object|null} health - /api/health 响应
 */
export function setBackendHealth(health) {
  state.backendHealth = health;
  state.backendConnected = health?.status === "ok";
  notifyListeners();
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
