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
  setVideoEntryContext,
  setBackendHealth,
  setGenerationRun,
  cancelGeneration,
  beginProductDiscoveryContext,
  applyProductDiscoveryViewModel,
  updateProductDiscoveryForContext,
  isCurrentProductDiscoveryContext,
  persistProductDiscoveryResume,
  loadProductDiscoveryResume,
  // V2.1 正交 slice 与 epoch 守卫
  beginDesignContext,
  setDesignRequestIdForEpoch,
  isCurrentDesignContext,
  updateGeneration,
  updateGenerationForContext,
  updateRelatedDesigns,
  updateRelatedDesignsForContext,
  updateEntry,
  setConfirmedIntent,
  updatePublication,
  resetPublication,
  updateImplementation,
  resetImplementation,
  persistDesignContextResume,
  loadDesignContextResume,
  hasCapability,
  V2_CAPABILITIES
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
  updatePlan,
  sendEventsBatch
} from "../api/v1-client.js";
import {
  cancelProductDiscoveryRun,
  createProductDiscoveryRun,
  getProductDiscoveryRun,
  listProductDiscoveryRuns,
  loadProductDiscoveryFixture
} from "../api/product-discovery-client.js";
import {
  createRelatedDesignRun,
  listRelatedDesignRuns,
  getRelatedDesignRun,
  cancelRelatedDesignRun
} from "../api/related-design-client.js";
import { confirmInspirationIntent } from "../api/intent-confirmation-client.js";
import {
  createPublication,
  getPublication,
  withdrawPublication
} from "../api/publication-client.js";
import { createCartIntent } from "../api/cart-intent-client.js";
import { checkHealth } from "../api/legacy-client.js";
import {
  mapError,
  isErrorCode,
  V2_ERROR_CODES,
  extractRetryAfterMs
} from "../api/http-client.js";
import {
  adaptAsset,
  adaptAssets,
  adaptDesignReference
} from "../adapters/asset-view-model.js";
import { adaptPlanResult } from "../adapters/plan-version-view-model.js";
import {
  adaptProductDiscoveryRun,
  createUnavailableProductDiscoveryViewModel
} from "../adapters/product-discovery-view-model.js";
import {
  buildDesignRequest,
  buildV2DesignRequest
} from "../adapters/design-task-builder.js";
import { adaptInspirationIntent } from "../adapters/inspiration-intent-view-model.js";
import { adaptRelatedDesignRun } from "../adapters/related-design-view-model.js";
import { adaptPublication } from "../adapters/publication-view-model.js";
import { adaptImplementationList } from "../adapters/implementation-list-view-model.js";
import { getStartupContext } from "./mode.js";
import { SpacePicker } from "./components/space-picker.js";
import { InspirationBar } from "./components/inspiration-bar.js";
import { RenderPreview } from "./components/render-preview.js";
// V2.1 P0：ConstraintBar 不再渲染（预算/不打孔/宠物不出现在主界面），保留类文件以备后续阶段。
import { AssetDrawer } from "./components/asset-drawer.js";
import { HistoryDrawer } from "./components/history-drawer.js";
import { escapeHtml, formatMoney } from "./components/ui-utils.js";
import { buildProductDiscoveryEvent } from "./product-discovery-events.js";

// V2.1 P0：预算/不打孔/宠物/手动风格编辑均不出现在主界面（协议第 1 节）。
// DEFAULT_GOAL 与 formatMoney 仅服务于旧约束 UI，已移除。
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
  renderPreview: document.getElementById("renderPreview"),
  inspiration: document.getElementById("inspirationBar"),
  intent: document.getElementById("intentPanel"),
  space: document.getElementById("spacePicker"),
  constraints: document.getElementById("constraintBar"),
  generate: document.getElementById("generateArea"),
  progress: document.getElementById("progressArea"),
  result: document.getElementById("resultArea"),
  resultWorkflow: document.getElementById("resultWorkflowArea"),
  relatedDesigns: document.getElementById("relatedDesignArea"),
  implementationDrawer: document.getElementById("implementationDrawer"),
  implementationContent: document.getElementById(
    "implementationDrawerContent"
  ),
  assetDrawer: document.getElementById("assetDrawer"),
  assetContent: document.getElementById("assetDrawerContent"),
  historyDrawer: document.getElementById("historyDrawer"),
  historyContent: document.getElementById("historyDrawerContent"),
  dialog: document.getElementById("renewalDialogLayer"),
  toast: document.getElementById("renewalToast"),
  loading: document.getElementById("renewalLoading"),
  status: document.getElementById("backendStatus"),
  fileInput: document.getElementById("spaceFileInput"),
  cameraInput: document.getElementById("spaceCameraInput")
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

// V2.1 协议 7.2：relatedDesigns 独立轮询，与 generation 互不影响
let relatedPollTimer = null;
let relatedPollController = null;
let relatedPollFailures = 0;
let relatedPollStartedAt = 0;

