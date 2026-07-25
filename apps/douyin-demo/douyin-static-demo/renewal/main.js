/**
 * 一角焕新单页核心流程。
 * 浏览器只保存未提交表单与当前选择；资产、空间版本、生成运行和方案版本由后端拥有。
 */
import {
  getState,
  subscribe,
  update,
  setLoading,
  showToast,
  loadDesignTaskDraft,
  saveDesignTaskDraft,
  loadVideoEntryContext,
  setBackendHealth,
  setGenerationRun,
  cancelGeneration,
  beginProductDiscoveryContext,
  applyProductDiscoveryViewModel,
  updateProductDiscoveryForContext,
  isCurrentProductDiscoveryContext,
  persistProductDiscoveryResume,
  loadProductDiscoveryResume
} from "./renewal-store.js";
import {
  uploadMedia,
  createAsset,
  listAssets,
  getAsset,
  confirmSpaceVersion,
  createDesignRequest,
  createGenerationRun,
  getGenerationRun,
  cancelGenerationRun,
  listPlans,
  getPlan,
  getPlanVersion,
  createPlanRevision,
  sendEventsBatch
} from "../api/v1-client.js";
import {
  cancelProductDiscoveryRun,
  createProductDiscoveryRun,
  getProductDiscoveryRun,
  listProductDiscoveryRuns,
  loadProductDiscoveryFixture
} from "../api/product-discovery-client.js";
import { checkHealth } from "../api/legacy-client.js";
import { mapError } from "../api/http-client.js";
import { adaptAsset, adaptAssets } from "../adapters/asset-view-model.js";
import { adaptPlanResult } from "../adapters/plan-version-view-model.js";
import {
  adaptProductDiscoveryRun,
  createUnavailableProductDiscoveryViewModel
} from "../adapters/product-discovery-view-model.js";
import {
  buildDesignRequest
} from "../adapters/design-task-builder.js";
import { getStartupContext } from "./mode.js";
import { InspirationBar } from "./components/inspiration-bar.js";
import { SpacePicker } from "./components/space-picker.js";
import { ConstraintBar } from "./components/constraint-bar.js";
import { AssetDrawer } from "./components/asset-drawer.js";
import { HistoryDrawer } from "./components/history-drawer.js";
import { ResultSection } from "./components/result-section.js";
import { escapeHtml, formatMoney } from "./components/ui-utils.js";
import { buildProductDiscoveryEvent } from "./product-discovery-events.js";

const DEFAULT_GOAL = "让空间更整洁，并增加舒适的暖光氛围";
const DEFAULT_UPLOAD_LIMIT = 6 * 1024 * 1024;
const PARSE_POLL_INTERVAL_MS = 300;
const PARSE_POLL_ATTEMPTS = 40;
const PHASES = {
  input_validation: ["核对需求", "确认空间、预算与生活限制"],
  space_analysis: ["理解空间", "正在识别尺度与可编辑区域"],
  reference_analysis: ["提取灵感", "把喜欢拆成可迁移的设计语言"],
  constraint_filter: ["过滤约束", "排除超预算或不适合的组合"],
  matching: ["匹配商品", "寻找能落到真实空间里的物品"],
  planning: ["编排方案", "生成摆放逻辑与执行顺序"],
  rendering: ["准备效果", "正在生成焕新前后示意"],
  validation: ["可信校验", "复核预算、安装与空间适配"],
  packaging: ["保存方案", "正在归档本次焕新版本"]
};

const elements = {
  app: document.getElementById("renewalApp"),
  coreCard: document.getElementById("coreCard"),
  heading: document.getElementById("coreHeading"),
  subheading: document.getElementById("coreSubheading"),
  inspiration: document.getElementById("inspirationBar"),
  space: document.getElementById("spacePicker"),
  constraints: document.getElementById("constraintBar"),
  generate: document.getElementById("generateArea"),
  progress: document.getElementById("progressArea"),
  result: document.getElementById("resultArea"),
  assetDrawer: document.getElementById("assetDrawer"),
  assetContent: document.getElementById("assetDrawerContent"),
  historyDrawer: document.getElementById("historyDrawer"),
  historyContent: document.getElementById("historyDrawerContent"),
  dialog: document.getElementById("renewalDialogLayer"),
  toast: document.getElementById("renewalToast"),
  loading: document.getElementById("renewalLoading"),
  status: document.getElementById("backendStatus"),
  fileInput: document.getElementById("spaceFileInput")
};

let pollTimer = null;
let pollController = null;
let pollFailures = 0;
let videoReferencePromise = null;
let preferredAssetTab = "inspiration";
let productDiscoveryPollTimer = null;
let productDiscoveryPollController = null;
let productDiscoveryPollStartedAt = 0;
let productDiscoveryPollFailures = 0;
const viewedProductDiscoveryRuns = new Set();

