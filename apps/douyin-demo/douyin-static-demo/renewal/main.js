/**
 * AI 一角焕新集成入口。
 *
 * 浏览器只拥有未提交的 File、任务草稿与展示状态；媒体、资产、空间版本、
 * 设计任务、生成运行和方案版本的稳定身份全部由 ai-corner-renewal 后端拥有。
 */

import {
  parseRoute,
  onRouteChange,
  navigate,
  goBack,
  getPageId,
  getPageTitle,
  getRouteName,
  ROUTES
} from "./router.js";
import {
  getState,
  subscribe,
  setLoading,
  showToast,
  loadDesignTaskDraft,
  saveDesignTaskDraft,
  loadVideoEntryContext,
  setBackendHealth,
  setGenerationRun,
  cancelGeneration
} from "./renewal-store.js";
import {
  adaptPlanResult,
  formatPrice
} from "../adapters/plan-version-view-model.js";
import {
  adaptAsset,
  adaptAssets,
  getAssetTypeText,
  getParseStateText,
  getParseStateClass,
  isDemoAsset
} from "../adapters/asset-view-model.js";
import {
  buildDesignRequest,
  createDesignTaskDraft
} from "../adapters/design-task-builder.js";
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
  getPlanVersion
} from "../api/v1-client.js";
import { checkHealth } from "../api/legacy-client.js";
import {
  API_BASE_URL,
  mapError
} from "../api/http-client.js";

const DEFAULT_GOAL = "让空间更整洁，并增加舒适的暖光氛围";
const DEFAULT_BUDGET_CNY = 500;
const DEFAULT_UPLOAD_LIMIT = 6 * 1024 * 1024;
const PARSE_POLL_INTERVAL_MS = 250;
const PARSE_POLL_ATTEMPTS = 40;

const renewalTitle = document.getElementById("renewalTitle");
const renewalBack = document.getElementById("renewalBack");
const backendStatus = document.getElementById("backendStatus");
const renewalToast = document.getElementById("renewalToast");
const renewalLoading = document.getElementById("renewalLoading");

let generationTimer = null;
let generationController = null;
let generationPollCount = 0;
let videoReferencePromise = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resolveBackendUrl(reference) {
  if (!reference) return null;
  return new URL(reference, API_BASE_URL).toString();
}

function errorMessage(error, fallback = "操作失败，请重试") {
  const mapped = mapError(error);
  return mapped?.message || fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopGenerationPolling() {
  if (generationTimer) {
    clearTimeout(generationTimer);
    generationTimer = null;
  }
  if (generationController) {
    generationController.abort();
    generationController = null;
  }
}

function bindGlobalState() {
  subscribe((state) => {
    if (renewalToast) {
      renewalToast.textContent = state.ui.toast || "";
      renewalToast.classList.toggle("show", Boolean(state.ui.toast));
    }
    if (renewalLoading) {
      renewalLoading.classList.toggle("show", state.ui.loading);
      renewalLoading.setAttribute(
        "aria-hidden",
        state.ui.loading ? "false" : "true"
      );
    }
    if (backendStatus) {
      backendStatus.classList.toggle("is-online", state.backendConnected);
      backendStatus.classList.toggle(
        "is-offline",
        !state.backendConnected
      );
      backendStatus.textContent = state.backendConnected
        ? state.backendHealth?.backend_mode === "demo"
          ? "API · Demo"
          : "API · Live"
        : "API · 离线";
    }
  });
}

function bindNavigation() {
  renewalBack?.addEventListener("click", goBack);
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(button.dataset.nav.replace(/^#/, ""));
    });
  });
  backendStatus?.addEventListener("click", () => checkBackendHealth(true));
  document
    .getElementById("openAccessoryTryon")
    ?.addEventListener("click", () => {
      try {
        sessionStorage.setItem(
          "douyin-accessory-entry-context",
          JSON.stringify({
            kind: "library",
            provider: "douyin_static_demo",
            external_content_id: null,
            timestamp_ms: 0
          })
        );
      } catch {
        // 严格隐私模式下仍可打开本地 3D 橱窗。
      }
      window.location.href = "./try-on.html?source=library";
    });
}

async function checkBackendHealth(showResult = false) {
  try {
    const result = await checkHealth();
    setBackendHealth(result);
    if (showResult) showToast("后端连接正常");
    return result;
  } catch (error) {
    console.warn("Backend health check failed:", error);
    setBackendHealth(null);
    if (showResult) showToast("后端未连接，请运行 npm run start");
    return null;
  }
}