const spacePicker = new SpacePicker(elements.space, {
  onSelect: selectSpace,
  onUpload: () => elements.fileInput?.click(),
  onCamera: () => elements.cameraInput?.click(),
  onConfirm: confirmSelectedSpace,
  onOpenAssets: (tab) => openDrawer("asset", tab)
});
const inspirationBar = new InspirationBar(elements.inspiration, {
  onOpenAssets: (tab) => openDrawer("asset", tab)
});
const renderPreview = new RenderPreview(elements.renderPreview, {
  onGenerate: startGeneration
});
// V2.1 P0：constraintBar 实例不再创建（预算/不打孔/宠物 UI 不出现在主界面）。
// elements.constraints 容器仍保留，render() 中将其清空并隐藏。
const assetDrawer = new AssetDrawer(elements.assetContent, {
  onSelect: selectAsset
});
const historyDrawer = new HistoryDrawer(elements.historyContent, {
  onSelect: loadPlanVersionIntoCore
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
        : "把这盏灯，搬进这张桌面。";
  elements.subheading.textContent =
    state.coreState === "RESULT_READY"
      ? "拖动查看前后变化，也可以继续从历史里挑选。"
      : busy
        ? "可以留在这里看进度，历史方案不会被覆盖。"
        : "先看清“搬什么”和“搬到哪里”，再交给 AI。";

  inspirationBar.render({
    videoContext: state.videoEntryContext,
    selectedInspiration: state.selectedReference,
    confirmedIntent: state.entry?.confirmedIntent,
    readonly: busy
  });
  renderIntentPanel(state);
  spacePicker.render({
    spaces: state.spaces,
    selectedSpace: state.selectedSpace,
    readonly: busy
  });
  renderPreview.render({
    planVersion: state.currentPlanVersion,
    selectedSpace: state.selectedSpace,
    selectedReference: state.selectedReference,
    confirmedIntent: state.entry?.confirmedIntent,
    coreState: state.coreState,
    canGenerate:
      state.backendConnected &&
      state.selectedSpace?.spaceVersionState === "sealed" &&
      Boolean(state.entry?.confirmedIntent)
  });
  // V2.1 协议第 1 节：预算、不打孔、宠物和手动风格编辑均不出现在 P0 主界面。
  // 不再渲染 constraintBar；constraints slice 仅作为后端兼容字段保留，不参与 UI。
  if (elements.constraints) {
    elements.constraints.innerHTML = "";
    elements.constraints.hidden = true;
  }
  renderGenerateArea(state);

  elements.progress.hidden = !busy;
  if (busy) renderProgress(state.currentGenerationRun);
  elements.result.hidden =
    true;
  renderResultWorkflow(state);
  renderRelatedDesigns(state);

  assetDrawer.render({
    assets: state.assets,
    preferredTab: preferredAssetTab
  });
  historyDrawer.render({ plans: state.plans });
}

function renderIntentPanel(state) {
  const source = state.selectedReference || state.videoEntryContext;
  const entry = state.entry || {};
  elements.intent.hidden = !source;
  if (!source) {
    elements.intent.innerHTML = "";
    return;
  }

  const intent = entry.intentAnalysis;
  if (entry.parseState === "parsing") {
    elements.intent.innerHTML = `
      <div class="intent-panel intent-panel--working" role="status">
        <span>UNDERSTANDING</span>
        <strong>正在理解你想带回家的内容…</strong>
      </div>`;
    return;
  }
  if (entry.parseState === "failed") {
    elements.intent.innerHTML = `
      <div class="intent-panel intent-panel--error" role="alert">
        <span>INTENT FAILED</span>
        <strong>这份灵感暂时无法识别</strong>
        <p>${escapeHtml(entry.error?.message || "请换一份灵感后重试。")}</p>
      </div>`;
    return;
  }
  if (entry.confirmedIntent) {
    const label =
      entry.confirmedIntent.intentType === "component" ? "组件已锁定" : "风格已确认";
    elements.intent.innerHTML = `
      <div class="intent-panel intent-panel--ready">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(entry.confirmedIntent.summary || "意图已确认")}</strong>
        <small>${entry.confirmedIntent.intentType === "component" ? "它是不可替换对象：AI 可以调整摆放位置，不能换成另一盏灯。" : "AI 会提取这份参考的设计语言，不会复制原场景。"}</small>
      </div>`;
    return;
  }

  const candidates =
    intent?.candidates?.length
      ? intent.candidates
      : intent?.suggestedType
        ? [
            {
              intentType: intent.suggestedType,
              summary: intent.summary || "使用这份灵感"
            }
          ]
        : [];
  elements.intent.innerHTML = `
    <div class="intent-panel intent-panel--confirm">
      <span>CONFIRM INTENT</span>
      <strong>你想搬进家的是哪一部分？</strong>
      <p>${escapeHtml(intent?.summary || "请先确认组件或整体风格，再开始生成。")}</p>
      <div class="intent-options">
        ${candidates
          .map(
            (candidate) => `
              <button type="button"
                data-intent-type="${escapeHtml(candidate.intentType)}"
                data-intent-summary="${escapeHtml(candidate.summary)}">
                <small>${candidate.intentType === "component" ? "具体组件" : "整体风格"}</small>
                <strong>${escapeHtml(candidate.summary)}</strong>
              </button>`
          )
          .join("")}
      </div>
    </div>`;
  elements.intent.querySelectorAll("[data-intent-type]").forEach((button) =>
    button.addEventListener("click", () =>
      handleIntentConfirmation(
        button.dataset.intentType,
        button.dataset.intentSummary
      )
    )
  );
}

function renderResultWorkflow(state) {
  const plan = state.currentPlanVersion;
  const visible = state.coreState === "RESULT_READY" && Boolean(plan);
  elements.resultWorkflow.hidden = !visible;
  if (!visible) {
    elements.resultWorkflow.innerHTML = "";
    return;
  }

  const lifecycle = plan.planLifecycle || "draft";
  const publication = state.publication || {};
  const publicationView = publication.viewModel;
  const implementation = state.implementation || {};
  const implementationView = implementation.viewModel;
  const canPublish = hasCapability(V2_CAPABILITIES.PLAN_PUBLICATION);
  const canBatchCart = hasCapability(V2_CAPABILITIES.CART_BATCH_HANDOFF);
  const implementationOpen = implementation.status !== "closed";
  const implementationItems = implementationView?.items || [];
  const selectedItems = implementationView?.selectedMatchIds || [];

  elements.resultWorkflow.innerHTML = `
    <div class="result-workflow">
      <header>
        <div><span>KEEP · SHARE · MAKE IT REAL</span><h3>保存与实施</h3></div>
        <em>${lifecycle === "saved" ? "私人已保存" : "私人草稿"}</em>
      </header>
      <div class="result-workflow__actions">
        ${
          lifecycle !== "saved"
            ? '<button type="button" class="secondary-action" data-save-plan>保存到我的方案</button>'
            : ""
        }
        ${
          lifecycle === "saved" &&
          canPublish &&
          !["indexing", "published"].includes(publicationView?.status)
            ? '<button type="button" class="secondary-action" data-publish-plan>一键发布</button>'
            : ""
        }
        ${
          publicationView?.canWithdraw
            ? '<button type="button" class="text-button" data-withdraw-publication>撤下发布</button>'
            : ""
        }
        <button type="button" class="primary-action" data-open-implementation>
          ${implementationOpen ? "刷新实施清单" : "实施"}
        </button>
      </div>
      ${
        publication.status === "saving"
          ? '<p class="workflow-note">正在保存私人方案…</p>'
          : publication.status === "publishing"
            ? '<p class="workflow-note">方案已私人保存，正在建立公开索引…</p>'
            : publicationView
              ? `<p class="workflow-note">发布状态：${escapeHtml(publicationView.statusLabel)}。${
                  publicationView.isIndexFailed
                    ? "私人保存不受影响。"
                    : ""
                }</p>`
              : !canPublish
                ? '<p class="workflow-note">当前后端未开放发布能力，方案仍可私人保存。</p>'
                : ""
      }
      ${
        implementationOpen
          ? `<section class="implementation-panel">
              <header>
                <div><span>IMPLEMENTATION</span><h4>整套实施清单</h4></div>
                <button type="button" class="text-button" data-close-implementation>关闭</button>
              </header>
              ${
                implementation.status === "loading"
                  ? '<p class="workflow-note" role="status">正在恢复或生成实施清单…</p>'
                  : implementation.status === "failed"
                    ? `<p class="workflow-note" role="alert">${escapeHtml(implementation.error?.message || "实施清单暂时不可用")}</p>`
                    : implementationItems.length
                      ? `<div class="implementation-list">
                          ${implementationItems
                            .map(
                              (item) => `<label>
                                <input type="checkbox" data-implementation-item="${escapeHtml(item.listItemId)}" ${item.selectedMatchId && item.selected !== false ? "checked" : ""} ${item.selectedMatchId ? "" : "disabled"} />
                                <span><small>${escapeHtml(item.originLabel || "来源未标注")}</small><strong>${escapeHtml(item.displayName)}</strong></span>
                                <b>×${item.quantity}</b>
                              </label>`
                            )
                            .join("")}
                        </div>
                        <div class="implementation-summary">
                          <span>${implementationItems.length} 项 · ${selectedItems.length} 项可交接</span>
                          <strong>${implementationView.estimatedTotalCny == null ? "参考价待确认" : formatMoney(implementationView.estimatedTotalCny)}</strong>
                        </div>
                        ${
                          canBatchCart && selectedItems.length
                            ? '<button type="button" class="secondary-action" data-create-cart-intent>生成购物车交接</button>'
                            : '<p class="workflow-note">当前不支持整套购物车交接，请使用下方逐项动作。</p>'
                        }`
                      : implementation.status === "empty"
                        ? '<p class="workflow-note">本次没有可靠的实施商品，效果方案仍已保留。</p>'
                        : ""
              }
            </section>`
          : ""
      }
    </div>`;

  elements.resultWorkflow
    .querySelector("[data-save-plan]")
    ?.addEventListener("click", saveCurrentPlan);
  elements.resultWorkflow
    .querySelector("[data-publish-plan]")
    ?.addEventListener("click", previewAndPublishCurrentPlan);
  elements.resultWorkflow
    .querySelector("[data-withdraw-publication]")
    ?.addEventListener("click", withdrawCurrentPublication);
  elements.resultWorkflow
    .querySelector("[data-open-implementation]")
    ?.addEventListener("click", openImplementation);
  elements.resultWorkflow
    .querySelector("[data-close-implementation]")
    ?.addEventListener("click", closeImplementation);
  elements.resultWorkflow
    .querySelector("[data-create-cart-intent]")
    ?.addEventListener("click", createImplementationCartIntent);
  elements.resultWorkflow
    .querySelectorAll("[data-implementation-item]")
    .forEach((checkbox) =>
      checkbox.addEventListener("change", () =>
        toggleImplementationItem(
          checkbox.dataset.implementationItem,
          checkbox.checked
        )
      )
    );
}

function renderRelatedDesigns(state) {
  const related = state.relatedDesigns || {};
  const visible = related.status !== "not_started";
  elements.relatedDesigns.hidden = !visible;
  if (!visible) {
    elements.relatedDesigns.innerHTML = "";
    return;
  }
  const viewModel = related.viewModel;
  const items = viewModel?.items || [];
  elements.relatedDesigns.innerHTML = `
    <div class="related-designs">
      <header><div><span>RELATED DESIGNS</span><h3>更多可参考的设计</h3></div></header>
      ${
        related.status === "active"
          ? `<p class="workflow-note" role="status">正在并行寻找相关设计 · ${Math.round(viewModel?.progress || 0)}%</p>`
          : related.status === "empty"
            ? '<p class="workflow-note">这次没有可靠的相关设计，主效果图不受影响。</p>'
            : related.status === "failed"
              ? `<p class="workflow-note" role="alert">${escapeHtml(related.error?.message || "相关设计暂时不可用，主效果图不受影响。")}</p>`
              : items.length
                ? `<div class="related-design-list">${items
                    .map(
                      (item, index) => `<button type="button" data-related-index="${index}" ${item.openAction?.type === "unavailable" ? "disabled" : ""}>
                        <span>${escapeHtml(item.sourceLabel)}</span>
                        <strong>${escapeHtml(item.title)}</strong>
                        <small>${escapeHtml(item.reasonLabels?.join(" · ") || "后端未提供更多推荐理由")}</small>
                      </button>`
                    )
                    .join("")}</div>`
                : '<p class="workflow-note">相关设计尚未返回可展示内容。</p>'
      }
    </div>`;
  elements.relatedDesigns
    .querySelectorAll("[data-related-index]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openRelatedDesign(items[Number(button.dataset.relatedIndex)])
      )
    );
}

