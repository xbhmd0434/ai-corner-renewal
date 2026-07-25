(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const data = window.REMIX_DATA;
  const apiHost =
    window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
  const API_BASE_URL =
    new URLSearchParams(window.location.search).get("api") ||
    `http://${apiHost}:8787`;
  const GOAL_CODES = {
    桌面收纳: "organization",
    氛围照明: "ambient_lighting",
    视频出片: "content_ready",
    久坐效率: "productivity",
    增加绿意: "greenery"
  };
  const CONSTRAINT_LABELS = {
    no_drilling: "不打孔",
    keep_desk: "保留书桌",
    keep_chair: "保留椅子",
    pet_safe: "宠物安全"
  };
  const CHECK_LABELS = {
    price_total: "价格合计",
    budget: "预算校验",
    no_drilling: "安装方式",
    preserved_elements: "保留家具",
    editable_zones: "可编辑区域",
    structure: "结构保持",
    dimensions: "尺寸风险",
    availability: "商品可得",
    pet_safety: "宠物安全"
  };
  const PRODUCT_ICONS = {
    desk_riser: "架",
    lighting: "灯",
    display_board: "板",
    storage: "收",
    cable_management: "线",
    plant: "植",
    file_storage: "文"
  };
  const ROOM_LABELS = {
    wall: "墙面",
    window: "窗户",
    desk: "书桌",
    chair: "椅子",
    bed: "床",
    door: "门",
    socket: "插座",
    radiator: "暖气",
    built_in_cabinet: "固定柜",
    desktop: "桌面",
    desktop_back: "桌面后缘",
    underdesk_right: "桌下右侧",
    wall_leaning_zone: "可倚墙区域"
  };
  const state = {
    step: 1,
    style: "warm",
    plan: "warm",
    planIndex: 0,
    budget: 500,
    saved: false,
    busy: false,
    card: null,
    planItems: [],
    roomDataUrl: "",
    roomMediaType: "",
    roomId: createId("room"),
    backendHealth: null
  };

  function createId(prefix) {
    const suffix =
      window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(
      () => toast.classList.remove("is-visible"),
      2800
    );
  }

  function setRuntimeBadge(kind, label) {
    const badge = $("#runtimeBadge");
    badge.className = `demo-badge runtime-${kind}`;
    badge.innerHTML = `<i></i>${escapeHtml(label)}`;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        payload?.error?.message || `后端返回 HTTP ${response.status}`
      );
      error.code = payload?.error?.code || "http_error";
      error.issues = payload?.error?.issues;
      throw error;
    }
    return payload;
  }

  function resolveAssetReference(reference) {
    if (!reference) return "";
    if (reference.startsWith("/api/")) {
      return new URL(reference, `${API_BASE_URL}/`).href;
    }
    return reference;
  }

  async function checkBackend() {
    try {
      const health = await apiRequest("/api/health");
      state.backendHealth = health;
      if (
        health.room_analyzer_provider === "agent_plan" &&
        health.room_analyzer_configured
      ) {
        setRuntimeBadge("ready", "Agent Plan 已就绪 · 可真实识别");
      } else {
        setRuntimeBadge("demo", "后端在线 · 当前为 Demo 空间识别");
      }
    } catch {
      state.backendHealth = null;
      setRuntimeBadge("offline", "后端未启动 · 可浏览样例");
    }
  }

  function setStep(step, withAnalysis = false) {
    state.step = Number(step);
    $$(".step-tab").forEach((button) =>
      button.classList.toggle(
        "is-active",
        Number(button.dataset.step) === state.step
      )
    );
    $$(".stage-panel").forEach((panel) =>
      panel.classList.toggle(
        "is-active",
        Number(panel.dataset.panel) === state.step
      )
    );
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    if (state.step === 4) {
      if (withAnalysis) {
        runAnalysis();
      } else {
        showDemoResults();
      }
    }
  }

  function updateExtraction(style) {
    const labels = ["识别风格", "主色", "可迁移元素", "不照搬"];
    $("#inspirationExtract").innerHTML = data.styles[style].extract
      .map(
        (value, index) =>
          `<div><small>${labels[index]}</small><strong>${escapeHtml(value)}</strong></div>`
      )
      .join("");
  }

  function setBusy(busy, message = "正在把灵感适配到你的空间…") {
    state.busy = busy;
    $("#generateButton").disabled = busy;
    $("#replayButton").disabled = busy;
    $("#analysisTitle").textContent = message;
    $("#analysisProgress").classList.toggle("is-hidden", !busy);
    $("#results").classList.toggle("is-visible", !busy && Boolean(state.card));
    $("#analysisError").hidden = true;
  }

  function showAnalysisError(error) {
    state.busy = false;
    $("#generateButton").disabled = false;
    $("#replayButton").disabled = false;
    $("#analysisProgress").classList.add("is-hidden");
    $("#results").classList.remove("is-visible");
    $("#analysisError").hidden = false;
    $("#analysisErrorMessage").textContent =
      error.code === "backend_offline" ||
      /failed to fetch/i.test(error.message || "")
        ? "无法连接本地后端，请先运行 npm.cmd run start:all。"
        : error.message || "生成失败，请稍后重试。";
    setRuntimeBadge("offline", "本次调用失败 · 查看提示");
  }

  function progressTicker() {
    const steps = $$(".progress-steps span");
    steps.forEach((step, index) =>
      step.classList.toggle("is-done", index === 0)
    );
    let active = 1;
    const timer = setInterval(() => {
      if (active < steps.length) {
        steps[active].classList.add("is-done");
        active += 1;
      } else {
        clearInterval(timer);
      }
    }, 1300);
    return () => {
      clearInterval(timer);
      steps.forEach((step) => step.classList.add("is-done"));
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("无法读取图片"));
      reader.readAsDataURL(blob);
    });
  }

  async function loadImage(blob) {
    if ("createImageBitmap" in window) return createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function prepareImage(blob) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
      throw new Error("请选择 JPEG、PNG 或 WebP 图片");
    }
    if (blob.size > 16 * 1024 * 1024) {
      throw new Error("图片不能超过 16 MB");
    }
    const image = await loadImage(blob);
    const width = image.width;
    const height = image.height;
    const ratio = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#f2ecdf";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    const compressed = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("图片压缩失败"))),
        "image/jpeg",
        0.84
      )
    );
    return {
      dataUrl: await blobToDataUrl(compressed),
      mediaType: "image/jpeg"
    };
  }

  async function ensureRoomImage() {
    if (state.roomDataUrl) {
      return {
        dataUrl: state.roomDataUrl,
        mediaType: state.roomMediaType
      };
    }
    const response = await fetch("./assets/desk-before.png");
    if (!response.ok) throw new Error("无法读取默认演示书桌图");
    const prepared = await prepareImage(await response.blob());
    state.roomDataUrl = prepared.dataUrl;
    state.roomMediaType = prepared.mediaType;
    return prepared;
  }

  function selectedGoals() {
    const goals = $$("#goalChips .chip.is-selected").map(
      (chip) => GOAL_CODES[chip.textContent.trim()]
    );
    return goals.length ? goals : ["organization"];
  }

  function buildGenerateRequest(image) {
    const hardConstraints = [];
    if ($("#noDrill").checked) hardConstraints.push("no_drilling");
    if ($("#keepDesk").checked) {
      hardConstraints.push("keep_desk", "keep_chair");
    }
    if ($("#petFriendly").checked) hardConstraints.push("pet_safe");
    const note = $("#userPrompt").value.trim().slice(0, 256);
    return {
      schema_version: "1.0",
      room_input: {
        room_id: state.roomId,
        image: {
          data_url: image.dataUrl,
          media_type: image.mediaType
        },
        reference_width_cm: Number($("#deskWidth").value),
        quality_hint: "clear"
      },
      inspiration_input: {
        inspiration_id: `demo-inspiration-${state.style}`,
        source_type: "demo",
        style_key: state.style
      },
      constraints: {
        budget_cny: state.budget,
        hard_constraints: hardConstraints,
        soft_preferences: note ? [note] : [],
        goals: selectedGoals()
      },
      options: {
        analysis_mode: "live",
        include_trace: true
      }
    };
  }

  async function runAnalysis() {
    if (state.busy) return;
    state.card = null;
    state.planItems = [];
    setBusy(true);
    const finishProgress = progressTicker();
    const startedAt = performance.now();
    try {
      await checkBackend();
      if (!state.backendHealth) {
        const error = new Error(
          "无法连接本地后端，请先运行 npm.cmd run start:all。"
        );
        error.code = "backend_offline";
        throw error;
      }
      const image = await ensureRoomImage();
      const card = await apiRequest("/api/generate", {
        method: "POST",
        body: JSON.stringify(buildGenerateRequest(image))
      });
      finishProgress();
      state.card = card;
      renderCard(card, Math.round(performance.now() - startedAt));
      $("#analysisProgress").classList.add("is-hidden");
      $("#results").classList.add("is-visible");
      state.busy = false;
      $("#generateButton").disabled = false;
      $("#replayButton").disabled = false;
      showToast(
        card.source_mode === "live"
          ? "真实空间识别完成"
          : "真实识别不可用，已明确降级为演示档案"
      );
    } catch (error) {
      finishProgress();
      showAnalysisError(error);
    }
  }

  function itemFromCard(card) {
    return {
      plan: card.plan,
      products: card.products,
      validation: card.validation,
      render: card.render
    };
  }

  function renderSourceProof(card, latencyMs) {
    const mode = card.source_mode;
    const proof = $("#sourceProof");
    proof.className = `source-proof source-${mode}`;
    $("#sourceModeLabel").textContent =
      mode === "live" ? "LIVE" : mode === "fallback" ? "FALLBACK" : "DEMO";
    $("#sourceModeTitle").textContent =
      mode === "live"
        ? "这次空间理解来自 Agent Plan"
        : mode === "fallback"
          ? "这次已降级为本地空间样例"
          : "这是离线样例结果";
    const model =
      state.backendHealth?.room_analyzer_model || "doubao-seed-2.0-lite";
    $("#sourceModeDetail").textContent =
      mode === "live"
        ? `${model} · ${latencyMs ? `${(latencyMs / 1000).toFixed(1)} 秒 · ` : ""}空间结构识别已完成`
        : "请查看 AI 过程中的空间识别降级原因";
  }

  function renderGenerationProof(render, notices = [], planIndex = 0) {
    const hasFailure =
      planIndex === 0 &&
      notices.some(
        (notice) =>
          notice.code?.startsWith("render_") &&
          notice.level === "warning"
      );
    const mode = render?.is_demo_asset
      ? hasFailure
        ? "fallback"
        : "demo"
      : "live";
    const proof = $("#renderProof");
    proof.className = `source-proof source-${mode}`;
    $("#renderModeLabel").textContent =
      mode === "live" ? "LIVE" : mode === "fallback" ? "FALLBACK" : "DEMO";
    $("#renderModeTitle").textContent =
      mode === "live"
        ? "效果图：Seedream 实时生成"
        : mode === "fallback"
          ? "效果图：实时生成失败，已回退"
          : "效果图：预生成样例";
    const model =
      state.backendHealth?.render_generator_model ||
      "doubao-seedream-5.0-lite";
    $("#renderModeDetail").textContent =
      mode === "live"
        ? `${model} · 基于本次上传的房间原图`
        : mode === "fallback"
          ? "结构化方案仍可用；当前图片不是本次实时生成"
          : planIndex > 0
            ? "当前只为主方案实时生图，其他候选仍使用 Demo"
            : "真实生成后这里会明确显示 Seedream LIVE";
  }

  function roomDiagnosis(profile) {
    const labels = (values) =>
      values.map((value) => ROOM_LABELS[value] || value);
    const fixed = labels(profile.fixed_elements || []).slice(0, 3).join("、");
    const zones = labels(profile.editable_zones || []).slice(0, 3).join("、");
    const uncertainty = (
      profile.needs_confirmation?.length
        ? profile.needs_confirmation
        : profile.uncertainties || []
    )
      .slice(0, 2)
      .join("、");
    return `识别为空间“${profile.room_type}”。固定结构包括${fixed || "待确认"}；可编辑区域包括${zones || "待确认"}。光线主要来自${profile.lighting?.direction || "待确认"}。${uncertainty ? `仍需确认：${uncertainty}。` : ""}`;
  }

  function renderRoomProfile(card) {
    const profile = card.room_profile;
    $("#diagnosisText").textContent = roomDiagnosis(profile);
    $("#diagnosisBasis").textContent =
      card.source_mode === "live"
        ? "依据：Agent Plan 真实空间识别 + Demo 灵感 + 用户硬约束"
        : "依据：本地空间档案 + Demo 灵感 + 用户硬约束";
    $("#roomDiagnosisMode").textContent =
      card.source_mode === "live" ? "Agent Plan 实时识别" : "降级识别结果";
    $("#roomScore").textContent = Math.round(
      Math.max(0, Math.min(1, profile.lighting?.confidence ?? 0.72)) * 100
    );
    const rows = [
      [
        "01",
        "固定结构",
        (profile.fixed_elements || [])
          .slice(0, 4)
          .map((value) => ROOM_LABELS[value] || value)
          .join("、")
      ],
      [
        "02",
        "可编辑区域",
        (profile.editable_zones || [])
          .slice(0, 4)
          .map((value) => ROOM_LABELS[value] || value)
          .join("、")
      ],
      [
        "03",
        "仍需确认",
        (profile.needs_confirmation || profile.uncertainties || [])
          .slice(0, 3)
          .join("、")
      ]
    ];
    $("#roomDiagnosisList").innerHTML = rows
      .map(
        ([number, title, description]) => `
          <li><i>${number}</i><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description || "无")}</small></div></li>
        `
      )
      .join("");
    const labels = [
      ROOM_LABELS[profile.fixed_elements?.[0]] || "固定结构",
      ROOM_LABELS[profile.editable_zones?.[0]] || "可编辑区域",
      card.source_mode === "live" ? "Agent Plan · LIVE" : "本地降级"
    ];
    $$(".detected-tag").forEach((tag, index) => {
      tag.textContent = labels[index];
    });
  }

  function renderTrace(trace) {
    const items = trace?.length
      ? trace.map((item) =>
          Array.isArray(item)
            ? { skill: item[0], summary: item[1], status: "completed" }
            : item
        )
      : data.trace.map((item) => ({
          skill: item[0],
          summary: item[1],
          status: "completed"
        }));
    $("#traceList").innerHTML = items
      .map(
        (traceItem, index) => `
          <div class="trace-item">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <div><strong>${escapeHtml(traceItem.skill)}</strong><p>${escapeHtml(traceItem.summary)}</p></div>
            <i>${traceItem.status === "completed" ? "完成" : escapeHtml(traceItem.status)}</i>
          </div>
        `
      )
      .join("");
  }

  function renderCard(card, latencyMs) {
    if (!card.plan) {
      throw new Error(card.follow_up?.question || "当前信息不足，无法生成方案");
    }
    state.planItems = [
      itemFromCard(card),
      ...(card.alternatives || []).map((item) => ({
        plan: item.plan,
        products: item.products,
        validation: item.validation,
        render: item.render
      }))
    ];
    $("#planSwitcher").innerHTML = state.planItems
      .map(
        (item, index) => `
          <button data-plan-index="${index}" class="${index === 0 ? "is-active" : ""}">
            <span>方案 ${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(item.plan.title)}</strong>
            <small>¥${item.plan.total_price_cny} · ${item.products.length} 件</small>
          </button>
        `
      )
      .join("");
    renderSourceProof(card, latencyMs);
    renderRoomProfile(card);
    renderTrace(card.trace);
    $("#dialogLead").textContent =
      card.render?.is_demo_asset === false
        ? "空间理解与主方案效果图均已调用 Agent Plan；商品和教程仍使用明确标注的比赛样例。"
        : card.source_mode === "live"
          ? "空间理解来自 Agent Plan；商品和教程仍为比赛样例，效果图状态见上方独立标记。"
          : "真实空间识别未成功，本次使用同协议的本地档案继续生成，原因保留在过程记录中。";
    renderCardPlan(0);
    setRuntimeBadge(
      card.source_mode === "live" ? "live" : "fallback",
      card.source_mode === "live"
        ? "本次验证成功 · Agent Plan LIVE"
        : "本次已降级 · 查看 AI 过程"
    );
  }

  function renderCardPlan(index) {
    const item = state.planItems[index];
    if (!item) return;
    state.planIndex = index;
    const { plan, products, validation, render } = item;
    renderGenerationProof(render, state.card?.notices || [], index);
    $$("#planSwitcher button").forEach((button) =>
      button.classList.toggle(
        "is-active",
        Number(button.dataset.planIndex) === index
      )
    );
    $("#planNumber").textContent = String(index + 1).padStart(2, "0");
    $("#planTitle").textContent = plan.title;
    $("#planDescription").textContent = plan.summary;
    $("#planPrice").textContent = plan.total_price_cny;
    $("#planTime").textContent = `约 ${10 + plan.steps.length * 7} 分钟`;
    $("#planDifficulty").textContent =
      validation.overall_status === "failed"
        ? "需调整"
        : validation.overall_status === "needs_confirmation"
          ? "购买前复测"
          : "简单";
    $("#shoppingTotal").textContent =
      `共 ${products.length} 件 · ¥${plan.total_price_cny}`;
    $("#productList").innerHTML = products
      .map(
        (product) => `
          <div class="product-row">
            <span class="product-icon">${escapeHtml(PRODUCT_ICONS[product.category] || product.name.slice(0, 1))}</span>
            <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.dimensions_label || product.reason)}</small></div>
            <b>¥${product.price_cny}</b>
          </div>
        `
      )
      .join("");
    $("#stepList").innerHTML = plan.steps
      .map(
        (step) =>
          `<li><div><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.instruction)}</p></div></li>`
      )
      .join("");
    $("#reasonTags").innerHTML = plan.constraint_tags
      .map(
        (tag) =>
          `<span>✓ ${escapeHtml(CONSTRAINT_LABELS[tag] || tag)}</span>`
      )
      .join("");
    const preferredChecks = [
      "budget",
      "no_drilling",
      "preserved_elements",
      "dimensions"
    ];
    const checks = [
      ...preferredChecks
        .map((code) => validation.checks.find((check) => check.code === code))
        .filter(Boolean),
      ...validation.checks.filter(
        (check) => !preferredChecks.includes(check.code)
      )
    ].slice(0, 4);
    $("#validationList").innerHTML = checks
      .map((check) => {
        const className =
          check.status === "pass" ? "status-ok" : "status-warn";
        const label =
          check.status === "pass"
            ? "通过"
            : check.status === "fail"
              ? "未通过"
              : "复测";
        return `
          <li><span class="${className}">${label}</span><div><strong>${escapeHtml(CHECK_LABELS[check.code] || check.code)}</strong><small${check.code === "budget" ? ' id="budgetValidation"' : ""}>${escapeHtml(check.message)}</small></div></li>
        `;
      })
      .join("");
    $("#budgetValidation").textContent =
      `¥${plan.total_price_cny} ${plan.total_price_cny <= state.budget ? "≤" : ">"} 预算 ¥${state.budget}`;
    $(".compare-after").src = resolveAssetReference(
      render?.after_ref || "./assets/desk-after-warm.png"
    );
    $(".compare-after").style.filter =
      index === 1
        ? "saturate(.72) contrast(1.04)"
        : index === 2
          ? "hue-rotate(12deg) saturate(1.12)"
          : "none";
    $("#resultDisclaimer").textContent =
      render?.disclaimer ||
      "效果图、商品价格与库存为比赛样例数据；空间理解来源以顶部状态为准。";
    const lowerButton = $("#lowerBudgetButton");
    lowerButton.disabled = plan.total_price_cny <= 300;
    lowerButton.textContent =
      plan.total_price_cny <= 300
        ? "当前方案已在 ¥300 内"
        : "把预算压到 ¥300 内";
  }

  function showDemoResults() {
    state.card = null;
    state.planItems = [];
    $("#analysisError").hidden = true;
    $("#analysisProgress").classList.add("is-hidden");
    $("#results").classList.add("is-visible");
    $("#sourceProof").className = "source-proof source-demo";
    $("#sourceModeLabel").textContent = "DEMO";
    $("#sourceModeTitle").textContent = "这是可离线浏览的样例结果";
    $("#sourceModeDetail").textContent =
      "点击“重新生成”或完整走到第 3 步，才会请求 Agent Plan";
    $("#renderProof").className = "source-proof source-demo";
    $("#renderModeLabel").textContent = "DEMO";
    $("#renderModeTitle").textContent = "效果图：预生成样例";
    $("#renderModeDetail").textContent =
      "真实生成后这里会明确显示 Seedream LIVE";
    $("#diagnosisBasis").textContent =
      "依据：本地空间档案 + Demo 灵感 + 用户硬约束";
    $("#dialogLead").textContent =
      "当前展示离线样例；实际生成后会用来源标记区分 LIVE、FALLBACK 与 DEMO。";
    renderTrace(data.trace);
    renderDemoPlan(state.plan);
  }

  function renderDemoPlan(planKey) {
    state.plan = planKey;
    const plan = data.plans[planKey];
    const entries = Object.entries(data.plans);
    $("#planSwitcher").innerHTML = entries
      .map(
        ([key, item]) => `
          <button data-plan="${key}" class="${key === planKey ? "is-active" : ""}">
            <span>方案 ${item.number}</span><strong>${escapeHtml(item.title)}</strong>
            <small>¥${item.price} · ${item.products.length} 件</small>
          </button>
        `
      )
      .join("");
    $("#planNumber").textContent = plan.number;
    $("#planTitle").textContent = plan.title;
    $("#planDescription").textContent = plan.description;
    $("#planPrice").textContent = plan.price;
    $("#planTime").textContent = plan.time;
    $("#planDifficulty").textContent = plan.difficulty;
    $("#shoppingTotal").textContent =
      `共 ${plan.products.length} 件 · ¥${plan.price}`;
    $("#budgetValidation").textContent =
      `¥${plan.price} ${plan.price <= state.budget ? "≤" : ">"} 预算 ¥${state.budget}`;
    $("#productList").innerHTML = plan.products
      .map(
        (product) => `
          <div class="product-row">
            <span class="product-icon">${product[3]}</span>
            <div><strong>${escapeHtml(product[0])}</strong><small>${escapeHtml(product[1])}</small></div>
            <b>¥${product[2]}</b>
          </div>
        `
      )
      .join("");
    $("#stepList").innerHTML = plan.steps
      .map(
        (step) =>
          `<li><div><strong>${escapeHtml(step[0])}</strong><p>${escapeHtml(step[1])}</p></div></li>`
      )
      .join("");
    $("#reasonTags").innerHTML =
      "<span>✓ 不打孔</span><span>✓ 保留书桌</span><span>✓ 保留椅子</span>";
    $("#validationList").innerHTML = `
      <li><span class="status-ok">通过</span><div><strong>结构保持</strong><small>墙体、窗户、桌椅未改变</small></div></li>
      <li><span class="${plan.price <= state.budget ? "status-ok" : "status-warn"}">${plan.price <= state.budget ? "通过" : "调整"}</span><div><strong>预算校验</strong><small id="budgetValidation">¥${plan.price} ${plan.price <= state.budget ? "≤" : ">"} 预算 ¥${state.budget}</small></div></li>
      <li><span class="status-ok">通过</span><div><strong>商品可得</strong><small>${plan.products.length}/${plan.products.length} 件样例商品有库存</small></div></li>
      <li><span class="status-warn">复测</span><div><strong>尺寸风险</strong><small>购买前请确认桌深 ≥ 55cm</small></div></li>
    `;
    $(".compare-after").src = "./assets/desk-after-warm.png";
    $(".compare-after").style.filter =
      planKey === "compact"
        ? "saturate(.72) contrast(1.04)"
        : planKey === "green"
          ? "hue-rotate(12deg) saturate(1.12)"
          : "none";
    $("#resultDisclaimer").textContent =
      "当前是离线样例。效果图、商品价格与库存为比赛样例数据。";
    const lowerButton = $("#lowerBudgetButton");
    lowerButton.disabled = plan.price <= 300;
    lowerButton.textContent =
      plan.price <= 300 ? "当前方案已在 ¥300 内" : "把预算压到 ¥300 内";
  }

  async function lowerBudget() {
    if (state.busy) return;
    if (!state.card) {
      state.budget = 300;
      $("#budgetRange").value = 300;
      $("#budgetValue").textContent = 300;
      renderDemoPlan("compact");
      showToast("样例已切换为轻预算组合");
      return;
    }
    const item = state.planItems[state.planIndex];
    if (!item || item.plan.total_price_cny <= 300) return;
    setBusy(true, "正在重新组合 ¥300 内的方案…");
    const finishProgress = progressTicker();
    try {
      const revised = await apiRequest("/api/revise", {
        method: "POST",
        body: JSON.stringify({
          schema_version: "1.0",
          request_id: state.card.request_id,
          plan_id: item.plan.plan_id,
          target_budget_cny: 300
        })
      });
      state.budget = 300;
      $("#budgetRange").value = 300;
      $("#budgetValue").textContent = 300;
      state.card = revised;
      finishProgress();
      renderCard(revised);
      $("#analysisProgress").classList.add("is-hidden");
      $("#results").classList.add("is-visible");
      state.busy = false;
      $("#generateButton").disabled = false;
      $("#replayButton").disabled = false;
      showToast("已生成新的 ¥300 内方案版本");
    } catch (error) {
      finishProgress();
      showAnalysisError(error);
    }
  }

  $$(".inspiration-card").forEach((card) =>
    card.addEventListener("click", () => {
      state.style = card.dataset.style;
      state.plan = state.style;
      $$(".inspiration-card").forEach((item) =>
        item.classList.toggle("is-selected", item === card)
      );
      $$(".selection-ring").forEach(
        (ring) => (ring.textContent = "圈这里")
      );
      $(".selection-ring", card).textContent = "已圈选";
      updateExtraction(state.style);
    })
  );

  $$(".step-tab").forEach((button) =>
    button.addEventListener("click", () => setStep(button.dataset.step))
  );
  $$("[data-next]").forEach((button) =>
    button.addEventListener("click", () => setStep(button.dataset.next))
  );
  $$("[data-back]").forEach((button) =>
    button.addEventListener("click", () => setStep(button.dataset.back))
  );
  $$("[data-jump]").forEach((button) =>
    button.addEventListener("click", () => setStep(button.dataset.jump))
  );
  $("#generateButton").addEventListener("click", () => setStep(4, true));
  $("#replayButton").addEventListener("click", runAnalysis);
  $("#retryButton").addEventListener("click", runAnalysis);

  $("#budgetRange").addEventListener("input", (event) => {
    state.budget = Number(event.target.value);
    $("#budgetValue").textContent = state.budget;
  });
  $$(".chip").forEach((chip) =>
    chip.addEventListener("click", () => chip.classList.toggle("is-selected"))
  );

  $("#roomUpload").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const prepared = await prepareImage(file);
      state.roomDataUrl = prepared.dataUrl;
      state.roomMediaType = prepared.mediaType;
      state.roomId = createId("room");
      $("#roomPreview").src = prepared.dataUrl;
      $(".compare-before img").src = prepared.dataUrl;
      $("#roomDiagnosisMode").textContent = "等待生成后实时识别";
      showToast("照片已压缩；生成时会发送到本地后端与火山方舟");
    } catch (error) {
      event.target.value = "";
      showToast(error.message);
    }
  });

  $("#planSwitcher").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.planIndex !== undefined) {
      renderCardPlan(Number(button.dataset.planIndex));
    } else if (button.dataset.plan) {
      renderDemoPlan(button.dataset.plan);
    }
  });

  function updateCompare(value) {
    $("#beforeLayer").style.width = `${value}%`;
    $("#compareHandle").style.left = `${value}%`;
  }
  $("#compareRange").addEventListener("input", (event) =>
    updateCompare(event.target.value)
  );
  updateCompare(42);

  $("#lowerBudgetButton").addEventListener("click", lowerBudget);

  $("#saveButton").addEventListener("click", () => {
    state.saved = !state.saved;
    localStorage.setItem(
      "room-remix-saved-plan",
      state.saved
        ? JSON.stringify({
            title:
              state.planItems[state.planIndex]?.plan.title ||
              data.plans[state.plan].title,
            saved_at: new Date().toISOString()
          })
        : ""
    );
    $("#saveButton").textContent = state.saved ? "♥ 已保存" : "♡ 保存方案";
    showToast(state.saved ? "方案摘要已保存在本机" : "已取消保存");
  });

  const dialog = $("#logDialog");
  $("#openLogButton").addEventListener("click", () => dialog.showModal());
  $("#closeLogButton").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  if (localStorage.getItem("room-remix-saved-plan")) {
    state.saved = true;
    $("#saveButton").textContent = "♥ 已保存";
  }
  renderTrace(data.trace);
  checkBackend();
})();
