(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const data = window.REMIX_DATA;
  const state = { step: 1, style: "warm", plan: "warm", budget: 500, saved: false };

  const showToast = (message) => {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  };

  const setStep = (step, withLoading = false) => {
    state.step = Number(step);
    $$(".step-tab").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.step) === state.step));
    $$(".stage-panel").forEach((panel) => panel.classList.toggle("is-active", Number(panel.dataset.panel) === state.step));
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    if (state.step === 4) {
      if (withLoading) runAnalysis();
      else {
        $("#analysisProgress").classList.add("is-hidden");
        $("#results").classList.add("is-visible");
        renderPlan(state.plan);
      }
    }
  };

  const updateExtraction = (style) => {
    const labels = ["识别风格", "主色", "可迁移元素", "不照搬"];
    $("#inspirationExtract").innerHTML = data.styles[style].extract.map((value, index) =>
      `<div><small>${labels[index]}</small><strong>${value}</strong></div>`
    ).join("");
  };

  const runAnalysis = () => {
    const progress = $("#analysisProgress");
    const results = $("#results");
    const steps = $$(".progress-steps span");
    progress.classList.remove("is-hidden");
    results.classList.remove("is-visible");
    steps.forEach((step, index) => step.classList.toggle("is-done", index === 0));
    let active = 1;
    const timer = setInterval(() => {
      if (active < steps.length) {
        steps[active].classList.add("is-done");
        active += 1;
      } else {
        clearInterval(timer);
        setTimeout(() => {
          progress.classList.add("is-hidden");
          results.classList.add("is-visible");
          renderPlan(state.plan);
        }, 260);
      }
    }, 420);
  };

  const renderPlan = (planKey) => {
    state.plan = planKey;
    const plan = data.plans[planKey];
    $$("#planSwitcher button").forEach((button) => button.classList.toggle("is-active", button.dataset.plan === planKey));
    $("#planNumber").textContent = plan.number;
    $("#planTitle").textContent = plan.title;
    $("#planDescription").textContent = plan.description;
    $("#planPrice").textContent = plan.price;
    $("#planTime").textContent = plan.time;
    $("#planDifficulty").textContent = plan.difficulty;
    $("#shoppingTotal").textContent = `共 ${plan.products.length} 件 · ¥${plan.price}`;
    $("#budgetValidation").textContent = `¥${plan.price} ${plan.price <= state.budget ? "≤" : ">"} 预算 ¥${state.budget}`;
    $("#productList").innerHTML = plan.products.map((product) => `
      <div class="product-row">
        <span class="product-icon">${product[3]}</span>
        <div><strong>${product[0]}</strong><small>${product[1]}</small></div>
        <b>¥${product[2]}</b>
      </div>
    `).join("");
    $("#stepList").innerHTML = plan.steps.map((step) => `<li><div><strong>${step[0]}</strong><p>${step[1]}</p></div></li>`).join("");

    const priceStatus = $("#validationList li:nth-child(2) > span");
    priceStatus.textContent = plan.price <= state.budget ? "通过" : "调整";
    priceStatus.className = plan.price <= state.budget ? "status-ok" : "status-warn";
    const after = $(".compare-after");
    after.src = planKey === "warm" ? "./assets/desk-after-warm.png" : "./assets/desk-after-warm.png";
    after.style.filter = planKey === "compact" ? "saturate(.72) contrast(1.04)" : planKey === "green" ? "hue-rotate(12deg) saturate(1.12)" : "none";
  };

  $$(".inspiration-card").forEach((card) => card.addEventListener("click", () => {
    state.style = card.dataset.style;
    state.plan = state.style;
    $$(".inspiration-card").forEach((item) => item.classList.toggle("is-selected", item === card));
    $$(".selection-ring").forEach((ring) => ring.textContent = "圈这里");
    $(".selection-ring", card).textContent = "已圈选";
    updateExtraction(state.style);
  }));

  $$(".step-tab").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.step)));
  $$("[data-next]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.next)));
  $$("[data-back]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.back)));
  $$("[data-jump]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.jump)));
  $("#generateButton").addEventListener("click", () => setStep(4, true));
  $("#replayButton").addEventListener("click", runAnalysis);

  $("#budgetRange").addEventListener("input", (event) => {
    state.budget = Number(event.target.value);
    $("#budgetValue").textContent = state.budget;
  });
  $$(".chip").forEach((chip) => chip.addEventListener("click", () => chip.classList.toggle("is-selected")));

  $("#roomUpload").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $("#roomPreview").src = reader.result;
      showToast("照片只在当前浏览器中预览");
    };
    reader.readAsDataURL(file);
  });

  $("#planSwitcher").addEventListener("click", (event) => {
    const button = event.target.closest("[data-plan]");
    if (button) renderPlan(button.dataset.plan);
  });

  const updateCompare = (value) => {
    $("#beforeLayer").style.width = `${value}%`;
    $("#compareHandle").style.left = `${value}%`;
  };
  $("#compareRange").addEventListener("input", (event) => updateCompare(event.target.value));
  updateCompare(42);

  $("#lowerBudgetButton").addEventListener("click", () => {
    state.budget = 300;
    $("#budgetRange").value = 300;
    $("#budgetValue").textContent = 300;
    renderPlan("compact");
    $("#planDescription").textContent = "已为你压缩至 300 元目标附近：暂缓购买屏幕架，优先完成理线、文件分区和桌下隐藏收纳。当前样例合计 ¥240。";
    $("#planPrice").textContent = "240";
    $("#shoppingTotal").textContent = "共 4 件 · ¥240";
    $(".product-row:nth-child(3)")?.remove();
    $("#budgetValidation").textContent = "¥240 ≤ 预算 ¥300";
    showToast("已替换为轻预算组合");
  });

  $("#saveButton").addEventListener("click", () => {
    state.saved = !state.saved;
    localStorage.setItem("room-remix-saved-plan", state.saved ? state.plan : "");
    $("#saveButton").textContent = state.saved ? "♥ 已保存" : "♡ 保存方案";
    showToast(state.saved ? "方案已保存在本机" : "已取消保存");
  });

  const dialog = $("#logDialog");
  $("#traceList").innerHTML = data.trace.map((trace, index) => `
    <div class="trace-item"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${trace[0]}</strong><p>${trace[1]}</p></div><i>完成</i></div>
  `).join("");
  $("#openLogButton").addEventListener("click", () => dialog.showModal());
  $("#closeLogButton").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  if (localStorage.getItem("room-remix-saved-plan")) {
    state.saved = true;
    $("#saveButton").textContent = "♥ 已保存";
  }
})();