function init() {
  loadDesignTaskDraft();
  loadVideoEntryContext();
  bindGlobalState();
  bindNavigation();
  bindSpaceUploadEvents();
  bindGenerationEvents();
  onRouteChange(handleRouteChange);
  checkBackendHealth();
}

function handleRouteChange(route) {
  const { path, params } = route;
  const routeName = getRouteName(path);

  if (routeName !== "generation") stopGenerationPolling();
  renewalTitle.textContent = getPageTitle(routeName);
  document.querySelectorAll(".renewal-page").forEach((page) => {
    page.classList.remove("active");
  });
  document.getElementById(getPageId(routeName))?.classList.add("active");

  document.querySelectorAll(".renewal-footer__item").forEach((item) => {
    const itemPath = item.dataset.nav?.replace(/^#/, "");
    const active =
      itemPath === path ||
      (itemPath === ROUTES.ASSETS && path.startsWith("/assets/")) ||
      (itemPath === ROUTES.PLANS && path.startsWith("/plans/"));
    item.classList.toggle("active", active);
  });

  switch (routeName) {
    case "assets":
      loadAssets();
      break;
    case "asset-detail":
      loadAssetDetail(params.asset_id);
      break;
    case "task":
      renderTaskPage();
      break;
    case "generation":
      startGenerationPolling(params.generation_run_id);
      break;
    case "plans":
      loadPlans();
      break;
    case "plan-version":
      loadPlanVersion(params.plan_asset_id, params.plan_version_id);
      break;
  }

  renewalBack.style.display = path === ROUTES.HOME ? "none" : "flex";
}

function bindSpaceUploadEvents() {
  const selectButton = document.getElementById("selectSpaceBtn");
  const fileInput = document.getElementById("spaceFileInput");
  const dropZone = document.getElementById("spaceUploadZone");
  if (!selectButton || !fileInput) return;

  selectButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) handleSpaceFile(file);
    event.target.value = "";
  });

  if (dropZone) {
    for (const eventName of ["dragenter", "dragover"]) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("is-dragging");
      });
    }
    for (const eventName of ["dragleave", "drop"]) {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("is-dragging");
      });
    }
    dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) handleSpaceFile(file);
    });
  }
}

async function handleSpaceFile(file) {
  const health = getState().backendHealth || (await checkBackendHealth());
  if (!health) {
    showToast("后端未连接，无法上传空间");
    return;
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("仅支持 JPEG、PNG 或 WebP");
    return;
  }
  const maxBytes =
    health.limits?.upload_file_bytes || DEFAULT_UPLOAD_LIMIT;
  if (file.size > maxBytes) {
    showToast(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
    return;
  }

  try {
    setLoading(true);
    showToast("正在安全上传空间照片…");
    const [media, referenceAssetId] = await Promise.all([
      uploadMedia(file, { purpose: "space_source" }),
      ensureVideoReferenceAsset()
    ]);
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
        default_budget_cny: DEFAULT_BUDGET_CNY,
        long_term_constraints: ["no_drilling"]
      }
    });
    const detail = await waitForAssetParse(created.asset_id);
    if (detail.parse_state === "failed") {
      throw new Error(
        detail.latest_parse_run?.error?.message || "空间解析失败"
      );
    }
    const editableRegionId =
      detail.attributes?.editable_regions?.[0]?.editable_region_id || null;
    const currentVersion = detail.current_space_version;
    const draft = createDesignTaskDraft({
      trigger: "space_upload",
      space_asset_id: created.asset_id,
      space_version_id:
        currentVersion?.space_version_id ||
        created.current_space_version_id,
      space_name: detail.name,
      space_sealed: currentVersion?.state === "sealed",
      space_parse_state: detail.parse_state,
      space_version_resource_version: currentVersion?.resource_version,
      editable_region_id: editableRegionId,
      reference_asset_ids: referenceAssetId ? [referenceAssetId] : [],
      goal: DEFAULT_GOAL,
      goal_codes: ["organization", "ambient_lighting"],
      constraints: {
        budget_cny: DEFAULT_BUDGET_CNY,
        no_drilling: true,
        keep_detected_object_ids: [],
        pet_context: "none"
      }
    });
    saveDesignTaskDraft(draft);
    showToast("空间解析完成，请确认后生成方案");
    navigate("/task");
  } catch (error) {
    console.error("Space upload failed:", error);
    showToast(errorMessage(error, "上传空间失败"));
  } finally {
    setLoading(false);
  }
}