function renderGenerateArea(state) {
  if (isBusy(state)) {
    elements.generate.innerHTML = "";
    return;
  }
  if (state.coreState === "RESULT_READY" && state.currentPlanVersion) {
    renderPlanTextResult(state.currentPlanVersion);
    return;
  }
  const selected = state.selectedSpace;
  const sealed = selected?.spaceVersionState === "sealed";
  const missingComponentAnchor =
    state.selectedReference?.type === "item" &&
    state.selectedReference?.sourceComponent?.immutable_anchor !== true;
  const helper = !state.backendConnected
    ? "服务未连接，暂时不能生成"
    : missingComponentAnchor
      ? "这件旧收藏没有组件裁剪图，请返回视频重新框选并确认一次"
    : !state.entry?.confirmedIntent
      ? "先选择并确认一个组件或风格灵感"
    : !selected
      ? "先选择或上传一个真实空间"
      : !sealed
        ? "请先确认空间识别结果"
        : "组件与空间都已就绪；点击后会生成一张新的焕新效果图";
  elements.generate.innerHTML = `
    <button class="primary-action" type="button" data-generate ${
      state.backendConnected && state.entry?.confirmedIntent && selected && sealed
        ? ""
        : "disabled"
    }>
      <span>开始搬进我家</span>
      <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
    </button>
    <p class="action-help">${escapeHtml(helper)}</p>`;
  elements.generate
    .querySelector("[data-generate]")
    ?.addEventListener("click", startGeneration);
}

function renderPlanTextResult(plan) {
  const steps = plan.steps || [];
  const products = plan.products || [];
  const alternatives = plan.alternatives || [];
  const total = plan.totalPriceCny || 0;

  const stepsHtml = steps.length
    ? steps
        .map(
          (s, i) => `<li><strong>${i + 1}. ${escapeHtml(s.title || "步骤")}</strong><small>${escapeHtml(s.description || "")}</small></li>`
        )
        .join("")
    : "";

  const productsHtml = products.length
    ? products
        .map(
          (p) => `<li><span>${escapeHtml(p.name || "")}</span><small>${escapeHtml(p.reason || p.dimensionsLabel || "")}</small><b>${formatMoney(p.priceCny)}</b></li>`
        )
        .join("")
    : "";

  const altsHtml = alternatives.length
    ? alternatives
        .map(
          (a, i) => `<div class="plan-alt"><strong>备选 ${i + 1} · ${escapeHtml(a.title || "方向")}</strong><span>${formatMoney(a.totalPriceCny)}</span></div>`
        )
        .join("")
    : "";

  elements.generate.innerHTML = `
    <div class="plan-text-result">
      <div class="plan-text-result__header">
        <span class="plan-text-result__kicker">YOUR PLAN</span>
        <h3>${escapeHtml(plan.title || "焕新方案")}</h3>
        ${plan.summary ? `<p>${escapeHtml(plan.summary)}</p>` : ""}
      </div>
      ${
        products.length
          ? `<section class="plan-text-section">
              <h4>落地商品 <small>共 ${products.length} 件 · 合计 ${formatMoney(total)}</small></h4>
              <ul class="plan-text-list">${productsHtml}</ul>
            </section>`
          : ""
      }
      ${
        steps.length
          ? `<section class="plan-text-section">
              <h4>执行步骤</h4>
              <ol class="plan-text-list plan-text-list--steps">${stepsHtml}</ol>
            </section>`
          : ""
      }
      ${
        alternatives.length
          ? `<section class="plan-text-section">
              <h4>备选方向</h4>
              <div class="plan-text-alts">${altsHtml}</div>
            </section>`
          : ""
      }
      <button class="primary-action" type="button" data-regenerate>
        <span>再次焕新</span>
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>`;
  elements.generate
    .querySelector("[data-regenerate]")
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
    const listedAssets = adaptAssets(response.items || response || []);
    // 初始体验对象不能依赖“最近 30 条”的分页结果。真实测试资产较多时，
    // 老的 demo seed 会被挤出第一页，因此按稳定 ID 单独读取并合并。
    const starterDetails = await Promise.allSettled([
      getAsset("space-demo-desk"),
      getAsset("item-demo-lamp")
    ]);
    const starterAssets = starterDetails
      .filter((result) => result.status === "fulfilled")
      .map((result) => adaptAsset(result.value));
    const assets = [
      ...starterAssets,
      ...listedAssets.filter(
        (asset) =>
          !starterAssets.some((starter) => starter.assetId === asset.assetId)
      )
    ];
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
        spaces.find((space) => space.assetId === "space-demo-desk") ||
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
    stopPolling();
    stopRelatedPolling();
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
    const previousAssetId = getState().selectedSpace?.assetId;
    update({ selectedSpace, coreState: "IDLE", currentPlanVersion: null });
    let switchedEpoch = null;
    if (previousAssetId && previousAssetId !== selectedSpace.assetId) {
      switchedEpoch = beginDesignContext({
        selectedScene: selectedSpace,
        selectedSpaceVersionId: selectedSpace.currentSpaceVersionId
      });
      resetPublication();
      resetImplementation();
    }
    persistDraft();
    closeDrawers();
    if (!quiet) showToast(`已选择「${selectedSpace.name || "我的空间"}」`);
    // V2.1：换场景不是替换前端图片。只要灵感已经确认且新场景是 sealed，
    // 就用同一 InspirationAsset + 新 SpaceVersion 创建全新的 DesignRequest，
    // 并让 Generation / Related Design 重新并发运行。
    if (
      switchedEpoch !== null &&
      selectedSpace.spaceVersionState === "sealed" &&
      getState().entry?.confirmedIntent &&
      getState().backendConnected
    ) {
      showToast("场景已切换，正在重新生成效果图与相关设计");
      await startGeneration({ epoch: switchedEpoch });
    }
    return selectedSpace;
  } catch (error) {
    showToast(errorMessage(error, "空间读取失败"));
    return null;
  }
}

