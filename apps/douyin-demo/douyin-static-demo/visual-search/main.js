import {
  buildVideoSourceContext,
  isValidSelection,
  hasGenerationReadySourceComponent,
  normalizeSelection,
  selectionToCss,
  serializeLocalAsset,
  buildRenewalEntryContext,
  buildInspirationEntryContext
} from "./model.js";
import { getDemoVisualResults } from "./fixtures.js";
import {
  confirmVisualSearchCandidate,
  confirmVideoInspirationIntent,
  createVideoInspiration,
  getVisualSearchCapability,
  persistDemoCandidate,
  runVisualSearch
} from "../api/visual-search-client.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
const formatTime = (milliseconds) => {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

class VisualSearchExperience {
  constructor() {
    this.phone = document.querySelector(".phone");
    this.overlay = null;
    this.slide = null;
    this.video = null;
    this.frameDataUrl = "";
    this.selection = { x: 0.16, y: 0.3, width: 0.58, height: 0.27 };
    this.sourceContext = null;
    this.cropBlob = null;
    this.cropUrl = "";
    this.queryId = null;
    this.results = [];
    this.selectedCandidate = null;
    this.componentIdentity = null;
    this.deliveryMode = "demo_fixture";
    this.inspirationAsset = null;
    this.selectedIntentType = null;
    this.queryId = null;
    this.results = [];
    this.selectedCandidate = null;
    this.componentIdentity = null;
    this.deliveryMode = "demo_fixture";
    this.abortController = null;
    this.bindEntry();
  }

  bindEntry() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest(".visual-search-trigger");
      if (!trigger) return;
      event.stopPropagation();
      const slide = trigger.closest(".video-slide");
      const video = slide?.querySelector("video");
      if (slide && video) this.open(slide, video);
    });
  }

  async open(slide, video) {
    this.close();
    this.slide = slide;
    this.video = video;
    video.pause();
    slide.classList.add("paused", "user-paused", "visual-search-active");
    this.frameDataUrl = this.captureFrame(video);
    this.selection =
      slide.dataset.videoId === "video-2"
        ? { x: 0.13, y: 0.26, width: 0.61, height: 0.31 }
        : { x: 0.18, y: 0.3, width: 0.58, height: 0.27 };
    this.inspirationAsset = null;
    this.selectedIntentType = null;
    this.overlay = document.createElement("section");
    this.overlay.className = "visual-search-layer";
    this.overlay.setAttribute("aria-label", "视频画面视觉搜索");
    document.body.classList.add("visual-search-mode");
    this.phone.append(this.overlay);
    this.renderSelection();
  }

  captureFrame(video) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const context = canvas.getContext("2d");
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    } catch {
      return "";
    }
  }

  close() {
    this.abortController?.abort();
    this.abortController = null;
    if (this.cropUrl) URL.revokeObjectURL(this.cropUrl);
    this.cropUrl = "";
    this.overlay?.remove();
    this.overlay = null;
    this.slide?.classList.remove("visual-search-active");
    document.body.classList.remove("visual-search-mode");
  }

  headerMarkup(title, eyebrow, backLabel = "关闭") {
    return `
      <header class="visual-search-topbar">
        <button type="button" class="visual-search-back" data-vs-close aria-label="${backLabel}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div>
          <small>${eyebrow}</small>
          <strong>${title}</strong>
        </div>
        <span class="visual-search-time">${formatTime(this.video?.currentTime * 1000 || 0)}</span>
      </header>
    `;
  }

  bindClose() {
    this.overlay
      ?.querySelector("[data-vs-close]")
      ?.addEventListener("click", () => this.close());
  }

  renderSelection(message = "") {
    this.overlay.innerHTML = `
      <div class="visual-search-page visual-search-page--overlay">
        <div class="visual-search-selection-stage">
          ${
            this.frameDataUrl
              ? `<div class="visual-search-frame-stage">
                  <img src="${this.frameDataUrl}" alt="当前暂停的视频画面" draggable="false" />
                  <div class="visual-search-selection" aria-label="当前框选区域">
                    <i></i><i></i><i></i><i></i>
                    <span>我喜欢这里</span>
                  </div>
                  <div class="visual-search-draw-surface" aria-label="拖动框选物品"></div>
                </div>`
              : `<div class="visual-search-frame-fallback"><span>当前帧暂不可截取</span><small>可使用整帧来源上下文继续演示</small></div>`
          }
        </div>
        <div class="visual-search-top-bar">
          <button type="button" class="visual-search-close" data-vs-close aria-label="关闭">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span class="visual-search-hint">轻轻拖动，框住喜欢</span>
          <span class="visual-search-time">${formatTime(this.video?.currentTime * 1000 || 0)}</span>
        </div>
        <div class="visual-search-bottom-sheet" data-vs-sheet>
          <div class="visual-search-sheet-handle"></div>
          <div class="visual-search-sheet-content" data-vs-sheet-content>
            ${
              message
                ? `<p class="visual-search-selection-error" role="alert">${escapeHtml(
                    message
                  )}</p>`
                : ""
            }
            <div class="visual-search-loading-state" data-vs-loading hidden>
              <div class="visual-search-query-card">
                <div class="visual-search-crop">
                  <span class="visual-search-scanline"></span>
                </div>
                <span class="visual-search-query-tag">视频灵感 · 01</span>
              </div>
              <div class="visual-search-thinking">
                <strong>正在读懂你喜欢的内容</strong>
                <p>判断这是具体组件，还是整套风格与氛围</p>
                <div><i></i><i></i><i></i></div>
              </div>
              <ol class="visual-search-progress">
                <li class="done"><span></span>收好你选中的画面</li>
                <li class="active"><span></span>提取组件或风格特征</li>
                <li><span></span>等你确认后带入我家</li>
              </ol>
            </div>
            <div class="visual-search-results-state" data-vs-results hidden></div>
          </div>
        </div>
      </div>
    `;
    this.bindClose();
    this.updateSelectionElement();
    this.bindSelectionDrawing();
  }

  updateSelectionElement() {
    const element = this.overlay?.querySelector(".visual-search-selection");
    if (!element) return;
    Object.assign(element.style, selectionToCss(this.selection));
  }

  bindSelectionDrawing() {
    const surface = this.overlay.querySelector(".visual-search-draw-surface");
    const stage = this.overlay.querySelector(".visual-search-frame-stage");
    if (!surface || !stage) return;
    let start = null;
    const pointFromEvent = (event) => {
      const rect = stage.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height
      };
    };
    surface.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      surface.setPointerCapture(event.pointerId);
      start = pointFromEvent(event);
      this.selection = { x: start.x, y: start.y, width: 0, height: 0 };
      this.updateSelectionElement();
    });
    surface.addEventListener("pointermove", (event) => {
      if (!start) return;
      this.selection = normalizeSelection(start, pointFromEvent(event));
      this.updateSelectionElement();
    });
    let searching = false;
    const finish = () => {
      if (searching) { start = null; return; }
      if (!start) return;
      if (!isValidSelection(this.selection)) {
        start = null;
        this.renderSelection("框选范围太小，请多留一点物品边缘");
        return;
      }
      searching = true;
      start = null;
      this.search().finally(() => { searching = false; });
    };
    surface.addEventListener("pointerup", finish);
    surface.addEventListener("pointercancel", finish);
  }

  async search() {
    if (!isValidSelection(this.selection)) {
      this.renderSelection("框选范围太小，请多留一点物品边缘");
      return;
    }
    this.sourceContext = buildVideoSourceContext(
      this.slide,
      this.video,
      this.selection
    );
    this.cropBlob = await this.createCropBlob();
    if (this.cropUrl) URL.revokeObjectURL(this.cropUrl);
    this.cropUrl = this.cropBlob
      ? URL.createObjectURL(this.cropBlob)
      : this.frameDataUrl;
    this.showInlineLoading();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    try {
      const [asset, visualSearch] = await Promise.all([
        createVideoInspiration(
          {
            cropBlob: this.cropBlob,
            sourceContext: this.sourceContext
          },
          { signal }
        ),
        this.resolveSearch(signal),
        delay(650)
      ]);
      if (signal.aborted) return;
      if (asset.parse_state === "failed") {
        throw new Error(
          asset.latest_parse_run?.error?.message || "灵感识别失败，请重新圈选"
        );
      }
      this.inspirationAsset = asset;
      this.queryId = visualSearch.queryId;
      this.results = visualSearch.candidates;
      this.selectedCandidate = visualSearch.candidates[0] || null;
      this.componentIdentity = visualSearch.componentIdentity;
      this.deliveryMode = visualSearch.deliveryMode;
      const suggested = asset.attributes?.intent_analysis?.suggested_type;
      this.selectedIntentType = this.componentIdentity
        ? "component"
        : ["component", "style"].includes(suggested)
          ? suggested
          : null;
      this.renderIntentConfirmation();
    } catch (error) {
      if (error?.name === "AbortError") return;
      this.renderEntryError(error?.message || "灵感识别失败，请重新圈选");
    }
  }

  async resolveSearch(signal) {
    try {
      const capability = await getVisualSearchCapability({ signal });
      if (!capability.advertised || !this.cropBlob) {
        return {
          candidates: getDemoVisualResults(),
          queryId: null,
          deliveryMode: "demo_fixture",
          componentIdentity: null
        };
      }
      const query = await runVisualSearch({
        cropBlob: this.cropBlob,
        sourceContext: this.sourceContext,
        signal
      });
      return {
        candidates: query.candidates || [],
        queryId: query.visual_search_query_id,
        deliveryMode:
          query.source_mode === "live" ? "live" : "backend_fallback",
        componentIdentity: query.component_identity || null
      };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return {
        candidates: getDemoVisualResults(),
        queryId: null,
        deliveryMode: "demo_fixture",
        componentIdentity: null
      };
    }
  }

  createCropBlob() {
    return new Promise((resolve) => {
      if (!this.frameDataUrl) {
        resolve(null);
        return;
      }
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const sourceWidth = Math.max(
          1,
          Math.round(image.naturalWidth * this.selection.width)
        );
        const sourceHeight = Math.max(
          1,
          Math.round(image.naturalHeight * this.selection.height)
        );
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        canvas.getContext("2d").drawImage(
          image,
          image.naturalWidth * this.selection.x,
          image.naturalHeight * this.selection.y,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight
        );
        canvas.toBlob(resolve, "image/webp", 0.88);
      };
      image.onerror = () => resolve(null);
      image.src = this.frameDataUrl;
    });
  }

  renderSearching() {
    this.overlay.innerHTML = `
      <div class="visual-search-page visual-search-page--searching">
        ${this.headerMarkup("正在找相似好物", "把喜欢带回家 · 查询中")}
        <div class="visual-search-query-card">
          <div class="visual-search-crop">
            ${this.cropUrl ? `<img src="${this.cropUrl}" alt="搜索区域预览" />` : ""}
            <span class="visual-search-scanline"></span>
          </div>
          <span class="visual-search-query-tag">视频灵感 · 01</span>
        </div>
        <div class="visual-search-thinking">
          <strong>正在读懂你喜欢的内容</strong>
          <p>判断这是具体组件，还是整套风格与氛围</p>
          <div><i></i><i></i><i></i></div>
        </div>
        <ol class="visual-search-progress">
          <li class="done"><span></span>收好你选中的画面</li>
          <li class="active"><span></span>提取组件或风格特征</li>
          <li><span></span>等你确认后带入我家</li>
        </ol>
      </div>
    `;
    this.bindClose();
  }

  showInlineLoading() {
    const sheet = this.overlay?.querySelector("[data-vs-sheet]");
    const loading = this.overlay?.querySelector("[data-vs-loading]");
    const results = this.overlay?.querySelector("[data-vs-results]");
    if (!sheet || !loading) return;
    if (results) results.hidden = true;
    loading.hidden = false;
    sheet.classList.add("expanded");
    const cropImg = loading.querySelector(".visual-search-crop");
    if (cropImg && this.cropUrl) {
      cropImg.innerHTML = `<img src="${this.cropUrl}" alt="搜索区域预览" /><span class="visual-search-scanline"></span>`;
    }
  }

  renderIntentConfirmation() {
    const loading = this.overlay?.querySelector("[data-vs-loading]");
    const results = this.overlay?.querySelector("[data-vs-results]");
    if (!loading || !results || !this.inspirationAsset) return;

    const analysis =
      this.inspirationAsset.attributes?.intent_analysis || {};
    const suggested = analysis.suggested_type;
    const componentSummary =
      this.componentIdentity?.label ||
      (suggested === "component"
        ? analysis.summary
        : analysis.candidates?.find(
            (candidate) => candidate.intent_type === "component"
          )?.summary) ||
      "具体组件：保留圈选物件的外观特征";
    const styleSummary =
      suggested === "style"
        ? analysis.summary
        : analysis.candidates?.find(
            (candidate) => candidate.intent_type === "style"
          )?.summary || "风格 / 氛围：提取配色、材质、光线与布局";

    loading.hidden = true;
    results.hidden = false;
    results.innerHTML = `
      <div class="visual-search-query-strip">
        <div>${this.cropUrl ? `<img src="${this.cropUrl}" alt="" />` : ""}</div>
        <p><small>刚刚圈住的是</small><strong>${escapeHtml(
          analysis.summary || "一份视频家居灵感"
        )}</strong></p>
        <span>${
          this.deliveryMode === "live"
            ? "Agent 实时识别"
            : this.queryId
              ? "Agent 降级 · 待你确认"
              : "识别服务未连接"
        }</span>
      </div>
      <div class="visual-search-result-heading">
        <strong>你想搬走什么？</strong>
        <small>确认后会把同一份灵感带入「搬进我家」</small>
      </div>
      <div class="visual-search-intent-list" role="radiogroup" aria-label="选择灵感类型">
        <button type="button" class="visual-search-intent-card ${
          this.selectedIntentType === "component" ? "selected" : ""
        }" data-intent-type="component" role="radio" aria-checked="${
          this.selectedIntentType === "component"
        }">
          <span class="visual-search-intent-icon">器</span>
          <span><small>单个物件</small><strong>搬这个组件</strong><i>${escapeHtml(
            componentSummary
          )}</i></span>
          <b>${
            this.deliveryMode === "live"
              ? "Agent 识别"
              : this.queryId
                ? "降级占位"
                : suggested === "component"
                  ? "演示建议"
                  : "可选"
          }</b>
        </button>
        <button type="button" class="visual-search-intent-card ${
          this.selectedIntentType === "style" ? "selected" : ""
        }" data-intent-type="style" role="radio" aria-checked="${
          this.selectedIntentType === "style"
        }">
          <span class="visual-search-intent-icon">景</span>
          <span><small>整体感觉</small><strong>搬这种风格 / 氛围</strong><i>${escapeHtml(
            styleSummary
          )}</i></span>
          <b>${suggested === "style" ? "AI 建议" : "可选"}</b>
        </button>
      </div>
      <div class="visual-search-result-footer">
        <button type="button" class="visual-search-primary" data-vs-confirm-intent ${
          this.selectedIntentType ? "" : "disabled"
        }>
          <span>确认，搬进我家</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <p>商品会在效果图确认后的「实施」清单中匹配</p>
      </div>
    `;

    const confirmButton = results.querySelector("[data-vs-confirm-intent]");
    results.querySelectorAll("[data-intent-type]").forEach((card) => {
      card.addEventListener("click", () => {
        this.selectedIntentType = card.dataset.intentType;
        results.querySelectorAll("[data-intent-type]").forEach((item) => {
          const selected =
            item.dataset.intentType === this.selectedIntentType;
          item.classList.toggle("selected", selected);
          item.setAttribute("aria-checked", String(selected));
        });
        confirmButton.disabled = false;
      });
    });
    confirmButton.addEventListener("click", () =>
      this.confirmIntentAndEnter({ componentSummary, styleSummary })
    );
  }

  async confirmIntentAndEnter({ componentSummary, styleSummary }) {
    if (!this.inspirationAsset || !this.selectedIntentType) return;
    const button = this.overlay?.querySelector("[data-vs-confirm-intent]");
    if (button) {
      button.disabled = true;
      button.querySelector("span").textContent = "正在带入…";
    }
    try {
      if (this.selectedIntentType === "component") {
        if (!this.queryId || !this.selectedCandidate) {
          throw new Error(
            "组件识别没有形成可保存的视觉锚点，请重新圈选或检查后端连接"
          );
        }
        const persistence = await confirmVisualSearchCandidate(
          this.queryId,
          this.selectedCandidate.candidate_id
        );
        if (!hasGenerationReadySourceComponent(persistence)) {
          throw new Error("组件裁剪图没有保存成功，请重新圈选");
        }
        const entryContext = buildRenewalEntryContext(
          persistence,
          this.sourceContext,
          {
            ...this.selectedCandidate,
            name: this.componentIdentity?.label || componentSummary
          }
        );
        if (!entryContext.reference_asset_id) {
          throw new Error("组件资产没有保存成功，请重试");
        }
        sessionStorage.setItem(
          "video-entry-context",
          JSON.stringify(entryContext)
        );
        window.location.href = "./renewal.html?source=video";
        return;
      }
      const summary =
        styleSummary;
      const confirmedAsset = await confirmVideoInspirationIntent(
        this.inspirationAsset,
        {
          intentType: this.selectedIntentType,
          summary
        }
      );
      const confirmedIntent =
        confirmedAsset.attributes?.confirmed_intent || {
          intent_type: this.selectedIntentType,
          summary
        };
      const entryContext = buildInspirationEntryContext(
        confirmedAsset,
        this.sourceContext,
        confirmedIntent
      );
      if (!entryContext.reference_asset_id) {
        throw new Error("灵感资产未保存成功，请重试");
      }
      sessionStorage.setItem(
        "video-entry-context",
        JSON.stringify(entryContext)
      );
      window.location.href = "./renewal.html?source=video";
    } catch (error) {
      this.renderEntryError(error?.message || "意图确认失败，请重试");
    }
  }

  renderEntryError(message) {
    const loading = this.overlay?.querySelector("[data-vs-loading]");
    const results = this.overlay?.querySelector("[data-vs-results]");
    if (!results) return;
    if (loading) loading.hidden = true;
    results.hidden = false;
    results.innerHTML = `
      <div class="visual-search-entry-error" role="alert">
        <span>!</span>
        <strong>这次没有认清</strong>
        <p>${escapeHtml(message)}</p>
        <button type="button" class="visual-search-primary" data-vs-retry>
          <span>重新圈选</span>
        </button>
      </div>
    `;
    results
      .querySelector("[data-vs-retry]")
      ?.addEventListener("click", () => this.renderSelection());
  }

  renderResultsInline(notice = "") {
    const modeText =
      this.deliveryMode === "live"
        ? "实时商品候选"
        : this.queryId
          ? "服务端降级候选"
          : "本地 Demo 候选";
    const loading = this.overlay?.querySelector("[data-vs-loading]");
    const results = this.overlay?.querySelector("[data-vs-results]");
    if (!loading || !results) return;

    loading.hidden = true;
    results.hidden = false;

    results.innerHTML = `
      <div class="visual-search-query-strip">
        <div>${this.cropUrl ? `<img src="${this.cropUrl}" alt="" />` : ""}</div>
        <p><small>刚刚圈住的是</small><strong>${escapeHtml(
          this.componentIdentity?.label || "圈选组件"
        )}</strong></p>
        <span>${modeText}</span>
      </div>
      ${notice ? `<p class="visual-search-notice">${notice}</p>` : ""}
      <div class="visual-search-result-heading">
        <strong>为你找到 ${this.results.length} 件相似好物</strong>
        <small>由你确认后，才会放进我家</small>
      </div>
      <div class="visual-search-results-list">
        ${this.results
          .map(
            (candidate, index) => `
              <button type="button" class="visual-search-result-card ${
                candidate.candidate_id === this.selectedCandidate?.candidate_id
                  ? "selected"
                  : ""
              }" data-candidate-id="${candidate.candidate_id}">
                <span class="visual-search-result-rank">0${index + 1}</span>
                ${this.renderProductArt(candidate.visual_kind || "oak")}
                <span class="visual-search-result-copy">
                  <small>${candidate.category || "相似商品"}</small>
                  <strong>${candidate.name}</strong>
                  <i>${(candidate.match_reasons || []).slice(0, 2).join(" · ")}</i>
                  <b>¥${candidate.price_cny}<em>${Math.round(
                    (candidate.similarity_score || 0) * 100
                  )}% 相似</em></b>
                </span>
                <span class="visual-search-radio"></span>
              </button>
            `
          )
          .join("")}
      </div>
      <div class="visual-search-result-footer">
        <button type="button" class="visual-search-primary" data-vs-model>
          <span>就选这件，放进我家</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <p>相似只是参考，最终还是由你来确认</p>
      </div>
    `;

    results.querySelectorAll("[data-candidate-id]").forEach((card) => {
      card.addEventListener("click", () => {
        this.selectedCandidate = this.results.find(
          (candidate) => candidate.candidate_id === card.dataset.candidateId
        );
        results
          .querySelectorAll("[data-candidate-id]")
          .forEach((item) =>
            item.classList.toggle(
              "selected",
              item.dataset.candidateId === card.dataset.candidateId
            )
          );
      });
    });
    results
      .querySelector("[data-vs-model]")
      .addEventListener("click", () => this.modelAndSave());
  }

  renderProductArt(kind) {
    return `
      <div class="visual-product-art visual-product-art--${kind}">
        <span class="visual-product-art__top"></span>
        <span class="visual-product-art__leg visual-product-art__leg--left"></span>
        <span class="visual-product-art__leg visual-product-art__leg--right"></span>
        <span class="visual-product-art__drawer"></span>
      </div>
    `;
  }

  renderResults(notice = "") {
    const modeText =
      this.deliveryMode === "live"
        ? "实时商品候选"
        : this.queryId
          ? "服务端降级候选"
          : "本地 Demo 候选";
    this.overlay.innerHTML = `
      <div class="visual-search-page visual-search-page--results">
        ${this.headerMarkup("为你找到 ${count} 件相似好物".replace("${count}", this.results.length), "慢慢挑一件 · 搜索结果")}
        <div class="visual-search-query-strip">
          <div>${this.cropUrl ? `<img src="${this.cropUrl}" alt="" />` : ""}</div>
          <p><small>刚刚圈住的是</small><strong>${escapeHtml(
            this.componentIdentity?.label || "圈选组件"
          )}</strong></p>
          <span>${modeText}</span>
        </div>
        ${notice ? `<p class="visual-search-notice">${notice}</p>` : ""}
        <div class="visual-search-result-heading">
          <strong>哪一件更像你喜欢的？</strong>
          <small>由你确认后，才会放进我家</small>
        </div>
        <div class="visual-search-results-list">
          ${this.results
            .map(
              (candidate, index) => `
                <button type="button" class="visual-search-result-card ${
                  candidate.candidate_id === this.selectedCandidate?.candidate_id
                    ? "selected"
                    : ""
                }" data-candidate-id="${candidate.candidate_id}">
                  <span class="visual-search-result-rank">0${index + 1}</span>
                  ${this.renderProductArt(candidate.visual_kind || "oak")}
                  <span class="visual-search-result-copy">
                    <small>${candidate.category || "相似商品"}</small>
                    <strong>${candidate.name}</strong>
                    <i>${(candidate.match_reasons || []).slice(0, 2).join(" · ")}</i>
                    <b>¥${candidate.price_cny}<em>${Math.round(
                      (candidate.similarity_score || 0) * 100
                    )}% 相似</em></b>
                  </span>
                  <span class="visual-search-radio"></span>
                </button>
              `
            )
            .join("")}
        </div>
        <div class="visual-search-result-footer">
          <button type="button" class="visual-search-primary" data-vs-model>
            <span>就选这件，放进我家</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <p>相似只是参考，最终还是由你来确认</p>
        </div>
      </div>
    `;
    this.bindClose();
    this.overlay.querySelectorAll("[data-candidate-id]").forEach((card) => {
      card.addEventListener("click", () => {
        this.selectedCandidate = this.results.find(
          (candidate) => candidate.candidate_id === card.dataset.candidateId
        );
        this.overlay
          .querySelectorAll("[data-candidate-id]")
          .forEach((item) =>
            item.classList.toggle(
              "selected",
              item.dataset.candidateId === card.dataset.candidateId
            )
          );
      });
    });
    this.overlay
      .querySelector("[data-vs-model]")
      .addEventListener("click", () => this.modelAndSave());
  }

  async modelAndSave() {
    if (!this.selectedCandidate) return;
    const localAsset = this.persistLocalAsset();
    let persistence = null;
    try {
      if (this.queryId) {
        persistence = await confirmVisualSearchCandidate(
          this.queryId,
          this.selectedCandidate.candidate_id
        );
      } else {
        persistence = await persistDemoCandidate(
          this.selectedCandidate,
          this.sourceContext
        );
      }
    } catch {
      // 本地收藏仍保留，但没有稳定后端资产时不能伪装成可生成组件。
    }
    if (!hasGenerationReadySourceComponent(persistence)) {
      this.renderSaved(persistence || localAsset, Boolean(persistence));
      return;
    }
    const entryContext = buildRenewalEntryContext(
      persistence,
      this.sourceContext,
      this.selectedCandidate
    );
    try {
      sessionStorage.setItem(
        "video-entry-context",
        JSON.stringify(entryContext)
      );
    } catch {
      // 严格隐私模式下仍可回到焕新页手动选择已保存资产。
    }
    window.location.href = "./renewal.html?source=video";
  }

  persistLocalAsset() {
    const asset = serializeLocalAsset(
      this.selectedCandidate,
      this.sourceContext
    );
    try {
      const key = "douyin-visual-assets-v1";
      const current = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([asset, ...current].slice(0, 20)));
    } catch {
      // The completion screen remains usable in strict privacy mode.
    }
    return asset;
  }

  renderModeling() {
    this.overlay.innerHTML = `
      <div class="visual-search-page visual-search-page--modeling">
        ${this.headerMarkup("正在整理成你的收藏", "为以后焕新留住它")}
        <div class="visual-search-model-stage">
          <div class="visual-search-model-orbit">
            ${this.renderProductArt(this.selectedCandidate.visual_kind || "oak")}
            <i></i><i></i><i></i>
          </div>
          <span>收藏预览</span>
        </div>
        <div class="visual-search-model-copy">
          <small>你刚刚选中的好物</small>
          <strong>${this.selectedCandidate.name}</strong>
          <p>正在收好它的轮廓、来源和商品信息</p>
        </div>
        <ol class="visual-search-build-steps">
          <li class="active"><span>01</span><p><b>轻轻抠出物品轮廓</b><small>做一张干净的收藏预览</small></p></li>
          <li class="active delay"><span>02</span><p><b>收好商品与来源</b><small>以后还能回到这段灵感</small></p></li>
          <li class="active delay-more"><span>03</span><p><b>放进我的收藏</b><small>下次焕新可以直接使用</small></p></li>
        </ol>
        <p class="visual-search-model-note">当前先生成 2D 收藏预览；后续可继续补充真实 3D 模型</p>
      </div>
    `;
    this.bindClose();
  }

  renderSaved(persistence, persistedBackend) {
    const assetId =
      persistence?.asset?.asset_id ||
      persistence?.item_asset?.asset_id ||
      persistence?.asset_id ||
      persistence?.local_asset_id ||
      "asset-ready";
    this.overlay.innerHTML = `
      <div class="visual-search-page visual-search-page--saved">
        ${this.headerMarkup("这件好物已经收好了", "我的收藏 · 完成")}
        <div class="visual-search-success-mark">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="m13 25 7 7 15-17"/></svg>
        </div>
        <div class="visual-search-saved-card">
          <span class="visual-search-saved-card__badge">我的好物 · 01</span>
          ${this.renderProductArt(this.selectedCandidate.visual_kind || "oak")}
          <div>
            <small>单品收藏 · 2D 预览已准备好</small>
            <strong>${this.selectedCandidate.name}</strong>
            <p>${persistedBackend ? "资产记录已保存到后端" : "后端不可用，暂存在当前浏览器"}</p>
            <code>${assetId}</code>
          </div>
        </div>
        <div class="visual-search-asset-facts">
          <span><small>来源</small><b>视频框选</b></span>
          <span><small>商品</small><b>用户已确认</b></span>
          <span><small>模型</small><b>2D Ready</b></span>
        </div>
        <div class="visual-search-saved-actions">
          ${
            persistedBackend
              ? `<a class="visual-search-primary" href="./renewal.html?source=home&drawer=asset"><span>查看我的资产库</span><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></a>`
              : `<button type="button" class="visual-search-primary" data-vs-done><span>完成</span><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>`
          }
          <button type="button" class="visual-search-secondary" data-vs-again>继续框选</button>
        </div>
        <p class="visual-search-success-note">${
          this.deliveryMode === "live"
            ? "候选来自实时视觉搜索服务"
            : this.queryId
              ? "组件识别已降级，候选来自服务端 Demo 目录，未声称准确同款"
              : "商品候选来自本地 Demo，未声称准确同款"
        }</p>
      </div>
    `;
    this.bindClose();
    this.overlay
      .querySelector("[data-vs-done]")
      ?.addEventListener("click", () => this.close());
    this.overlay
      .querySelector("[data-vs-again]")
      .addEventListener("click", () => this.renderSelection());
  }
}

new VisualSearchExperience();