async function waitForAssetParse(assetId) {
  let detail = null;
  for (let attempt = 0; attempt < PARSE_POLL_ATTEMPTS; attempt += 1) {
    detail = await getAsset(assetId);
    if (
      ["needs_confirmation", "ready", "failed"].includes(
        detail.parse_state
      )
    ) {
      return detail;
    }
    await delay(PARSE_POLL_INTERVAL_MS);
  }
  throw new Error("空间解析超时，请稍后从资产中心重试");
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
      author_display: context.author_display || "演示作者",
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
      user_note: (context.caption || "来自短视频入口的空间灵感").slice(
        0,
        500
      )
    }
  })
    .then((asset) => asset.asset_id)
    .finally(() => {
      videoReferencePromise = null;
    });
  return videoReferencePromise;
}

async function renderTaskPage() {
  const container = document.getElementById("taskContent");
  if (!container) return;
  container.innerHTML = `
    <div class="renewal-card renewal-card--loading">
      <div class="loading-spinner"></div>
      <p>正在读取后端任务状态…</p>
    </div>
  `;

  try {
    const referenceAssetId = await ensureVideoReferenceAsset();
    const draft = getState().designTaskDraft;
    if (!draft?.space_asset_id) {
      await renderSpacePicker(container, referenceAssetId);
      return;
    }

    const detail = await getAsset(draft.space_asset_id);
    const asset = adaptAsset(detail);
    const version = detail.current_space_version;
    const isSealed =
      version?.state === "sealed" || draft.space_sealed === true;
    const previewUrl = resolveBackendUrl(detail.preview?.url);
    const referenceIds = [
      ...new Set([
        ...(draft.reference_asset_ids || []),
        ...(referenceAssetId ? [referenceAssetId] : [])
      ])
    ];

    if (!isSealed) {
      const canConfirm = ["needs_confirmation", "ready"].includes(
        detail.parse_state
      );
      const detectedObjects =
        detail.attributes?.detected_objects || [];
      container.innerHTML = `
        <div class="renewal-card task-space-card">
          <div class="task-space-card__media">
            ${
              previewUrl
                ? `<img src="${escapeHtml(previewUrl)}" alt="待确认空间" />`
                : "<span>🖼</span>"
            }
          </div>
          <div class="task-space-card__copy">
            <span class="eyebrow">空间解析</span>
            <h2>${escapeHtml(detail.name)}</h2>
            <p>识别到 ${detectedObjects.length} 个物体，当前状态：${escapeHtml(
              getParseStateText(detail.parse_state)
            )}。</p>
          </div>
        </div>
        <div class="renewal-card">
          <div class="renewal-card__title">确认空间事实</div>
          <div class="renewal-card__body">
            <p>确认后会封存当前空间版本；后续生成只引用这个版本，不会覆盖原图或旧方案。</p>
            <div class="object-chips">
              ${detectedObjects
                .slice(0, 8)
                .map(
                  (item) =>
                    `<span>${escapeHtml(
                      item.display_name ||
                        item.label ||
                        item.category ||
                        item.type ||
                        "物体"
                    )}</span>`
                )
                .join("")}
            </div>
          </div>
          ${
            canConfirm
              ? '<button class="renewal-button renewal-button--primary" type="button" id="confirmSpaceBtn">确认空间解析并继续</button>'
              : '<button class="renewal-button renewal-button--secondary" type="button" id="refreshSpaceBtn">刷新解析状态</button>'
          }
        </div>
      `;

      document
        .getElementById("refreshSpaceBtn")
        ?.addEventListener("click", renderTaskPage);
      document
        .getElementById("confirmSpaceBtn")
        ?.addEventListener("click", async () => {
          const editableRegionId =
            draft.editable_region_id ||
            detail.attributes?.editable_regions?.[0]?.editable_region_id;
          if (!editableRegionId) {
            showToast("后端未返回可编辑区域，暂不能确认");
            return;
          }
          try {
            setLoading(true);
            const sealed = await confirmSpaceVersion(
              detail.asset_id,
              version.space_version_id,
              { editable_region_id: editableRegionId, seal: true },
              version.resource_version
            );
            saveDesignTaskDraft({
              ...draft,
              reference_asset_ids: referenceIds,
              editable_region_id: editableRegionId,
              space_sealed: true,
              space_parse_state: sealed.parse_state,
              space_version_resource_version: sealed.resource_version,
              updatedAt: Date.now()
            });
            showToast("空间版本已确认");
            renderTaskPage();
          } catch (error) {
            console.error("Confirm space failed:", error);
            showToast(errorMessage(error, "确认空间失败"));
          } finally {
            setLoading(false);
          }
        });
      return;
    }

    const nextDraft = {
      ...draft,
      space_name: detail.name,
      space_sealed: true,
      reference_asset_ids: referenceIds
    };
    saveDesignTaskDraft(nextDraft);
    renderDesignTaskForm(container, nextDraft, asset, previewUrl);
  } catch (error) {
    console.error("Render task failed:", error);
    container.innerHTML = `
      <div class="renewal-card">
        <div class="renewal-empty">
          <div class="renewal-empty__icon">⚠️</div>
          <div class="renewal-empty__text">${escapeHtml(
            errorMessage(error, "读取任务失败")
          )}</div>
        </div>
        <button class="renewal-button renewal-button--secondary" type="button" id="retryTaskBtn">重试</button>
      </div>
    `;
    document
      .getElementById("retryTaskBtn")
      ?.addEventListener("click", renderTaskPage);
  }
}