const inspirationBar = new InspirationBar(elements.inspiration, {
  onOpenAssets: (tab) => openDrawer("asset", tab)
});
const spacePicker = new SpacePicker(elements.space, {
  onSelect: selectSpace,
  onUpload: () => elements.fileInput?.click(),
  onConfirm: confirmSelectedSpace
});
const constraintBar = new ConstraintBar(elements.constraints, {
  onChange: (constraints) => {
    update({ constraints });
    persistDraft();
  }
});
const assetDrawer = new AssetDrawer(elements.assetContent, {
  onSelect: selectAsset
});
const historyDrawer = new HistoryDrawer(elements.historyContent, {
  onSelect: loadPlanVersionIntoCore
});
const resultSection = new ResultSection(elements.result, {
  onBudget: openBudgetDialog,
  onStyle: openStyleDialog,
  onCancel: cancelActiveProductDiscovery,
  onRetry: retryProductDiscovery,
  onOfflineDemo: enterOfflineProductDiscoveryDemo,
  onCommerceAction: handleCommerceAction
});

function errorMessage(error, fallback = "操作失败，请稍后重试") {
  return mapError(error)?.message || error?.message || fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBusy(state = getState()) {
  return ["GENERATING", "ADJUSTING"].includes(state.coreState);
}

function bindGlobalState() {
  subscribe((state) => {
    elements.toast.textContent = state.ui.toast || "";
    elements.toast.classList.toggle("show", Boolean(state.ui.toast));
    elements.loading.classList.toggle("show", Boolean(state.ui.loading));
    elements.loading.setAttribute("aria-hidden", String(!state.ui.loading));
    render(state);
  });
}

function render(state = getState()) {
  const busy = isBusy(state);
  elements.coreCard.dataset.coreState = state.coreState;
  elements.heading.textContent =
    state.coreState === "RESULT_READY"
      ? "这一角，已经有答案了。"
      : busy
        ? state.coreState === "ADJUSTING"
          ? "正在把方案调得更像你。"
          : "喜欢正在变成可执行的方案。"
        : "今天，想焕新哪一角？";
  elements.subheading.textContent =
    state.coreState === "RESULT_READY"
      ? "拖动查看前后变化，也可以继续调预算与风格。"
      : busy
        ? "可以留在这里看进度，历史方案不会被覆盖。"
        : "选好空间和预算，剩下的交给 AI。";

  inspirationBar.render({
    videoContext: state.videoEntryContext,
    selectedInspiration: state.selectedInspiration,
    readonly: busy
  });
  spacePicker.render({
    spaces: state.spaces,
    selectedSpace: state.selectedSpace,
    readonly: busy
  });
  constraintBar.render({ constraints: state.constraints, readonly: busy });
  renderGenerateArea(state);

  elements.progress.hidden = !busy;
  if (busy) renderProgress(state.currentGenerationRun);
  elements.result.hidden =
    state.coreState !== "RESULT_READY" || !state.currentPlanVersion;
  if (!elements.result.hidden) {
    resultSection.render(
      state.currentPlanVersion,
      state.productDiscovery.viewModel
    );
  }

  assetDrawer.render({
    assets: state.assets,
    preferredTab: preferredAssetTab
  });
  historyDrawer.render({ plans: state.plans });
}

function renderGenerateArea(state) {
  if (isBusy(state) || state.coreState === "RESULT_READY") {
    elements.generate.innerHTML = "";
    return;
  }
  const selected = state.selectedSpace;
  const sealed = selected?.spaceVersionState === "sealed";
  const helper = !state.backendConnected
    ? "服务未连接，暂时不能生成"
    : !selected
      ? "先选择或上传一个真实空间"
      : !sealed
        ? "请先确认空间识别结果"
        : `按 ${formatMoney(state.constraints.budget_cny)} 预算生成，可随时继续调整`;
  elements.generate.innerHTML = `
    <button class="primary-action" type="button" data-generate ${
      state.backendConnected && selected && sealed ? "" : "disabled"
    }>
      <span>生成我的焕新方案</span>
      <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
    </button>
    <p class="action-help">${escapeHtml(helper)}</p>`;
  elements.generate
    .querySelector("[data-generate]")
    ?.addEventListener("click", startGeneration);
}

function renderProgress(run = {}) {
  const [title, copy] =
    PHASES[run?.phase] ||
    (run?.status === "queued"
      ? ["正在排队", "很快就会开始理解你的空间"]
      : ["处理中", "正在整理这一角的可执行方案"]);
  const total = Number(run?.phase_total || 9);
  const current = Number(run?.phase_index || 1);
  const percent = Math.max(7, Math.min(100, (current / total) * 100));
  elements.progress.innerHTML = `
    <div class="generation-panel">
      <span class="progress-kicker">${getState().coreState === "ADJUSTING" ? "REFINING" : "MAKING YOUR PLAN"}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
      <div class="progress-track"><span style="width:${percent}%"></span></div>
      <div class="progress-meta"><span>${Math.round(percent)}%</span><span>${escapeHtml(run?.status || "queued")}</span></div>
      <button class="secondary-action" type="button" data-cancel>取消本次生成</button>
    </div>`;
  elements.progress
    .querySelector("[data-cancel]")
    ?.addEventListener("click", cancelActiveRun);
}

async function checkBackendHealth() {
  try {
    const health = await checkHealth();
    setBackendHealth(health);
    elements.status.classList.add("is-online");
    elements.status.classList.remove("is-offline");
    elements.status.querySelector("span").textContent = "在线";
    return health;
  } catch {
    setBackendHealth(null);
    elements.status.classList.remove("is-online");
    elements.status.classList.add("is-offline");
    elements.status.querySelector("span").textContent = "离线";
    return null;
  }
}

async function loadAssetsIntoState() {
  try {
    const response = await listAssets({ sort: "recent", limit: 30 });
    const assets = adaptAssets(response.items || response || []);
    const spaces = assets.filter((asset) => asset.type === "space");
    update({
      assets,
      spaces,
      inspirations: assets.filter((asset) => asset.type === "inspiration"),
      items: assets.filter((asset) => asset.type === "item")
    });
    const state = getState();
    if (!state.selectedSpace && spaces.length) {
      const draftId = state.designTaskDraft?.space_asset_id;
      const candidate =
        spaces.find((space) => space.assetId === draftId) ||
        spaces.find((space) => space.spaceVersionState === "sealed") ||
        spaces[0];
      await selectSpace(candidate.assetId, { quiet: true });
    }
  } catch (error) {
    console.error("Load assets failed:", error);
    showToast(errorMessage(error, "收藏读取失败"));
  }
}

async function selectSpace(assetId, { quiet = false } = {}) {
  try {
    stopProductDiscoveryPolling();
    const detail = await getAsset(assetId);
    const selectedSpace = {
      ...adaptAsset(detail),
      accessUrl: detail.preview?.url || detail.access_url || null,
      spaceVersionState: detail.current_space_version?.state || null,
      spaceVersionResourceVersion:
        detail.current_space_version?.resource_version || 1,
      editableRegionId:
        detail.attributes?.selected_editable_region_id ||
        detail.attributes?.editable_regions?.[0]?.editable_region_id ||
        null,
      raw: detail
    };
    update({ selectedSpace, coreState: "IDLE", currentPlanVersion: null });
    persistDraft();
    closeDrawers();
    if (!quiet) showToast(`已选择「${selectedSpace.name || "我的空间"}」`);
    return selectedSpace;
  } catch (error) {
    showToast(errorMessage(error, "空间读取失败"));
    return null;
  }
}

function selectAsset(asset) {
  if (!asset) return;
  if (asset.type === "space") {
    selectSpace(asset.assetId);
    return;
  }
  update({ selectedInspiration: asset, coreState: "IDLE" });
  persistDraft();
  closeDrawers();
  showToast(`已加入「${asset.name || "这份灵感"}」`);
}

function persistDraft() {
  const state = getState();
  if (!state.selectedSpace) return;
  const previous = state.designTaskDraft || {};
  saveDesignTaskDraft({
    ...previous,
    trigger:
      state.videoEntryContext || state.selectedInspiration
        ? "video_apply"
        : "space_reuse",
    space_asset_id: state.selectedSpace.assetId,
    space_version_id: state.selectedSpace.currentSpaceVersionId,
    space_name: state.selectedSpace.name,
    space_sealed: state.selectedSpace.spaceVersionState === "sealed",
    space_parse_state: state.selectedSpace.parseState,
    space_version_resource_version:
      state.selectedSpace.spaceVersionResourceVersion,
    editable_region_id: state.selectedSpace.editableRegionId,
    reference_asset_ids: state.selectedInspiration?.assetId
      ? [state.selectedInspiration.assetId]
      : previous.reference_asset_ids || [],
    goal:
      state.constraints.user_note ||
      previous.goal ||
      DEFAULT_GOAL,
    goal_codes: previous.goal_codes || ["organization", "ambient_lighting"],
    constraints: {
      budget_cny: state.constraints.budget_cny,
      no_drilling: state.constraints.no_drilling,
      keep_detected_object_ids:
        state.constraints.keep_detected_object_ids || [],
      pet_context: state.constraints.pet_context
    },
    updatedAt: Date.now()
  });
}

async function handleSpaceFile(file) {
  if (!file) return;
  const health = getState().backendHealth || (await checkBackendHealth());
  if (!health) {
    showToast("服务未连接，暂时无法上传空间");
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("仅支持 JPEG、PNG 或 WebP");
    return;
  }
  const maxBytes = health.limits?.upload_file_bytes || DEFAULT_UPLOAD_LIMIT;
  if (file.size > maxBytes) {
    showToast(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
    return;
  }
  try {
    setLoading(true);
    const media = await uploadMedia(file, { purpose: "space_source" });
    const created = await createAsset({
      schema_version: "1.0",
      asset_type: "space",
      lifecycle: "temporary",
      media_ids: [media.media_id],
      provenance: { kind: "upload" },
      attributes: {
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 100) || "我的空间",
        scene_type: "desk_corner",
        reference_width_cm: 120,
        default_budget_cny: getState().constraints.budget_cny,
        long_term_constraints: getState().constraints.no_drilling
          ? ["no_drilling"]
          : []
      }
    });
    const detail = await waitForAssetParse(created.asset_id);
    if (detail.parse_state === "failed") {
      throw new Error(detail.latest_parse_run?.error?.message || "空间解析失败");
    }
    await loadAssetsIntoState();
    await selectSpace(created.asset_id, { quiet: true });
    showToast("空间识别完成，请确认后生成方案");
  } catch (error) {
    console.error("Space upload failed:", error);
    showToast(errorMessage(error, "空间上传失败"));
  } finally {
    elements.fileInput.value = "";
    setLoading(false);
  }
}

async function waitForAssetParse(assetId) {
  for (let attempt = 0; attempt < PARSE_POLL_ATTEMPTS; attempt += 1) {
    const detail = await getAsset(assetId);
    if (["needs_confirmation", "ready", "failed"].includes(detail.parse_state)) {
      return detail;
    }
    await delay(PARSE_POLL_INTERVAL_MS);
  }
  throw new Error("空间解析超时，请稍后从收藏中重试");
}

async function confirmSelectedSpace() {
  const selected = getState().selectedSpace;
  if (!selected?.currentSpaceVersionId) {
    showToast("空间版本信息不完整");
    return;
  }
  try {
    setLoading(true);
    await confirmSpaceVersion(
      selected.assetId,
      selected.currentSpaceVersionId,
      { seal: true },
      selected.spaceVersionResourceVersion || 1
    );
    await loadAssetsIntoState();
    await selectSpace(selected.assetId, { quiet: true });
    showToast("空间已确认，可以生成方案了");
  } catch (error) {
    showToast(errorMessage(error, "确认空间失败"));
  } finally {
    setLoading(false);
  }
}

async function ensureVideoReferenceAsset() {
  const context = getState().videoEntryContext;
  if (!context) return null;
  if (context.reference_asset_id) return context.reference_asset_id;
  if (videoReferencePromise) return videoReferencePromise;
  videoReferencePromise = createAsset({
    schema_version: "1.0",
    asset_type: "inspiration",
    lifecycle: "temporary",
    media_ids: [],
    provenance: {
      kind: "video_context",
      provider: context.provider || "douyin_static_demo",
      external_content_id:
        context.external_content_id || context.video_id || "video-demo",
      author_display: context.author_display || "视频作者",
      timestamp_ms: Number.isInteger(context.timestamp_ms)
        ? context.timestamp_ms
        : 0,
      ...(context.selection_bbox
        ? { selection_bbox: context.selection_bbox }
        : {})
    },
    attributes: {
      name: (context.name || "视频家居灵感").slice(0, 100),
      inspiration_scope: "overall",
      user_note: (context.caption || "来自短视频的家居灵感").slice(0, 500)
    }
  })
    .then((asset) => asset.asset_id)
    .finally(() => {
      videoReferencePromise = null;
    });
  return videoReferencePromise;
}

async function startGeneration() {
  const state = getState();
  if (!state.backendConnected || !state.selectedSpace) return;
  if (state.selectedSpace.spaceVersionState !== "sealed") {
    showToast("请先确认空间识别结果");
    return;
  }
  try {
    setLoading(true);
    const videoReferenceId = await ensureVideoReferenceAsset();
    const referenceIds = [
      state.selectedInspiration?.assetId,
      videoReferenceId
    ].filter(Boolean);
    const request = buildDesignRequest({
      trigger:
        state.videoEntryContext || referenceIds.length
          ? "video_apply"
          : "space_reuse",
      space_asset_id: state.selectedSpace.assetId,
      space_version_id: state.selectedSpace.currentSpaceVersionId,
      reference_asset_ids: [...new Set(referenceIds)],
      goal: state.constraints.user_note || DEFAULT_GOAL,
      goal_codes: ["organization", "ambient_lighting"],
      constraints: {
        budget_cny: state.constraints.budget_cny,
        no_drilling: state.constraints.no_drilling,
        keep_detected_object_ids:
          state.constraints.keep_detected_object_ids || [],
        pet_context: state.constraints.pet_context
      },
      editable_region_id: state.selectedSpace.editableRegionId,
      options: { analysis_mode: "auto", include_trace: true }
    });
    const designRequest = await createDesignRequest(request);
    if (!designRequest.can_start_generation) {
      const issue = designRequest.missing_fields?.find((item) => item.blocking);
      throw new Error(issue?.message || "还需要补充任务信息");
    }
    const run = await createGenerationRun(designRequest.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    update({ coreState: "GENERATING", currentPlanVersion: null });
    startGenerationPolling(run.generation_run_id, "GENERATING");
  } catch (error) {
    console.error("Start generation failed:", error);
    showToast(errorMessage(error, "方案生成启动失败"));
  } finally {
    setLoading(false);
  }
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  pollController?.abort();
  pollController = null;
}

function stopProductDiscoveryPolling() {
  if (productDiscoveryPollTimer) clearTimeout(productDiscoveryPollTimer);
  productDiscoveryPollTimer = null;
  productDiscoveryPollController?.abort();
  productDiscoveryPollController = null;
}

function productDiscoveryFeatureAvailable() {
  return getState().backendHealth?.features?.product_discovery === true;
}

function productDiscoveryErrorViewModel(plan, error, runId = null) {
  return {
    ...createUnavailableProductDiscoveryViewModel(
      errorMessage(error, "商品发现连接中断，请重新连接。")
    ),
    runId,
    planAssetId: plan.planAssetId,
    planVersionId: plan.planVersionId,
    status: "failed",
    sourceBadge: "连接中断",
    description: "没有切换到 Demo；你可以重新连接后继续当前运行。",
    errorMessage: errorMessage(error, "商品发现连接中断"),
    canRetry: true
  };
}

function applyProductDiscoveryRun(run, contextId, deliveryMode = "api") {
  const viewModel = adaptProductDiscoveryRun(run, { deliveryMode });
  const applied = applyProductDiscoveryViewModel(contextId, viewModel);
  if (!applied) return false;
  persistProductDiscoveryResume({
    planAssetId: viewModel.planAssetId,
    planVersionId: viewModel.planVersionId,
    runId: viewModel.runId
  });
  if (
    deliveryMode === "api" &&
    viewModel.runId &&
    !viewedProductDiscoveryRuns.has(viewModel.runId) &&
    ["ready", "partial", "empty"].includes(viewModel.status)
  ) {
    viewedProductDiscoveryRuns.add(viewModel.runId);
    emitProductDiscoveryEvent("product_discovery_section_viewed", {
      plan_version_id: viewModel.planVersionId,
      product_discovery_run_id: viewModel.runId
    });
  }
  return true;
}

async function initializeProductDiscovery(plan, { force = false } = {}) {
  if (!plan?.planAssetId || !plan?.planVersionId) return;
  const current = getState().productDiscovery;
  if (!force && current.planVersionId === plan.planVersionId && current.contextId) {
    return;
  }
  stopProductDiscoveryPolling();
  const contextId = beginProductDiscoveryContext(plan.planAssetId, plan.planVersionId);
  persistProductDiscoveryResume({
    planAssetId: plan.planAssetId,
    planVersionId: plan.planVersionId,
    runId: null
  });

  if (!plan.afterImage) {
    const viewModel = {
      ...createUnavailableProductDiscoveryViewModel("当前版本没有可用的 after 图，无法发现商品。"),
      planAssetId: plan.planAssetId,
      planVersionId: plan.planVersionId,
      sourceBadge: "效果图不可用"
    };
    applyProductDiscoveryViewModel(contextId, viewModel);
    return;
  }
  if (!productDiscoveryFeatureAvailable()) {
    const viewModel = {
      ...createUnavailableProductDiscoveryViewModel("后端尚未声明商品发现能力。"),
      planAssetId: plan.planAssetId,
      planVersionId: plan.planVersionId
    };
    applyProductDiscoveryViewModel(contextId, viewModel);
    return;
  }

  updateProductDiscoveryForContext(contextId, { polling: true });
  try {
    const response = await listProductDiscoveryRuns(
      plan.planAssetId,
      plan.planVersionId,
      { sort: "recent", limit: 1 }
    );
    if (!isCurrentProductDiscoveryContext(contextId, plan.planVersionId)) return;
    const latest = response.items?.[0] || null;
    if (!latest) {
      const run = await createProductDiscoveryRun(plan.planAssetId, plan.planVersionId);
      if (!applyProductDiscoveryRun(run, contextId)) return;
      startProductDiscoveryPolling(run.product_discovery_run_id, contextId, plan);
      return;
    }
    const run = await getProductDiscoveryRun(latest.product_discovery_run_id);
    if (!applyProductDiscoveryRun(run, contextId)) return;
    if (["queued", "running"].includes(run.status)) {
      startProductDiscoveryPolling(run.product_discovery_run_id, contextId, plan);
    } else {
      updateProductDiscoveryForContext(contextId, { polling: false });
    }
  } catch (error) {
    if (!isCurrentProductDiscoveryContext(contextId, plan.planVersionId)) return;
    applyProductDiscoveryViewModel(
      contextId,
      productDiscoveryErrorViewModel(plan, error, getState().productDiscovery.runId)
    );
    updateProductDiscoveryForContext(contextId, {
      polling: false,
      reconnectRequired: true
    });
  }
}

function startProductDiscoveryPolling(runId, contextId, plan) {
  stopProductDiscoveryPolling();
  productDiscoveryPollController = new AbortController();
  productDiscoveryPollStartedAt = Date.now();
  productDiscoveryPollFailures = 0;
  updateProductDiscoveryForContext(contextId, { runId, polling: true });

  const poll = async () => {
    if (!isCurrentProductDiscoveryContext(contextId, plan.planVersionId)) return;
    if (document.hidden) {
      updateProductDiscoveryForContext(contextId, { polling: false });
      return;
    }
    try {
      const run = await getProductDiscoveryRun(runId, {
        signal: productDiscoveryPollController.signal
      });
      if (!applyProductDiscoveryRun(run, contextId)) return;
      productDiscoveryPollFailures = 0;
      if (!["queued", "running"].includes(run.status)) {
        stopProductDiscoveryPolling();
        updateProductDiscoveryForContext(contextId, { polling: false });
        return;
      }
      const elapsed = Date.now() - productDiscoveryPollStartedAt;
      productDiscoveryPollTimer = setTimeout(poll, elapsed < 10_000 ? 800 : 1500);
    } catch (error) {
      if (error.name === "AbortError") return;
      productDiscoveryPollFailures += 1;
      if (productDiscoveryPollFailures >= 3) {
        stopProductDiscoveryPolling();
        applyProductDiscoveryViewModel(
          contextId,
          productDiscoveryErrorViewModel(plan, error, runId)
        );
        updateProductDiscoveryForContext(contextId, {
          polling: false,
          reconnectRequired: true
        });
        return;
      }
      productDiscoveryPollTimer = setTimeout(poll, 1500);
    }
  };
  poll();
}

async function retryProductDiscovery(reason, currentViewModel) {
  const plan = getState().currentPlanVersion;
  if (!plan) return;
  if (getState().productDiscovery.reconnectRequired && currentViewModel?.runId) {
    const contextId = beginProductDiscoveryContext(plan.planAssetId, plan.planVersionId);
    startProductDiscoveryPolling(currentViewModel.runId, contextId, plan);
    return;
  }
  if (!productDiscoveryFeatureAvailable()) {
    await checkBackendHealth();
    if (!productDiscoveryFeatureAvailable()) {
      showToast("后端尚未开放商品发现接口，没有切换到 Demo");
      return;
    }
  }
  stopProductDiscoveryPolling();
  const contextId = beginProductDiscoveryContext(plan.planAssetId, plan.planVersionId);
  updateProductDiscoveryForContext(contextId, { polling: true });
  try {
    const body = {
      schema_version: "1.0",
      reason: reason === "refresh" ? "refresh" : "retry",
      ...(reason === "refresh" || !currentViewModel?.runId
        ? {}
        : { retry_of_product_discovery_run_id: currentViewModel.runId }),
      options: {
        discovery_mode: "auto",
        max_subjects: 6,
        matches_per_subject: 3
      }
    };
    const run = await createProductDiscoveryRun(
      plan.planAssetId,
      plan.planVersionId,
      body
    );
    if (!applyProductDiscoveryRun(run, contextId)) return;
    emitProductDiscoveryEvent("product_discovery_retry_requested", {
      plan_version_id: plan.planVersionId,
      product_discovery_run_id: run.product_discovery_run_id
    });
    startProductDiscoveryPolling(run.product_discovery_run_id, contextId, plan);
  } catch (error) {
    applyProductDiscoveryViewModel(contextId, productDiscoveryErrorViewModel(plan, error));
  }
}

async function cancelActiveProductDiscovery() {
  const current = getState().productDiscovery;
  if (!current.runId || current.deliveryMode !== "api") return;
  try {
    const run = await cancelProductDiscoveryRun(current.runId);
    stopProductDiscoveryPolling();
    applyProductDiscoveryRun(run, current.contextId);
    updateProductDiscoveryForContext(current.contextId, { polling: false });
  } catch (error) {
    showToast(errorMessage(error, "取消商品识别失败"));
  }
}

async function enterOfflineProductDiscoveryDemo() {
  const plan = getState().currentPlanVersion;
  if (!plan) return;
  stopProductDiscoveryPolling();
  const contextId = beginProductDiscoveryContext(plan.planAssetId, plan.planVersionId, {
    deliveryMode: "offline_fixture"
  });
  try {
    const runningFixture = await loadProductDiscoveryFixture("running");
    const running = {
      ...runningFixture,
      plan_asset_id: plan.planAssetId,
      plan_version_id: plan.planVersionId
    };
    applyProductDiscoveryRun(running, contextId, "offline_fixture");
    await delay(800);
    if (!isCurrentProductDiscoveryContext(contextId, plan.planVersionId)) return;
    const readyFixture = await loadProductDiscoveryFixture("ready");
    const ready = {
      ...readyFixture,
      plan_asset_id: plan.planAssetId,
      plan_version_id: plan.planVersionId
    };
    applyProductDiscoveryRun(ready, contextId, "offline_fixture");
    updateProductDiscoveryForContext(contextId, { polling: false });
  } catch (error) {
    applyProductDiscoveryViewModel(
      contextId,
      productDiscoveryErrorViewModel(plan, error)
    );
  }
}

async function handleCommerceAction(action, subject, match, viewModel) {
  if (!action || action.disabled) return;
  let eventName = "commerce_match_clicked";
  if (action.type === "search_query") {
    try {
      await navigator.clipboard.writeText(action.query);
      showToast("搜索词已复制，打开抖音即可搜索");
      eventName = "commerce_search_copied";
    } catch {
      showToast("浏览器无法复制搜索词，请稍后重试");
      return;
    }
  } else if (action.type === "web_url") {
    const opened = window.open(action.url, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
  } else if (action.type === "douyin_deeplink") {
    const bridge = globalThis.DouyinJSBridge;
    if (typeof bridge?.invoke !== "function") {
      showToast("请在抖音内打开后购买");
      return;
    }
    bridge.invoke("openSchema", { schema: action.url });
  } else {
    eventName = "commerce_action_unavailable";
    showToast(action.label || "暂不可购买");
  }
  if (viewModel.deliveryMode !== "offline_fixture") {
    emitProductDiscoveryEvent(eventName, {
      plan_version_id: viewModel.planVersionId,
      product_discovery_run_id: viewModel.runId,
      subject_id: subject.id,
      match_id: match.id,
      product_id: match.productId,
      commerce_action_type: action.type,
      source_type: match.sourceType
    });
  }
}

function emitProductDiscoveryEvent(eventName, values) {
  sendEventsBatch([buildProductDiscoveryEvent(eventName, values)]).catch(() => {
    // 事件失败不影响购买动作；后端尚未接入新事件名时也不降级或重放自由文本。
  });
}

function startGenerationPolling(generationRunId, coreState) {
  stopPolling();
  pollController = new AbortController();
  pollFailures = 0;
  setGenerationRun(
    { generation_run_id: generationRunId, status: "queued", phase: "input_validation" },
    pollController
  );
  update({ coreState });

  const poll = async () => {
    try {
      const run = await getGenerationRun(generationRunId, {
        signal: pollController.signal
      });
      if (getState().currentGenerationRun?.generation_run_id !== generationRunId) return;
      setGenerationRun(run, pollController);
      if (run.status === "succeeded") {
        stopPolling();
        const envelope = run.result?.plan_version
          ? {
              plan_asset_id: run.result.plan_asset_id,
              plan_resource_version: run.result.plan_resource_version,
              plan_version: run.result.plan_version
            }
          : null;
        if (!envelope) {
          cancelGeneration();
          update({ coreState: "IDLE" });
          showToast("生成完成，但方案版本缺失");
          return;
        }
        const planViewModel = adaptPlanResult(envelope);
        update({
          coreState: "RESULT_READY",
          currentPlanVersion: planViewModel
        });
        initializeProductDiscovery(planViewModel);
        showToast("方案已生成，并保存到历史方案");
        loadPlansIntoState();
        return;
      }
      if (["failed", "cancelled"].includes(run.status)) {
        stopPolling();
        cancelGeneration();
        update({ coreState: "IDLE" });
        showToast(
          run.status === "cancelled"
            ? "已取消本次生成"
            : run.error?.message || "方案生成失败"
        );
        return;
      }
      pollFailures = 0;
      pollTimer = setTimeout(poll, 900);
    } catch (error) {
      if (error.name === "AbortError") return;
      pollFailures += 1;
      if (pollFailures >= 5) {
        stopPolling();
        update({ coreState: "IDLE" });
        showToast(errorMessage(error, "生成进度连接中断"));
        return;
      }
      pollTimer = setTimeout(poll, 1600);
    }
  };
  poll();
}

async function cancelActiveRun() {
  const runId = getState().currentGenerationRun?.generation_run_id;
  if (!runId) return;
  try {
    await cancelGenerationRun(runId);
  } catch (error) {
    showToast(errorMessage(error, "取消失败"));
    return;
  }
  stopPolling();
  cancelGeneration();
  update({ coreState: "IDLE" });
  showToast("已取消本次生成");
}

async function loadPlansIntoState() {
  historyDrawer.render({ loading: true });
  try {
    const response = await listPlans({ limit: 30 });
    update({ plans: response.items || response || [] });
  } catch (error) {
    historyDrawer.render({ error: errorMessage(error, "历史方案读取失败") });
  }
}

async function loadPlanVersionIntoCore(planAssetId, planVersionId) {
  try {
    setLoading(true);
    let actualVersionId = planVersionId;
    if (!actualVersionId || actualVersionId === "latest") {
      actualVersionId = (await getPlan(planAssetId)).current_plan_version_id;
    }
    const envelope = await getPlanVersion(planAssetId, actualVersionId);
    const planViewModel = adaptPlanResult(envelope);
    update({
      currentPlanVersion: planViewModel,
      coreState: "RESULT_READY"
    });
    await initializeProductDiscovery(planViewModel, { force: true });
    closeDrawers();
    elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showToast(errorMessage(error, "方案读取失败"));
  } finally {
    setLoading(false);
  }
}

function openBudgetDialog(viewModel) {
  const suggested = Math.max(
    100,
    Math.floor(Math.min(viewModel.totalPriceCny || 500, getState().constraints.budget_cny) / 50 - 1) * 50
  );
  openDialog(`
    <h3>把预算再压低一点</h3>
    <p>会基于当前方案生成新版本，原方案仍保留在历史记录里。</p>
    <label>目标预算（元）<input type="number" min="100" step="50" value="${suggested}" data-budget /></label>
    <div class="renewal-dialog__actions"><button class="secondary-action" type="button" data-dialog-close>取消</button><button class="primary-action" type="button" data-dialog-submit>生成省钱版</button></div>
  `, () => {
    const value = Number(elements.dialog.querySelector("[data-budget]").value);
    if (!Number.isInteger(value) || value < 100) {
      showToast("请输入不低于 100 元的预算");
      return false;
    }
    reviseCurrentPlan({
      type: "reduce_budget",
      target_budget_cny: value
    });
    return true;
  });
}

function openStyleDialog() {
  openDialog(`
    <h3>换一种空间感觉</h3>
    <p>空间和硬性限制保持不变，只调整色彩与材质方向。</p>
    <label>风格方向<select data-style><option value="green">自然绿意</option><option value="warm">温暖木质</option><option value="compact">轻巧留白</option></select></label>
    <div class="renewal-dialog__actions"><button class="secondary-action" type="button" data-dialog-close>取消</button><button class="primary-action" type="button" data-dialog-submit>生成新版本</button></div>
  `, () => {
    reviseCurrentPlan({
      type: "change_style",
      style_key: elements.dialog.querySelector("[data-style]").value,
      reference_asset_ids: getState().selectedInspiration?.assetId
        ? [getState().selectedInspiration.assetId]
        : []
    });
    return true;
  });
}

async function reviseCurrentPlan(action) {
  const plan = getState().currentPlanVersion;
  if (!plan?.planAssetId || !plan?.planVersionId) {
    showToast("当前方案不能继续调节");
    return;
  }
  closeDialog();
  try {
    const run = await createPlanRevision(plan.planAssetId, {
      schema_version: "1.0",
      parent_plan_version_id: plan.planVersionId,
      action
    });
    update({ coreState: "ADJUSTING" });
    startGenerationPolling(run.generation_run_id, "ADJUSTING");
  } catch (error) {
    update({ coreState: "RESULT_READY" });
    showToast(errorMessage(error, "新版本生成失败"));
  }
}

function openDialog(content, onSubmit) {
  elements.dialog.innerHTML = `<div class="renewal-dialog" role="dialog" aria-modal="true">${content}</div>`;
  elements.dialog.classList.add("is-open");
  elements.dialog.setAttribute("aria-hidden", "false");
  elements.dialog
    .querySelector("[data-dialog-close]")
    ?.addEventListener("click", closeDialog);
  elements.dialog
    .querySelector("[data-dialog-submit]")
    ?.addEventListener("click", () => {
      if (onSubmit?.() !== false) closeDialog();
    });
}

function closeDialog() {
  elements.dialog.classList.remove("is-open");
  elements.dialog.setAttribute("aria-hidden", "true");
  elements.dialog.innerHTML = "";
}

function openDrawer(kind, tab) {
  closeDrawers();
  if (kind === "asset") {
    preferredAssetTab = tab || preferredAssetTab;
    assetDrawer.render({ assets: getState().assets, preferredTab: preferredAssetTab });
    elements.assetDrawer.classList.add("is-open");
    elements.assetDrawer.setAttribute("aria-hidden", "false");
  } else {
    elements.historyDrawer.classList.add("is-open");
    elements.historyDrawer.setAttribute("aria-hidden", "false");
    loadPlansIntoState();
  }
  update({ ui: { ...getState().ui, drawerOpen: kind } });
}

function closeDrawers() {
  [elements.assetDrawer, elements.historyDrawer].forEach((drawer) => {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  });
  if (getState().ui.drawerOpen) {
    update({ ui: { ...getState().ui, drawerOpen: null } });
  }
}

function bindStaticEvents() {
  document.getElementById("renewalBack")?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
  document
    .getElementById("openAssetDrawer")
    ?.addEventListener("click", () => openDrawer("asset", "inspiration"));
  document
    .getElementById("openHistoryDrawer")
    ?.addEventListener("click", () => openDrawer("history"));
  document.querySelectorAll("[data-close-drawer]").forEach((button) =>
    button.addEventListener("click", closeDrawers)
  );
  elements.fileInput?.addEventListener("change", (event) =>
    handleSpaceFile(event.target.files?.[0])
  );
  elements.status?.addEventListener("click", checkBackendHealth);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDialog();
      closeDrawers();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (getState().productDiscovery.polling) {
        stopProductDiscoveryPolling();
        updateProductDiscoveryForContext(
          getState().productDiscovery.contextId,
          { polling: false }
        );
      }
      return;
    }
    const current = getState().productDiscovery;
    const plan = getState().currentPlanVersion;
    if (
      plan &&
      current.runId &&
      ["queued", "analyzing"].includes(current.status) &&
      current.deliveryMode === "api"
    ) {
      startProductDiscoveryPolling(current.runId, current.contextId, plan);
    }
  });
}