async function selectAsset(asset, { quiet = false } = {}) {
  if (!asset) return;
  if (asset.type === "space") {
    selectSpace(asset.assetId);
    return;
  }
  if (!["inspiration", "item"].includes(asset.type)) return;
  try {
    setLoading(true);
    if (asset.type === "item") {
      const detail = await getAsset(asset.assetId);
      const selectedReference = adaptDesignReference(detail);
      if (selectedReference?.sourceComponent?.immutable_anchor !== true) {
        showToast("这个单品还不是已确认组件，暂时不能直接用于生成");
        return;
      }
      update({
        selectedReference,
        selectedInspiration: null
      });
      updateEntry({
        referenceAssetId: selectedReference.assetId,
        referenceAssetType: "item",
        inspirationAssetId: null,
        parseState: "ready",
        intentAnalysis: null,
        confirmedIntent: selectedReference.confirmedIntent,
        error: null
      });
    } else {
      await hydrateInspirationAsset(asset.assetId);
    }
    update({ coreState: "IDLE", currentPlanVersion: null });
    resetPublication();
    resetImplementation();
    persistDraft();
    closeDrawers();
    if (!quiet) showToast(`已加入「${asset.name || "这份灵感"}」`);
  } catch (error) {
    showToast(errorMessage(error, "灵感读取失败"));
  } finally {
    setLoading(false);
  }
}

async function hydrateInspirationAsset(assetId) {
  let detail = await getAsset(assetId);
  if (["queued", "parsing"].includes(detail.parse_state)) {
    updateEntry({
      inspirationAssetId: assetId,
      parseState: "parsing",
      error: null
    });
    detail = await waitForAssetParse(assetId);
  }
  const selectedInspiration = adaptAsset(detail);
  const selectedReference = adaptDesignReference(detail);
  const intent = adaptInspirationIntent(detail);
  update({ selectedInspiration, selectedReference });
  updateEntry({
    referenceAssetId: assetId,
    referenceAssetType: "inspiration",
    inspirationAssetId: assetId,
    parseState: intent.isConfirmed
      ? "ready"
      : intent.state === "failed"
        ? "failed"
        : "needs_confirmation",
    intentAnalysis: intent,
    confirmedIntent: intent.confirmedIntent,
    error:
      intent.state === "failed"
        ? { message: "这份灵感解析失败，请换一份灵感。" }
        : null
  });
  return detail;
}

async function hydrateDesignReferenceAsset(assetId) {
  const detail = await getAsset(assetId);
  if (detail.asset_type === "inspiration") {
    return hydrateInspirationAsset(assetId);
  }
  if (detail.asset_type !== "item") {
    throw new Error("这份资产不能作为焕新参考");
  }
  const selectedReference = adaptDesignReference(detail);
  update({
    selectedReference,
    selectedInspiration: null
  });
  if (selectedReference?.sourceComponent?.immutable_anchor === true) {
    updateEntry({
      referenceAssetId: selectedReference.assetId,
      referenceAssetType: "item",
      inspirationAssetId: null,
      parseState: "ready",
      intentAnalysis: null,
      confirmedIntent: selectedReference.confirmedIntent,
      error: null
    });
    return detail;
  }
  updateEntry({
    referenceAssetId: selectedReference.assetId,
    referenceAssetType: "item",
    inspirationAssetId: null,
    parseState: "failed",
    intentAnalysis: null,
    confirmedIntent: null,
    error: {
      code: "source_component_anchor_missing",
      message: "这件旧收藏没有保留组件裁剪图，请重新框选并确认一次。"
    }
  });
  return detail;
}

async function handleIntentConfirmation(intentType, summary) {
  const entry = getState().entry;
  const selected = getState().selectedInspiration;
  if (!entry?.inspirationAssetId || !selected?.resourceVersion) {
    showToast("灵感资产信息不完整，请重新选择");
    return;
  }
  try {
    setLoading(true);
    await confirmInspirationIntent(
      entry.inspirationAssetId,
      {
        resource_version: selected.resourceVersion,
        intent_type: intentType,
        summary
      }
    );
    // 确认接口返回的是资产摘要；confirmed_intent 只存在于完整详情中。
    // 重新读取详情，避免 UI 把已成功确认的意图误判为未确认。
    await hydrateInspirationAsset(entry.inspirationAssetId);
    persistDraft();
    showToast("意图已确认，可以开始生成");
  } catch (error) {
    if (isErrorCode(error, V2_ERROR_CODES.RESOURCE_VERSION_CONFLICT)) {
      await hydrateInspirationAsset(entry.inspirationAssetId);
    }
    showToast(errorMessage(error, "意图确认失败"));
  } finally {
    setLoading(false);
  }
}