async function renderSpacePicker(container, referenceAssetId) {
  const response = await listAssets({
    asset_type: "space",
    sort: "recent",
    limit: 10
  });
  const spaces = adaptAssets(response.items || []);
  container.innerHTML = `
    ${
      referenceAssetId
        ? `<div class="context-banner"><span>短视频灵感已保存</span><strong>下一步选择要焕新的空间</strong></div>`
        : ""
    }
    <div class="renewal-card">
      <div class="renewal-card__title">选择一个空间</div>
      <div class="renewal-card__body">
        ${
          spaces.length
            ? `<div class="space-picker">
                ${spaces
                  .map(
                    (space) => `
                      <button class="space-picker__item" type="button" data-space-id="${escapeHtml(
                        space.assetId
                      )}">
                        <span class="space-picker__icon">⌂</span>
                        <span>
                          <strong>${escapeHtml(space.name)}</strong>
                          <small>${escapeHtml(
                            getParseStateText(space.parseState)
                          )}</small>
                        </span>
                      </button>
                    `
                  )
                  .join("")}
              </div>`
            : '<div class="renewal-empty"><div class="renewal-empty__icon">⌂</div><div class="renewal-empty__text">还没有可用空间</div></div>'
        }
      </div>
      <button class="renewal-button renewal-button--primary" type="button" id="newSpaceFromTask">上传新空间</button>
    </div>
  `;

  container.querySelectorAll("[data-space-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        setLoading(true);
        const detail = await getAsset(button.dataset.spaceId);
        const version = detail.current_space_version;
        if (!version) throw new Error("该空间没有可用版本");
        saveDesignTaskDraft(
          createDesignTaskDraft({
            trigger: "space_reuse",
            space_asset_id: detail.asset_id,
            space_version_id: version.space_version_id,
            space_name: detail.name,
            space_sealed: version.state === "sealed",
            space_parse_state: detail.parse_state,
            space_version_resource_version: version.resource_version,
            editable_region_id:
              detail.attributes?.selected_editable_region_id ||
              detail.attributes?.editable_regions?.[0]?.editable_region_id ||
              null,
            reference_asset_ids: referenceAssetId
              ? [referenceAssetId]
              : [],
            goal: DEFAULT_GOAL,
            goal_codes: ["organization", "ambient_lighting"],
            constraints: {
              budget_cny: DEFAULT_BUDGET_CNY,
              no_drilling: true,
              keep_detected_object_ids: [],
              pet_context: "none"
            }
          })
        );
        await renderTaskPage();
      } catch (error) {
        showToast(errorMessage(error, "选择空间失败"));
      } finally {
        setLoading(false);
      }
    });
  });
  document.getElementById("newSpaceFromTask")?.addEventListener("click", () => {
    navigate("/spaces/new");
  });
}