function hydrateStoredDraft(draft) {
  if (!draft?.constraints) return;
  update({
    constraints: {
      ...getState().constraints,
      ...draft.constraints,
      rental:
        draft.constraints.rental ??
        draft.constraints.no_drilling ??
        true,
      user_note:
        draft.constraints.user_note ||
        draft.goal ||
        ""
    }
  });
}

function setDeviceTime() {
  const node = document.getElementById("deviceTime");
  if (!node) return;
  node.textContent = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

async function init() {
  bindGlobalState();
  bindStaticEvents();
  setDeviceTime();
  const draft = loadDesignTaskDraft();
  const videoContext = loadVideoEntryContext();
  hydrateStoredDraft(draft);
  update({ videoEntryContext: videoContext });
  const startup = getStartupContext(videoContext);
  await checkBackendHealth();
  if (getState().backendConnected) {
    await loadAssetsIntoState();
    await loadPlansIntoState();
  }
  if (startup.planAssetId) {
    await loadPlanVersionIntoCore(
      startup.planAssetId,
      startup.planVersionId || "latest"
    );
  } else if (startup.drawer) {
    openDrawer(startup.drawer);
  } else if (startup.requestUpload) {
    elements.fileInput?.click();
  } else {
    const resume = loadProductDiscoveryResume();
    if (resume?.planAssetId && resume?.planVersionId) {
      await loadPlanVersionIntoCore(resume.planAssetId, resume.planVersionId);
    }
  }
  render();
}

init();

export {
  init,
  handleSpaceFile,
  selectSpace,
  startGeneration,
  loadPlanVersionIntoCore
};