function persistDraft() {
  const state = getState();
  if (!state.selectedSpace) return;
  const previous = state.designTaskDraft || {};
  // V2.1 协议 7.3 + 第 1 节：sessionStorage 只保存业务 ID，不保存 goal / constraints
  // （含 budget_cny / no_drilling / pet_context）/ user_note。
  // 持久化层（renewal-store.saveDesignTaskDraft）已按 allowlist 收紧；
  // 这里构造草稿时也不再携带 V2.1 P0 不显示的字段，避免内存态与持久化态歧义。
  saveDesignTaskDraft({
    ...previous,
    trigger:
      state.videoEntryContext || state.selectedReference
        ? "video_apply"
        : "space_reuse",
    space_asset_id: state.selectedSpace.assetId,
    space_version_id: state.selectedSpace.currentSpaceVersionId,
    space_sealed: state.selectedSpace.spaceVersionState === "sealed",
    space_parse_state: state.selectedSpace.parseState,
    space_version_resource_version:
      state.selectedSpace.spaceVersionResourceVersion,
    editable_region_id: state.selectedSpace.editableRegionId,
    reference_asset_ids: state.selectedReference?.assetId
      ? [state.selectedReference.assetId]
      : previous.reference_asset_ids || [],
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
        reference_width_cm: 120
        // V2.1 P0：不提交 default_budget_cny / long_term_constraints（no_drilling）
        // 协议第 1 节：预算、不打孔、宠物不出现在主界面，后端保留内部保护上限
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
    elements.cameraInput.value = "";
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
  if (context.reference_asset_id) {
    try {
      await hydrateDesignReferenceAsset(context.reference_asset_id);
      return context.reference_asset_id;
    } catch (error) {
      if (!isErrorCode(error, V2_ERROR_CODES.RESOURCE_NOT_FOUND)) throw error;
    }
  }
  if (videoReferencePromise) return videoReferencePromise;
  updateEntry({ parseState: "parsing", error: null });
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
    .then(async (asset) => {
      const nextContext = {
        ...context,
        reference_asset_id: asset.asset_id
      };
      setVideoEntryContext(nextContext);
      update({ videoEntryContext: nextContext });
      await hydrateInspirationAsset(asset.asset_id);
      return asset.asset_id;
    })
    .catch((error) => {
      updateEntry({
        parseState: "failed",
        error: mapError(error)
      });
      throw error;
    })
    .finally(() => {
      videoReferencePromise = null;
    });
  return videoReferencePromise;
}

async function startGeneration(options = {}) {
  const state = getState();
  if (!state.backendConnected || !state.selectedSpace) return;
  if (state.selectedSpace.spaceVersionState !== "sealed") {
    showToast("请先确认空间识别结果");
    return;
  }
  try {
    setLoading(true);
    const videoReferenceId = await ensureVideoReferenceAsset();
    if (
      state.selectedReference?.type === "inspiration" &&
      state.selectedReference?.assetId &&
      getState().entry?.inspirationAssetId !==
        state.selectedReference.assetId
    ) {
      await hydrateInspirationAsset(state.selectedReference.assetId);
    }
    if (!getState().entry?.confirmedIntent) {
      const reference = getState().selectedReference;
      showToast(
        reference?.type === "item" &&
          reference?.sourceComponent?.immutable_anchor !== true
          ? "这件旧收藏缺少组件裁剪图，请重新框选并确认"
          : "请先确认组件或风格意图，再开始生成"
      );
      return;
    }
    const referenceIds = [
      getState().selectedReference?.assetId,
      videoReferenceId
    ].filter(Boolean);
    // V2.1 协议 6.2：P0 固定 constraints={}, goal="", goal_codes=[]
    // options.experience_contract='renewal-card/2.1'，不提交 budget/no_drilling/pet
    const request = buildV2DesignRequest({
      trigger:
        state.videoEntryContext || referenceIds.length
          ? "video_apply"
          : "space_reuse",
      space_asset_id: state.selectedSpace.assetId,
      space_version_id: state.selectedSpace.currentSpaceVersionId,
      reference_asset_ids: [...new Set(referenceIds)],
      editable_region_id: state.selectedSpace.editableRegionId
    });
    // 在第一个异步创建前冻结 epoch；场景/意图切换后，迟到的 DesignRequest
    // 也不能进入当前 UI。
    const requestedEpoch = Number.isInteger(options?.epoch)
      ? options.epoch
      : null;
    if (
      requestedEpoch !== null &&
      !isCurrentDesignContext({ epoch: requestedEpoch })
    ) {
      return;
    }
    const epoch =
      requestedEpoch ??
      beginDesignContext({
        selectedScene: state.selectedSpace,
        selectedSpaceVersionId: state.selectedSpace.currentSpaceVersionId
      });
    const designRequest = await createDesignRequest(request);
    if (!isCurrentDesignContext({ epoch })) return;
    if (!designRequest.can_start_generation) {
      const issue = designRequest.missing_fields?.find((item) => item.blocking);
      throw new Error(issue?.message || "还需要补充任务信息");
    }

    setDesignRequestIdForEpoch(epoch, designRequest.design_request_id);
    persistDesignContextResume({
      designRequestId: designRequest.design_request_id,
      generationRunId: null,
      relatedDesignRunId: null,
      planAssetId: null,
      planVersionId: null,
      publicationId: null
    });

    update({ coreState: "GENERATING", currentPlanVersion: null });
    resetPublication();
    resetImplementation();

    // V2.1 协议第 5 节：GenerationRun 与 RelatedDesignRun 并发、独立、互不阻塞。
    // feature=false 时不请求不存在路由，直接显示「演示数据」入口。
    const relatedDesignsAvailable = hasCapability(
      V2_CAPABILITIES.RELATED_DESIGNS
    );

    // 并发创建两个 run；任一失败不影响另一方
    const generationPromise = createGenerationRun(designRequest.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    }).catch((error) => ({ __error: error }));

    const relatedDesignPromise = relatedDesignsAvailable
      ? createRelatedDesignRun(designRequest.design_request_id, {
          schema_version: "1.0",
          reason: "initial",
          options: { limit: 12, sources: ["douyin", "user_publication"] }
        }).catch((error) => ({ __error: error }))
      : Promise.resolve(null);

    const [generationResult, relatedResult] = await Promise.all([
      generationPromise,
      relatedDesignPromise
    ]);

    // 处理 GenerationRun
    if (generationResult?.__error) {
      console.error("Start generation run failed:", generationResult.__error);
      showToast(errorMessage(generationResult.__error, "方案生成启动失败"));
      updateGeneration({
        status: "failed",
        error: mapError(generationResult.__error)
      });
    } else {
      updateGeneration({
        status: "active",
        generationRunId: generationResult.generation_run_id,
        currentRun: generationResult,
        error: null
      });
      persistDesignContextResume({
        designRequestId: designRequest.design_request_id,
        generationRunId: generationResult.generation_run_id
      });
      setGenerationRun(generationResult, pollController);
      startGenerationPolling(
        generationResult.generation_run_id,
        "GENERATING",
        epoch,
        designRequest.design_request_id
      );
    }

    // 处理 RelatedDesignRun（失败不影响 generation）
    if (relatedDesignsAvailable) {
      if (relatedResult?.__error) {
        console.warn("Start related design run failed:", relatedResult.__error);
        updateRelatedDesigns({
          status: "failed",
          error: mapError(relatedResult.__error)
        });
      } else if (relatedResult) {
        updateRelatedDesigns({
          status: "active",
          relatedDesignRunId: relatedResult.related_design_run_id,
          viewModel: adaptRelatedDesignRun(relatedResult),
          error: null,
          polling: true
        });
        persistDesignContextResume({
          designRequestId: designRequest.design_request_id,
          relatedDesignRunId: relatedResult.related_design_run_id
        });
        startRelatedDesignPolling(
          relatedResult.related_design_run_id,
          epoch,
          designRequest.design_request_id
        );
      }
    } else {
      // V2.1 协议第 8 节：related_designs=false 时隐藏或显示「演示数据」入口
      updateRelatedDesigns({
        status: "not_started",
        viewModel: null,
        error: null
      });
    }
  } catch (error) {
    console.error("Start generation failed:", error);
    if (isErrorCode(error, V2_ERROR_CODES.INTENT_CONFIRMATION_REQUIRED)) {
      updateEntry({ parseState: "needs_confirmation" });
    }
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

async function saveCurrentPlan({ quiet = false } = {}) {
  const planViewModel = getState().currentPlanVersion;
  if (!planViewModel?.planAssetId) return false;
  try {
    updatePublication({ status: "saving", error: null });
    const latest = await getPlan(planViewModel.planAssetId);
    const saved =
      latest.lifecycle === "saved"
        ? latest
        : await updatePlan(
            planViewModel.planAssetId,
            { lifecycle: "saved" },
            latest.resource_version
          );
    update({
      currentPlanVersion: {
        ...getState().currentPlanVersion,
        planLifecycle: saved.lifecycle,
        planResourceVersion: saved.resource_version
      }
    });
    updatePublication({ status: "saved", error: null });
    if (!quiet) showToast("方案已私人保存");
    loadPlansIntoState();
    return true;
  } catch (error) {
    updatePublication({
      status: "failed",
      error: mapError(error)
    });
    showToast(errorMessage(error, "方案保存失败"));
    return false;
  }
}

function previewAndPublishCurrentPlan() {
  const plan = getState().currentPlanVersion;
  if (!plan || plan.planLifecycle !== "saved") {
    showToast("请先私人保存方案，再发布");
    return;
  }
  const defaultTitle = (plan.title || "我的一角焕新").slice(0, 100);
  openDialog(
    `<button type="button" class="renewal-dialog__close" data-dialog-close aria-label="关闭">×</button>
     <h3>确认主动发布</h3>
     <p>发布会创建一份公开快照；私人空间原图和短时媒体地址不会进入公开索引。</p>
     <label>标题<input type="text" maxlength="100" value="${escapeHtml(defaultTitle)}" data-publication-title /></label>
     <p>封面：AI 方案效果图<br />来源标注：一角焕新 AI 效果示意</p>
     <div class="renewal-dialog__actions">
       <button type="button" data-dialog-close>取消</button>
       <button type="button" data-dialog-submit>确认发布</button>
     </div>`,
    () => {
      const title = elements.dialog
        .querySelector("[data-publication-title]")
        ?.value.trim();
      if (!title) {
        showToast("请填写发布标题");
        return false;
      }
      publishCurrentPlan(title);
      return false;
    }
  );
}

async function publishCurrentPlan(title) {
  const plan = getState().currentPlanVersion;
  if (!plan?.planAssetId || !plan?.planVersionId) return;
  try {
    setLoading(true);
    updatePublication({ status: "publishing", error: null });
    let publication;
    try {
      publication = await createPublication(
        plan.planAssetId,
        plan.planVersionId,
        {
          title,
          cover_source: "plan_render",
          source_attribution_acknowledged: true
        }
      );
    } catch (error) {
      if (
        isErrorCode(error, V2_ERROR_CODES.PUBLICATION_ALREADY_EXISTS) &&
        error.details?.publication_id
      ) {
        publication = await getPublication(error.details.publication_id);
      } else {
        throw error;
      }
    }
    closeDialog();
    let viewModel = adaptPublication(publication);
    updatePublication({
      status: viewModel.isPublished ? "published" : "publishing",
      publicationId: viewModel.publicationId,
      viewModel,
      error: null
    });
    const resume = loadDesignContextResume() || {};
    persistDesignContextResume({
      ...resume,
      planAssetId: plan.planAssetId,
      planVersionId: plan.planVersionId,
      publicationId: viewModel.publicationId
    });
    for (
      let attempt = 0;
      viewModel.isIndexing && attempt < 12;
      attempt += 1
    ) {
      await delay(250);
      publication = await getPublication(viewModel.publicationId);
      viewModel = adaptPublication(publication);
      updatePublication({
        status: viewModel.isPublished
          ? "published"
          : viewModel.isIndexFailed
            ? "failed"
            : "publishing",
        viewModel,
        error: publication.error || null
      });
    }
    showToast(
      viewModel.isPublished
        ? "方案已发布"
        : viewModel.isIndexFailed
          ? "公开索引失败，私人保存仍然有效"
          : "方案已提交发布，正在建立索引"
    );
  } catch (error) {
    updatePublication({
      status: "failed",
      error: mapError(error)
    });
    showToast(errorMessage(error, "方案发布失败"));
  } finally {
    setLoading(false);
  }
}

async function withdrawCurrentPublication() {
  const publication = getState().publication?.viewModel;
  if (!publication?.publicationId) return;
  try {
    setLoading(true);
    await withdrawPublication(publication.publicationId);
    updatePublication({
      status: "saved",
      viewModel: {
        ...publication,
        status: "withdrawn",
        statusLabel: "已撤下",
        isIndexing: false,
        isPublished: false,
        isWithdrawn: true,
        canWithdraw: false
      },
      error: null
    });
    showToast("公开内容已撤下，私人方案仍保留");
  } catch (error) {
    showToast(errorMessage(error, "撤下发布失败"));
  } finally {
    setLoading(false);
  }
}

async function openImplementation() {
  const plan = getState().currentPlanVersion;
  if (!plan) return;
  updateImplementation({
    status: "loading",
    viewModel: null,
    error: null,
    polling: true
  });
  await initializeProductDiscovery(plan);
}

function closeImplementation() {
  stopProductDiscoveryPolling();
  resetImplementation();
}

function toggleImplementationItem(listItemId, selected) {
  const current = getState().implementation?.viewModel;
  if (!current) return;
  const items = current.items.map((item) =>
    item.listItemId === listItemId ? { ...item, selected } : item
  );
  updateImplementation({
    viewModel: {
      ...current,
      items,
      selectedMatchIds: items
        .filter((item) => item.selected && item.selectedMatchId)
        .map((item) => ({
          listItemId: item.listItemId,
          matchId: item.selectedMatchId,
          quantity: item.quantity
        }))
    }
  });
}

async function createImplementationCartIntent() {
  if (!hasCapability(V2_CAPABILITIES.CART_BATCH_HANDOFF)) {
    showToast("当前不支持整套购物车交接，请逐项处理");
    return;
  }
  const implementation = getState().implementation?.viewModel;
  if (!implementation?.runId || !implementation.selectedMatchIds?.length) {
    showToast("请至少保留一项可交接商品");
    return;
  }
  try {
    setLoading(true);
    const result = await createCartIntent(implementation.runId, {
      items: implementation.selectedMatchIds.map((item) => ({
        list_item_id: item.listItemId,
        match_id: item.matchId,
        quantity: item.quantity
      }))
    });
    if (result.action?.type === "douyin_cart_batch") {
      const bridge = globalThis.DouyinJSBridge;
      if (typeof bridge?.invoke === "function") {
        bridge.invoke("cartBatchHandoff", {
          token: result.action.token,
          expiresAt: result.action.expires_at
        });
        showToast("已生成购物车交接，请在抖音内确认");
      } else {
        showToast("交接已生成，请在抖音宿主内继续；尚未创建订单");
      }
    } else if (result.action?.type === "search_bundle") {
      showToast("已生成搜索组合；尚未创建订单");
    } else {
      showToast("本次无法整套交接，请逐项处理");
    }
  } catch (error) {
    if (isErrorCode(error, V2_ERROR_CODES.CART_INTENT_STALE)) {
      await initializeProductDiscovery(getState().currentPlanVersion, {
        force: true
      });
    }
    showToast(errorMessage(error, "购物车交接生成失败"));
  } finally {
    setLoading(false);
  }
}

async function openRelatedDesign(item) {
  if (!item?.openAction) return;
  const action = item.openAction;
  if (action.type === "internal_publication" && action.internalPublicationId) {
    try {
      const publication = adaptPublication(
        await getPublication(action.internalPublicationId)
      );
      openDialog(
        `<button type="button" class="renewal-dialog__close" data-dialog-close aria-label="关闭">×</button>
         <h3>${escapeHtml(publication.title || item.title)}</h3>
         <p>${escapeHtml(item.reasonLabels?.join(" · ") || "来自用户主动发布的一角焕新方案")}</p>
         <p>来源：用户发布 · ${escapeHtml(publication.statusLabel)}</p>
         <div class="renewal-dialog__actions"><button type="button" data-dialog-close>关闭</button></div>`
      );
    } catch (error) {
      showToast(errorMessage(error, "相关发布读取失败"));
    }
    return;
  }
  if (
    action.type === "douyin_deeplink" &&
    action.url?.startsWith("snssdk1128://")
  ) {
    const bridge = globalThis.DouyinJSBridge;
    if (typeof bridge?.invoke === "function") {
      bridge.invoke("openSchema", { schema: action.url });
    } else {
      showToast("请在抖音宿主内打开这条相关内容");
    }
    return;
  }
  showToast("这条相关设计暂时无法打开");
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
  if (["ready", "partial", "empty"].includes(viewModel.status)) {
    const implementationViewModel = adaptImplementationList(run);
    implementationViewModel.items = implementationViewModel.items.map(
      (item) => ({
        ...item,
        selected: Boolean(item.selectedMatchId)
      })
    );
    implementationViewModel.selectedMatchIds =
      implementationViewModel.items
        .filter((item) => item.selected && item.selectedMatchId)
        .map((item) => ({
          listItemId: item.listItemId,
          matchId: item.selectedMatchId,
          quantity: item.quantity
        }));
    updateImplementation({
      status: viewModel.status,
      viewModel: implementationViewModel,
      error: null,
      polling: false
    });
  } else if (["failed", "cancelled"].includes(viewModel.status)) {
    updateImplementation({
      status: "failed",
      error: {
        message:
          viewModel.errorMessage ||
          (viewModel.status === "cancelled"
            ? "实施清单生成已取消"
            : "实施清单生成失败")
      },
      polling: false
    });
  } else {
    updateImplementation({
      status: "loading",
      error: null,
      polling: true
    });
  }
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
  updateImplementation({
    status: "loading",
    viewModel: null,
    error: null,
    polling: true
  });
  if (
    !force &&
    current.planVersionId === plan.planVersionId &&
    current.contextId &&
    current.runId
  ) {
    try {
      const run = await getProductDiscoveryRun(current.runId);
      if (!applyProductDiscoveryRun(run, current.contextId)) return;
      if (["queued", "running"].includes(run.status)) {
        startProductDiscoveryPolling(
          run.product_discovery_run_id,
          current.contextId,
          plan
        );
      }
      return;
    } catch {
      // 旧 run 已不存在时继续走 list 恢复，仍不自动重复创建第二个运行。
    }
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
    updateImplementation({
      status: "failed",
      error: { message: viewModel.description },
      polling: false
    });
    return;
  }
  if (!productDiscoveryFeatureAvailable()) {
    const viewModel = {
      ...createUnavailableProductDiscoveryViewModel("后端尚未声明商品发现能力。"),
      planAssetId: plan.planAssetId,
      planVersionId: plan.planVersionId
    };
    applyProductDiscoveryViewModel(contextId, viewModel);
    updateImplementation({
      status: "failed",
      error: { message: viewModel.description },
      polling: false
    });
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
    updateImplementation({
      status: "failed",
      error: mapError(error),
      polling: false
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
        updateImplementation({
          status: "failed",
          error: mapError(error),
          polling: false
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

function startGenerationPolling(generationRunId, coreState, epoch = null, designRequestId = null) {
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
      // V2.1 协议 7.2：epoch + design_request_id + generation_run_id 都匹配才写回
      if (
        epoch !== null &&
        !isCurrentDesignContext({ epoch, designRequestId })
      ) {
        return; // 迟到响应丢弃
      }
      if (getState().currentGenerationRun?.generation_run_id !== generationRunId) return;
      setGenerationRun(run, pollController);
      if (epoch !== null) {
        updateGenerationForContext(
          { epoch, designRequestId, generationRunId },
          { status: "active", currentRun: run, error: null }
        );
      }
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
          if (epoch !== null) {
            updateGenerationForContext(
              { epoch, designRequestId, generationRunId },
              { status: "failed", error: { message: "方案版本缺失" } }
            );
          }
          showToast("生成完成，但方案版本缺失");
          return;
        }
        const planViewModel = await hydratePlanMetadata(
          adaptPlanResult(envelope)
        );
        update({
          coreState: "RESULT_READY",
          currentPlanVersion: planViewModel
        });
        updatePublication({
          status:
            planViewModel.planLifecycle === "saved"
              ? "saved"
              : "not_started"
        });
        if (epoch !== null) {
          updateGenerationForContext(
            { epoch, designRequestId, generationRunId },
            { status: "ready", currentRun: run }
          );
          persistDesignContextResume({
            designRequestId,
            generationRunId,
            planAssetId: planViewModel?.planAssetId,
            planVersionId: planViewModel?.planVersionId
          });
        }
        resetImplementation();
        showToast("方案已生成，已保留为私人草稿");
        loadPlansIntoState();
        return;
      }
      if (["failed", "cancelled"].includes(run.status)) {
        stopPolling();
        cancelGeneration();
        // V2.1 协议 7.1：generation 失败不影响 relatedDesigns
        if (epoch !== null) {
          updateGenerationForContext(
            { epoch, designRequestId, generationRunId },
            {
              status: run.status === "cancelled" ? "cancelled" : "failed",
              error: run.error ? mapError(run.error) : null
            }
          );
        }
        // 只有当 relatedDesigns 也未运行时才回到 IDLE
        if (getState().relatedDesigns?.status !== "active") {
          update({ coreState: "IDLE" });
        }
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
        if (epoch !== null) {
          updateGenerationForContext(
            { epoch, designRequestId, generationRunId },
            { status: "failed", error: mapError(error) }
          );
        }
        // 只有当 relatedDesigns 也未运行时才回到 IDLE
        if (getState().relatedDesigns?.status !== "active") {
          update({ coreState: "IDLE" });
        }
        showToast(errorMessage(error, "生成进度连接中断"));
        return;
      }
      pollTimer = setTimeout(poll, 1600);
    }
  };
  poll();
}

/**
 * V2.1 协议第 5 节：RelatedDesignRun 独立轮询、独立停止、独立重试。
 * 任一失败不清空另一方结果。
 */
function stopRelatedPolling() {
  if (relatedPollTimer) clearTimeout(relatedPollTimer);
  relatedPollTimer = null;
  relatedPollController?.abort();
  relatedPollController = null;
}

function startRelatedDesignPolling(relatedDesignRunId, epoch, designRequestId) {
  stopRelatedPolling();
  relatedPollController = new AbortController();
  relatedPollFailures = 0;
  relatedPollStartedAt = Date.now();
  updateRelatedDesignsForContext(
    { epoch, designRequestId, relatedDesignRunId },
    { polling: true }
  );

  const poll = async () => {
    // V2.1 协议 7.2：epoch 不匹配直接停止
    if (!isCurrentDesignContext({ epoch, designRequestId })) {
      stopRelatedPolling();
      return;
    }
    if (document.hidden) {
      updateRelatedDesignsForContext(
        { epoch, designRequestId, relatedDesignRunId },
        { polling: false }
      );
      return;
    }
    try {
      const run = await getRelatedDesignRun(relatedDesignRunId, {
        signal: relatedPollController.signal
      });
      if (!isCurrentDesignContext({ epoch, designRequestId })) return;
      const viewModel = adaptRelatedDesignRun(run);
      const applied = updateRelatedDesignsForContext(
        { epoch, designRequestId, relatedDesignRunId },
        { viewModel, error: null }
      );
      if (!applied) return;
      relatedPollFailures = 0;

      if (!["queued", "running"].includes(run.status)) {
        stopRelatedPolling();
        const resultState = run.result_state || null;
        updateRelatedDesignsForContext(
          { epoch, designRequestId, relatedDesignRunId },
          {
            status: ["ready", "partial", "empty"].includes(resultState)
              ? resultState
              : run.status === "failed"
                ? "failed"
                : run.status === "cancelled"
                  ? "cancelled"
                  : "ready",
            polling: false
          }
        );
        persistDesignContextResume({
          designRequestId,
          relatedDesignRunId
        });
        return;
      }
      const elapsed = Date.now() - relatedPollStartedAt;
      relatedPollTimer = setTimeout(poll, elapsed < 10_000 ? 800 : 1500);
    } catch (error) {
      if (error.name === "AbortError") return;
      relatedPollFailures += 1;
      if (relatedPollFailures >= 3) {
        stopRelatedPolling();
        updateRelatedDesignsForContext(
          { epoch, designRequestId, relatedDesignRunId },
          {
            status: "failed",
            error: mapError(error),
            polling: false
          }
        );
        return;
      }
      relatedPollTimer = setTimeout(poll, 1500);
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

async function hydratePlanMetadata(planViewModel) {
  if (!planViewModel?.planAssetId) return planViewModel;
  const plan = await getPlan(planViewModel.planAssetId);
  return {
    ...planViewModel,
    planLifecycle: plan.lifecycle || "draft",
    planDecisionState: plan.decision_state || "undecided",
    planResourceVersion:
      plan.resource_version || planViewModel.planResourceVersion
  };
}

async function loadPlanVersionIntoCore(planAssetId, planVersionId) {
  try {
    setLoading(true);
    let actualVersionId = planVersionId;
    if (!actualVersionId || actualVersionId === "latest") {
      actualVersionId = (await getPlan(planAssetId)).current_plan_version_id;
    }
    const envelope = await getPlanVersion(planAssetId, actualVersionId);
    const planViewModel = await hydratePlanMetadata(adaptPlanResult(envelope));
    update({
      currentPlanVersion: planViewModel,
      coreState: "RESULT_READY"
    });
    resetImplementation();
    resetPublication();
    updatePublication({
      status:
        planViewModel.planLifecycle === "saved" ? "saved" : "not_started"
    });
    closeDrawers();
    elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showToast(errorMessage(error, "方案读取失败"));
  } finally {
    setLoading(false);
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
  elements.cameraInput?.addEventListener("change", (event) =>
    handleSpaceFile(event.target.files?.[0], { source: "camera" })
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
      if (getState().generation?.status === "active") {
        stopPolling();
      }
      if (getState().relatedDesigns?.status === "active") {
        stopRelatedPolling();
        updateRelatedDesigns({ polling: false });
      }
      if (getState().productDiscovery.polling) {
        stopProductDiscoveryPolling();
        updateProductDiscoveryForContext(
          getState().productDiscovery.contextId,
          { polling: false }
        );
      }
      return;
    }
    const designContext = getState().designContext;
    if (
      getState().generation?.status === "active" &&
      getState().generation?.generationRunId &&
      designContext.designRequestId
    ) {
      startGenerationPolling(
        getState().generation.generationRunId,
        "GENERATING",
        designContext.epoch,
        designContext.designRequestId
      );
    }
    if (
      getState().relatedDesigns?.status === "active" &&
      getState().relatedDesigns?.relatedDesignRunId &&
      designContext.designRequestId
    ) {
      startRelatedDesignPolling(
        getState().relatedDesigns.relatedDesignRunId,
        designContext.epoch,
        designContext.designRequestId
      );
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
  // V2.1 协议 7.3 + 第 1 节：sessionStorage 不再保存 goal / constraints
  // （含 budget_cny / no_drilling / pet_context）/ user_note。
  // 这里只恢复空间与参考资产 IDs；constraints slice 保留内存默认值，不读取持久化态。
  if (!draft?.space_asset_id) return;
  // 不再 hydrate 任何约束/预算/宠物字段；state.constraints 保持初始默认值即可。
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

async function restoreDesignContext(resume) {
  if (!resume?.designRequestId) return false;
  const state = getState();
  const epoch = beginDesignContext({
    selectedScene: state.selectedSpace,
    selectedSpaceVersionId: state.selectedSpace?.currentSpaceVersionId
  });
  setDesignRequestIdForEpoch(epoch, resume.designRequestId);
  let restored = false;

  if (resume.generationRunId) {
    try {
      const run = await getGenerationRun(resume.generationRunId);
      updateGeneration({
        status: ["queued", "running"].includes(run.status)
          ? "active"
          : run.status === "succeeded"
            ? "ready"
            : run.status,
        generationRunId: resume.generationRunId,
        currentRun: run,
        error: run.error || null
      });
      setGenerationRun(run, null);
      if (["queued", "running"].includes(run.status)) {
        update({ coreState: "GENERATING" });
        startGenerationPolling(
          resume.generationRunId,
          "GENERATING",
          epoch,
          resume.designRequestId
        );
      } else if (run.status === "succeeded") {
        startGenerationPolling(
          resume.generationRunId,
          "GENERATING",
          epoch,
          resume.designRequestId
        );
      }
      restored = true;
    } catch {
      // 运行已清理时继续尝试恢复另一条独立 run。
    }
  }

  let relatedRunId = resume.relatedDesignRunId || null;
  if (!relatedRunId) {
    try {
      const list = await listRelatedDesignRuns(
        resume.designRequestId,
        { sort: "recent", limit: 1 }
      );
      relatedRunId = list.items?.[0]?.related_design_run_id || null;
    } catch {
      relatedRunId = null;
    }
  }
  if (relatedRunId) {
    try {
      const run = await getRelatedDesignRun(relatedRunId);
      const viewModel = adaptRelatedDesignRun(run);
      updateRelatedDesigns({
        status: ["queued", "running"].includes(run.status)
          ? "active"
          : run.result_state || run.status,
        relatedDesignRunId: relatedRunId,
        viewModel,
        error: run.error || null,
        polling: ["queued", "running"].includes(run.status)
      });
      if (["queued", "running"].includes(run.status)) {
        startRelatedDesignPolling(
          relatedRunId,
          epoch,
          resume.designRequestId
        );
      }
      restored = true;
    } catch {
      // Related Design 恢复失败不影响 Generation 恢复。
    }
  }
  return restored;
}

async function restorePublication(publicationId) {
  if (!publicationId) return;
  try {
    const viewModel = adaptPublication(await getPublication(publicationId));
    updatePublication({
      status: viewModel.isPublished
        ? "published"
        : viewModel.isIndexFailed
          ? "failed"
          : viewModel.isWithdrawn
            ? "saved"
            : "publishing",
      publicationId: viewModel.publicationId,
      viewModel,
      error: null
    });
  } catch {
    // Publication 恢复失败不改变私人方案状态。
  }
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
    if (videoContext) {
      try {
        await ensureVideoReferenceAsset();
      } catch {
        // 意图区会显示失败状态，页面仍可选择其他收藏灵感。
      }
    } else if (!getState().selectedReference) {
      const starterComponent =
        getState().items.find((asset) => asset.assetId === "item-demo-lamp") ||
        getState().items[0] ||
        getState().inspirations[0];
      if (starterComponent) {
        await selectAsset(starterComponent, { quiet: true });
      }
    }
  }
  const designResume = loadDesignContextResume();
  if (startup.planAssetId) {
    await loadPlanVersionIntoCore(
      startup.planAssetId,
      startup.planVersionId || "latest"
    );
  } else if (startup.drawer) {
    openDrawer(startup.drawer);
  } else if (startup.requestUpload) {
    elements.fileInput?.click();
  } else if (designResume?.planAssetId && designResume?.planVersionId) {
    await loadPlanVersionIntoCore(
      designResume.planAssetId,
      designResume.planVersionId
    );
    await restorePublication(designResume.publicationId);
  } else if (designResume?.designRequestId) {
    await restoreDesignContext(designResume);
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