function renderDesignTaskForm(container, draft, asset, previewUrl) {
  const constraints = draft.constraints || {};
  const goalCodes = new Set(draft.goal_codes || []);
  container.innerHTML = `
    <div class="renewal-card task-space-card task-space-card--compact">
      <div class="task-space-card__media">
        ${
          previewUrl
            ? `<img src="${escapeHtml(previewUrl)}" alt="已选空间" />`
            : "<span>⌂</span>"
        }
      </div>
      <div class="task-space-card__copy">
        <span class="eyebrow">已确认空间</span>
        <h2>${escapeHtml(asset.name || draft.space_name)}</h2>
        <p>${asset.objectCount} 个已识别物体 · 空间版本已封存</p>
      </div>
    </div>
    <form class="renewal-card task-form" id="designTaskForm">
      <div class="renewal-card__title">这次想怎么焕新？</div>
      <label class="task-field">
        <span>目标描述</span>
        <textarea name="goal" maxlength="500" required>${escapeHtml(
          draft.goal || DEFAULT_GOAL
        )}</textarea>
      </label>
      <div class="task-field">
        <span>重点目标</span>
        <div class="goal-grid">
          <label><input type="checkbox" name="goal_code" value="organization" ${
            goalCodes.has("organization") ? "checked" : ""
          } />收纳整理</label>
          <label><input type="checkbox" name="goal_code" value="ambient_lighting" ${
            goalCodes.has("ambient_lighting") ? "checked" : ""
          } />氛围照明</label>
          <label><input type="checkbox" name="goal_code" value="study_focus" ${
            goalCodes.has("study_focus") ? "checked" : ""
          } />专注学习</label>
          <label><input type="checkbox" name="goal_code" value="reuse_existing" ${
            goalCodes.has("reuse_existing") ? "checked" : ""
          } />保留现有物品</label>
        </div>
      </div>
      <div class="task-form__row">
        <label class="task-field">
          <span>预算（元）</span>
          <input name="budget" type="number" min="187" max="1000000" step="1" value="${escapeHtml(
            constraints.budget_cny || DEFAULT_BUDGET_CNY
          )}" required />
        </label>
        <label class="task-field">
          <span>宠物环境</span>
          <select name="pet_context">
            ${[
              ["none", "无宠物"],
              ["cat", "有猫"],
              ["dog", "有狗"],
              ["other", "其他宠物"]
            ]
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${
                    (constraints.pet_context || "none") === value
                      ? "selected"
                      : ""
                  }>${label}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
      <label class="task-toggle">
        <input type="checkbox" name="no_drilling" ${
          constraints.no_drilling !== false ? "checked" : ""
        } />
        <span>免打孔改造</span>
      </label>
      ${
        draft.reference_asset_ids?.length
          ? '<div class="context-banner context-banner--inline"><span>已带入视频灵感</span><strong>方案会参考视频风格，但不会复制完整视频</strong></div>'
          : ""
      }
      <button class="renewal-button renewal-button--primary" type="submit">生成我的焕新方案</button>
    </form>
  `;

  document
    .getElementById("designTaskForm")
    ?.addEventListener("submit", submitDesignTask);
}

async function submitDesignTask(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const draft = getState().designTaskDraft;
  const goalCodes = form.getAll("goal_code");
  const budget = Number(form.get("budget"));
  const nextDraft = {
    ...draft,
    goal: String(form.get("goal") || "").trim(),
    goal_codes: goalCodes,
    constraints: {
      ...(draft.constraints || {}),
      budget_cny: budget,
      no_drilling: form.get("no_drilling") === "on",
      pet_context: String(form.get("pet_context") || "none")
    },
    updatedAt: Date.now()
  };
  saveDesignTaskDraft(nextDraft);

  try {
    setLoading(true);
    const request = buildDesignRequest({
      trigger: nextDraft.trigger || "space_reuse",
      space_asset_id: nextDraft.space_asset_id,
      space_version_id: nextDraft.space_version_id,
      reference_asset_ids: nextDraft.reference_asset_ids || [],
      goal: nextDraft.goal,
      goal_codes: nextDraft.goal_codes,
      constraints: nextDraft.constraints,
      editable_region_id: nextDraft.editable_region_id,
      options: { analysis_mode: "auto", include_trace: true }
    });
    const designRequest = await createDesignRequest(request);
    if (!designRequest.can_start_generation) {
      const issue = designRequest.missing_fields?.find(
        (field) => field.blocking
      );
      showToast(issue?.message || "任务仍需补充信息");
      return;
    }
    const run = await createGenerationRun(
      designRequest.design_request_id,
      { schema_version: "1.0", reason: "initial" }
    );
    const controller = new AbortController();
    setGenerationRun(run, controller);
    navigate(`/generation/${run.generation_run_id}`);
  } catch (error) {
    console.error("Create design task failed:", error);
    showToast(errorMessage(error, "创建设计任务失败"));
  } finally {
    setLoading(false);
  }
}

async function loadAssets() {
  const container = document.getElementById("assetsList");
  if (!container) return;
  container.innerHTML =
    '<div class="renewal-card--loading"><div class="loading-spinner"></div><p>正在读取持久资产…</p></div>';
  try {
    const response = await listAssets({ sort: "recent", limit: 30 });
    const assets = adaptAssets(response.items || []);
    container.innerHTML = assets.length
      ? `<div class="asset-list">
          ${assets
            .map(
              (asset) => `
                <button class="asset-row" type="button" data-asset-id="${escapeHtml(
                  asset.assetId
                )}">
                  <span class="asset-row__icon">${
                    asset.type === "space"
                      ? "⌂"
                      : asset.type === "inspiration"
                        ? "✦"
                        : "◇"
                  }</span>
                  <span class="asset-row__copy">
                    <strong>${escapeHtml(asset.name)}</strong>
                    <small>${escapeHtml(
                      getAssetTypeText(asset.type)
                    )} · ${escapeHtml(
                      getParseStateText(asset.parseState)
                    )}</small>
                  </span>
                  <span class="renewal-badge ${getParseStateClass(
                    asset.parseState
                  )}">${escapeHtml(
                    isDemoAsset(asset) ? "示例" : asset.lifecycle
                  )}</span>
                </button>
              `
            )
            .join("")}
        </div>`
      : '<div class="renewal-empty"><div class="renewal-empty__icon">📦</div><div class="renewal-empty__text">暂无资产</div></div>';

    container.querySelectorAll("[data-asset-id]").forEach((button) => {
      button.addEventListener("click", () => {
        navigate(`/assets/${button.dataset.assetId}`);
      });
    });
  } catch (error) {
    console.error("Load assets failed:", error);
    container.innerHTML = failureCard(errorMessage(error, "加载资产失败"));
  }
}

async function loadAssetDetail(assetId) {
  const container = document.getElementById("assetsList");
  if (!container) return;
  try {
    const detail = await getAsset(assetId);
    const asset = adaptAsset(detail);
    const previewUrl = resolveBackendUrl(detail.preview?.url);
    container.innerHTML = `
      <div class="asset-detail">
        ${
          previewUrl
            ? `<img class="asset-detail__image" src="${escapeHtml(
                previewUrl
              )}" alt="${escapeHtml(asset.name)}" />`
            : '<div class="asset-detail__placeholder">⌂</div>'
        }
        <span class="eyebrow">${escapeHtml(
          getAssetTypeText(asset.type)
        )}</span>
        <h2>${escapeHtml(asset.name)}</h2>
        <p>${escapeHtml(getParseStateText(asset.parseState))} · ${
          asset.objectCount
        } 个物体 · ${escapeHtml(asset.lifecycle)}</p>
        ${
          asset.type === "space"
            ? '<button class="renewal-button renewal-button--primary" type="button" id="useAssetBtn">用这个空间创建设计任务</button>'
            : ""
        }
        <button class="renewal-button renewal-button--secondary" type="button" id="backToAssetsBtn">返回资产列表</button>
      </div>
    `;
    document
      .getElementById("backToAssetsBtn")
      ?.addEventListener("click", () => navigate("/assets"));
    document.getElementById("useAssetBtn")?.addEventListener("click", () => {
      const version = detail.current_space_version;
      saveDesignTaskDraft(
        createDesignTaskDraft({
          trigger: "asset_detail",
          space_asset_id: detail.asset_id,
          space_version_id: version?.space_version_id,
          space_name: detail.name,
          space_sealed: version?.state === "sealed",
          space_parse_state: detail.parse_state,
          space_version_resource_version: version?.resource_version,
          editable_region_id:
            detail.attributes?.selected_editable_region_id ||
            detail.attributes?.editable_regions?.[0]?.editable_region_id ||
            null,
          reference_asset_ids: [],
          goal: DEFAULT_GOAL,
          goal_codes: ["organization", "ambient_lighting"],
          constraints: {
            budget_cny: DEFAULT_BUDGET_CNY,
            no_drilling: true,
            keep_detected_object_ids: [],
            pet_context: "none"
          }
        })
      );
      navigate("/task");
    });
  } catch (error) {
    container.innerHTML = failureCard(errorMessage(error, "加载资产失败"));
  }
}

function bindGenerationEvents() {
  document
    .getElementById("cancelGeneration")
    ?.addEventListener("click", async () => {
      const routeRunId = parseRoute().params.generation_run_id;
      const runId =
        getState().currentGenerationRun?.generation_run_id || routeRunId;
      if (!runId) return;
      try {
        await cancelGenerationRun(runId);
        stopGenerationPolling();
        cancelGeneration();
        showToast("已取消生成");
        navigate("/task");
      } catch (error) {
        showToast(errorMessage(error, "取消生成失败"));
      }
    });
}

function startGenerationPolling(generationRunId) {
  stopGenerationPolling();
  generationController = new AbortController();
  generationPollCount = 0;
  setGenerationRun(
    {
      generation_run_id: generationRunId,
      status: "queued",
      phase: "input_validation"
    },
    generationController
  );

  const poll = async () => {
    try {
      const run = await getGenerationRun(generationRunId, {
        signal: generationController.signal
      });
      const activeRunId = parseRoute().params.generation_run_id;
      if (activeRunId !== generationRunId) return;
      setGenerationRun(run, generationController);
      updateGenerationStatus(run);

      if (run.status === "succeeded") {
        stopGenerationPolling();
        const planAssetId = run.result?.plan_asset_id;
        const versionId =
          run.result?.plan_version?.plan_version_id;
        showToast("方案已生成并保存");
        if (planAssetId && versionId) {
          navigate(`/plans/${planAssetId}/versions/${versionId}`);
        } else {
          navigate("/plans");
        }
        return;
      }
      if (run.status === "failed") {
        stopGenerationPolling();
        showToast(run.error?.message || "方案生成失败");
        navigate("/task");
        return;
      }
      if (run.status === "cancelled") {
        stopGenerationPolling();
        showToast("生成已取消");
        navigate("/task");
        return;
      }

      generationPollCount += 1;
      generationTimer = setTimeout(
        poll,
        generationPollCount < 10 ? 1000 : 2000
      );
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Poll generation failed:", error);
      document.getElementById("generationStatus").textContent =
        "连接中断，正在重试…";
      generationTimer = setTimeout(poll, 2000);
    }
  };
  poll();
}

function updateGenerationStatus(run) {
  const phases = {
    input_validation: "正在验证任务输入…",
    space_analysis: "正在理解你的空间…",
    reference_analysis: "正在提取灵感特征…",
    constraint_filter: "正在核对预算与硬约束…",
    matching: "正在匹配可执行商品组合…",
    planning: "正在编排焕新方案…",
    rendering: "正在准备效果示意…",
    validation: "正在做确定性校验…",
    packaging: "正在保存方案版本…"
  };
  const status = document.getElementById("generationStatus");
  const progress = document.getElementById("generationProgress");
  if (status) {
    status.textContent =
      phases[run.phase] ||
      (run.status === "queued" ? "任务正在排队…" : "正在处理…");
  }
  if (progress) {
    const total = run.phase_total || 9;
    const current = run.phase_index || 1;
    progress.style.width = `${Math.max(
      8,
      Math.min(100, (current / total) * 100)
    )}%`;
  }
}

async function loadPlans() {
  const container = document.getElementById("plansContent");
  if (!container) return;
  const shellTitle = document.getElementById("plansShellTitle");
  if (shellTitle) shellTitle.style.display = "";
  container.innerHTML =
    '<div class="renewal-card--loading"><div class="loading-spinner"></div><p>正在读取持久方案…</p></div>';
  try {
    const response = await listPlans({ limit: 30 });
    const plans = response.items || [];
    container.innerHTML = plans.length
      ? `<div class="plan-list">
          ${plans
            .map(
              (plan) => `
                <button class="plan-row" type="button"
                  data-plan-id="${escapeHtml(plan.plan_asset_id)}"
                  data-version-id="${escapeHtml(
                    plan.current_plan_version_id
                  )}">
                  <span class="plan-row__version">v${escapeHtml(
                    plan.current_version?.version || 1
                  )}</span>
                  <span class="plan-row__copy">
                    <strong>${escapeHtml(
                      plan.current_version?.title || "焕新方案"
                    )}</strong>
                    <small>${escapeHtml(
                      plan.space_name || "空间"
                    )} · ${formatPrice(
                      plan.current_version?.total_price_cny
                    )}</small>
                  </span>
                  <span class="renewal-badge renewal-badge--gold">${escapeHtml(
                    plan.current_version?.source_mode || "demo"
                  )}</span>
                </button>
              `
            )
            .join("")}
        </div>`
      : '<div class="renewal-empty"><div class="renewal-empty__icon">📋</div><div class="renewal-empty__text">暂无方案<br>完成设计任务后会自动保存在这里</div></div>';
    container.querySelectorAll("[data-plan-id]").forEach((button) => {
      button.addEventListener("click", () => {
        navigate(
          `/plans/${button.dataset.planId}/versions/${button.dataset.versionId}`
        );
      });
    });
  } catch (error) {
    container.innerHTML = failureCard(errorMessage(error, "加载方案失败"));
  }
}

async function loadPlanVersion(planAssetId, planVersionId) {
  const container = document.getElementById("plansContent");
  if (!container) return;
  const shellTitle = document.getElementById("plansShellTitle");
  if (shellTitle) shellTitle.style.display = "none";
  try {
    let actualVersionId = planVersionId;
    if (planVersionId === "latest") {
      const plan = await getPlan(planAssetId);
      actualVersionId = plan.current_plan_version_id;
    }
    const envelope = await getPlanVersion(
      planAssetId,
      actualVersionId
    );
    renderPlanResult(container, adaptPlanResult(envelope));
  } catch (error) {
    console.error("Load plan version failed:", error);
    container.innerHTML = failureCard(errorMessage(error, "加载方案失败"));
  }
}

function renderPlanResult(container, viewModel) {
  if (!viewModel) {
    container.innerHTML = failureCard("方案数据为空");
    return;
  }
  const validationChecks =
    viewModel.validation?.checks || viewModel.validation?.issues || [];
  container.innerHTML = `
    <article class="plan-result">
      <header class="plan-result__header">
        <div>
          <span class="eyebrow">方案 v${escapeHtml(
            viewModel.version
          )}</span>
          <h2>${escapeHtml(viewModel.title || "焕新方案")}</h2>
        </div>
        <span class="renewal-badge renewal-badge--gold">${escapeHtml(
          viewModel.sourceBadge
        )}</span>
      </header>
      ${
        viewModel.beforeImage || viewModel.afterImage
          ? `<div class="result-compare">
              ${
                viewModel.beforeImage
                  ? `<figure><img src="${escapeHtml(
                      viewModel.beforeImage
                    )}" alt="焕新前" /><figcaption>焕新前</figcaption></figure>`
                  : ""
              }
              ${
                viewModel.afterImage
                  ? `<figure><img src="${escapeHtml(
                      viewModel.afterImage
                    )}" alt="AI 设计示意" /><figcaption>AI 设计示意</figcaption></figure>`
                  : ""
              }
            </div>`
          : ""
      }
      ${
        viewModel.renderDisclaimer
          ? `<p class="result-disclaimer">${escapeHtml(
              viewModel.renderDisclaimer
            )}</p>`
          : ""
      }
      <section class="renewal-card result-summary">
        <span>预计商品合计</span>
        <strong>${formatPrice(viewModel.totalPriceCny)}</strong>
        <p>${escapeHtml(viewModel.summary)}</p>
      </section>
      ${
        viewModel.products?.length
          ? `<section class="renewal-card">
              <div class="renewal-card__title">候选商品</div>
              <div class="product-list">
                ${viewModel.products
                  .map(
                    (product) => `
                      <div class="product-row">
                        <span class="product-row__icon">◇</span>
                        <span class="product-row__copy">
                          <strong>${escapeHtml(product.name)}</strong>
                          <small>${escapeHtml(
                            product.reason || product.dimensionsLabel
                          )}</small>
                        </span>
                        <b>${formatPrice(product.priceCny)}</b>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }
      ${
        viewModel.steps?.length
          ? `<section class="renewal-card">
              <div class="renewal-card__title">执行步骤</div>
              <ol class="step-list">
                ${viewModel.steps
                  .map(
                    (step) => `
                      <li>
                        <span>${escapeHtml(step.title)}</span>
                        <p>${escapeHtml(step.description)}</p>
                      </li>
                    `
                  )
                  .join("")}
              </ol>
            </section>`
          : ""
      }
      ${
        validationChecks.length
          ? `<section class="renewal-card">
              <div class="renewal-card__title">可信校验</div>
              <div class="validation-list">
                ${validationChecks
                  .slice(0, 8)
                  .map(
                    (check) => `
                      <div class="validation-row validation-row--${escapeHtml(
                        check.status || "warn"
                      )}">
                        <span>${check.status === "pass" ? "✓" : "!"}</span>
                        <p>${escapeHtml(check.message || check.code)}</p>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }
      <button class="renewal-button renewal-button--secondary" type="button" id="backToPlansBtn">返回方案历史</button>
    </article>
  `;
  document
    .getElementById("backToPlansBtn")
    ?.addEventListener("click", () => navigate("/plans"));
}

function failureCard(message) {
  return `
    <div class="renewal-empty">
      <div class="renewal-empty__icon">⚠️</div>
      <div class="renewal-empty__text">${escapeHtml(message)}</div>
    </div>
  `;
}

init();

export { init, handleRouteChange };
