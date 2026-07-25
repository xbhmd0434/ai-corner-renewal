(() => {
  const $ = (selector) => document.querySelector(selector);
  const apiHost =
    window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
  const API_BASE_URL =
    new URLSearchParams(window.location.search).get("api") ||
    `http://${apiHost}:8787`;
  const PROMPT_STORAGE_KEY = "corner-renewal.prompt-lab.prompt.layout-agent-v1.2";
  const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  const elements = {
    runtimeBadge: $("#runtimeBadge"),
    uploadZone: $("#uploadZone"),
    imageInput: $("#imageInput"),
    uploadTitle: $("#uploadTitle"),
    uploadDetail: $("#uploadDetail"),
    promptVersion: $("#promptVersion"),
    resetPromptButton: $("#resetPromptButton"),
    promptInput: $("#promptInput"),
    promptCount: $("#promptCount"),
    generateButton: $("#generateButton"),
    callNotice: $("#callNotice"),
    runState: $("#runState"),
    sourcePlaceholder: $("#sourcePlaceholder"),
    sourceImage: $("#sourceImage"),
    sourceMeta: $("#sourceMeta"),
    resultPlaceholder: $("#resultPlaceholder"),
    scanOverlay: $("#scanOverlay"),
    resultImage: $("#resultImage"),
    resultMeta: $("#resultMeta"),
    downloadLink: $("#downloadLink"),
    staleNote: $("#staleNote")
  };

  const state = {
    template: null,
    source: null,
    result: null,
    busy: false,
    resultStale: false
  };

  function setRuntime(kind, text) {
    elements.runtimeBadge.className = `runtime-badge ${kind}`;
    elements.runtimeBadge.querySelector("span").textContent = text;
  }

  function setRunState(kind, text) {
    elements.runState.className = `run-state ${kind}`;
    elements.runState.querySelector("span").textContent = text;
  }

  function formatBytes(value) {
    if (!Number.isFinite(value)) return "—";
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  function readPersistedPrompt() {
    try {
      return window.localStorage.getItem(PROMPT_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function persistPrompt(value) {
    try {
      window.localStorage.setItem(PROMPT_STORAGE_KEY, value);
    } catch {
      // Private browsing may deny storage. The editor still works in memory.
    }
  }

  function currentPromptVersion() {
    if (!state.template) return "custom";
    return elements.promptInput.value.trim() === state.template.prompt.trim()
      ? state.template.prompt_version
      : `${state.template.prompt_version}+custom`;
  }

  function updatePromptMeta() {
    const prompt = elements.promptInput.value;
    const maximum = state.template?.limits?.prompt_characters || 16_000;
    elements.promptCount.textContent = `${prompt.length.toLocaleString()} / ${maximum.toLocaleString()} 字`;
    const version = currentPromptVersion();
    elements.promptVersion.textContent = version;
    elements.promptVersion.title = version;
    updateReadyState();
  }

  function updateReadyState() {
    const available = state.template?.available === true;
    const hasPrompt = elements.promptInput.value.trim().length >= 20;
    const ready = available && Boolean(state.source) && hasPrompt && !state.busy;
    elements.generateButton.disabled = !ready;
    if (state.busy) {
      elements.callNotice.textContent =
        "正在调用真实模型，请等待本次结果返回。";
    } else if (!state.template) {
      elements.callNotice.textContent = "正在读取本地后端与默认 Prompt。";
    } else if (!available) {
      elements.callNotice.textContent =
        "模型调用未启用：请确认 AI_BACKEND_MODE 不是 demo，并已配置 Agent Plan Key。";
    } else if (!state.source) {
      elements.callNotice.textContent =
        "先上传一张家居照片；一次点击会调用一次布置规划和一次图片生成。";
    } else if (!hasPrompt) {
      elements.callNotice.textContent = "Prompt 至少需要 20 个字符。";
    } else {
      elements.callNotice.textContent =
        "已就绪。Agent 会先规划，方案通过后才调用 Seedream。";
    }
  }

  async function readJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        body?.error?.message || `请求失败（HTTP ${response.status}）`
      );
      error.code = body?.error?.code || "request_failed";
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function loadTemplate() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prompt-lab`, {
        headers: { Accept: "application/json" }
      });
      const template = await readJson(response);
      state.template = template;
      const persisted = readPersistedPrompt();
      elements.promptInput.value = persisted || template.prompt;
      elements.promptInput.maxLength =
        template.limits?.prompt_characters || 16_000;
      elements.promptInput.disabled = false;
      elements.resetPromptButton.disabled = false;
      if (template.available) {
        setRuntime("live", `${template.model} · 可调用`);
      } else {
        setRuntime("offline", "后端在线 · 模型未启用");
      }
      updatePromptMeta();
    } catch (error) {
      setRuntime("offline", "本地后端未连接");
      elements.promptInput.disabled = true;
      elements.resetPromptButton.disabled = true;
      elements.promptInput.placeholder =
        `无法读取 ${API_BASE_URL}/api/prompt-lab，请先启动项目。`;
      setRunState("error", "后端未连接");
      elements.callNotice.textContent =
        error.message || "无法连接本地后端，请先启动项目。";
      updateReadyState();
    }
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("浏览器无法压缩这张图片")),
        "image/jpeg",
        quality
      );
    });
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("浏览器无法读取压缩后的图片"));
      reader.readAsDataURL(blob);
    });
  }

  async function bitmapFromFile(file) {
    if ("createImageBitmap" in window) {
      return window.createImageBitmap(file, {
        imageOrientation: "from-image"
      });
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function prepareImage(file) {
    if (!ACCEPTED_TYPES.has(file.type)) {
      throw new Error("只支持 PNG、JPEG 或 WebP 图片");
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new Error("原始图片不能超过 25 MB");
    }

    const bitmap = await bitmapFromFile(file);
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      bitmap.close?.();
      throw new Error("无法识别图片尺寸");
    }

    const maxEdge = 2048;
    const initialScale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    let width = Math.max(1, Math.round(sourceWidth * initialScale));
    let height = Math.max(1, Math.round(sourceHeight * initialScale));
    const targetBytes = Math.min(
      state.template?.limits?.input_image_bytes || 3_800_000,
      3_900_000
    );
    let blob = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const quality = [0.91, 0.84, 0.76, 0.68, 0.62][attempt];
      blob = await canvasBlob(canvas, quality);
      if (blob.size <= targetBytes) break;
      width = Math.max(960, Math.round(width * 0.82));
      height = Math.max(720, Math.round(height * 0.82));
    }
    bitmap.close?.();

    if (!blob || blob.size > targetBytes) {
      throw new Error("图片压缩后仍然过大，请换一张尺寸更小的图片");
    }
    return {
      filename: file.name,
      dataUrl: await blobDataUrl(blob),
      width,
      height,
      bytes: blob.size,
      originalBytes: file.size
    };
  }

  function clearResultForNewSource() {
    state.result = null;
    state.resultStale = false;
    elements.resultImage.hidden = true;
    elements.resultImage.removeAttribute("src");
    elements.resultPlaceholder.hidden = false;
    elements.resultPlaceholder.querySelector(".coordinate").textContent =
      "RUN / NONE";
    elements.resultPlaceholder.querySelector("strong").textContent =
      "结果会出现在这里";
    elements.resultPlaceholder.querySelector("small").textContent =
      "通常需要几十秒，请不要重复提交";
    elements.resultMeta.textContent = "—";
    elements.downloadLink.hidden = true;
    elements.downloadLink.removeAttribute("href");
    elements.staleNote.hidden = true;
  }

  async function acceptFile(file) {
    setRunState("busy", "正在准备图片");
    elements.uploadTitle.textContent = "正在压缩模型输入…";
    elements.uploadDetail.textContent = file.name;
    try {
      const prepared = await prepareImage(file);
      state.source = prepared;
      elements.sourceImage.src = prepared.dataUrl;
      elements.sourceImage.hidden = false;
      elements.sourcePlaceholder.hidden = true;
      elements.sourceMeta.textContent =
        `${prepared.width} × ${prepared.height} · ${formatBytes(prepared.bytes)} MODEL INPUT`;
      elements.uploadTitle.textContent = file.name;
      elements.uploadDetail.textContent =
        `原始 ${formatBytes(prepared.originalBytes)} → 模型输入 ${formatBytes(prepared.bytes)}`;
      clearResultForNewSource();
      setRunState("ready", "图片已就绪");
    } catch (error) {
      state.source = null;
      elements.uploadTitle.textContent = "这张图片无法使用";
      elements.uploadDetail.textContent = error.message;
      setRunState("error", "图片处理失败");
    }
    updateReadyState();
  }

  function setBusy(value) {
    state.busy = value;
    elements.imageInput.disabled = value;
    elements.promptInput.disabled = value;
    elements.resetPromptButton.disabled = value;
    elements.generateButton.querySelector(".button-label").textContent = value
      ? "正在规划并改图"
      : "开始改图";
    elements.scanOverlay.hidden = !value;
    updateReadyState();
  }

  async function generate() {
    if (
      state.busy ||
      !state.source ||
      !state.template?.available ||
      elements.promptInput.value.trim().length < 20
    ) {
      return;
    }

    setBusy(true);
    setRunState("busy", "Agent 正在规划并改图");
    const promptVersion = currentPromptVersion();
    try {
      const response = await fetch(`${API_BASE_URL}/api/prompt-lab/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          schema_version: "1.0",
          prompt_version: promptVersion,
          prompt: elements.promptInput.value,
          image_data_url: state.source.dataUrl
        })
      });
      const result = await readJson(response);
      state.result = result;
      state.resultStale = false;
      elements.resultImage.src = result.image_data_url;
      elements.resultImage.hidden = false;
      elements.resultPlaceholder.hidden = true;
      elements.resultMeta.textContent =
        `${result.planning_model} → ${result.model} · ${(result.latency_ms / 1000).toFixed(1)}s · ${result.prompt_version}`;
      elements.downloadLink.href = result.image_data_url;
      elements.downloadLink.download =
        `prompt-lab-${Date.now()}.${result.media_type === "image/png" ? "png" : result.media_type === "image/webp" ? "webp" : "jpg"}`;
      elements.downloadLink.hidden = false;
      elements.staleNote.hidden = true;
      setRunState("ready", "真实结果已返回");
    } catch (error) {
      if (!state.result) {
        elements.resultPlaceholder.hidden = false;
        elements.resultPlaceholder.querySelector(".coordinate").textContent =
          `ERROR / ${String(error.code || "UNKNOWN").toUpperCase()}`;
        elements.resultPlaceholder.querySelector("strong").textContent =
          "这次没有生成结果";
        elements.resultPlaceholder.querySelector("small").textContent =
          error.message;
      }
      setRunState("error", error.message || "模型调用失败");
    } finally {
      setBusy(false);
    }
  }

  elements.imageInput.addEventListener("change", () => {
    const [file] = elements.imageInput.files || [];
    if (file) acceptFile(file);
    elements.imageInput.value = "";
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!state.busy) elements.uploadZone.classList.add("dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    elements.uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.uploadZone.classList.remove("dragging");
    });
  }

  elements.uploadZone.addEventListener("drop", (event) => {
    if (state.busy) return;
    const [file] = event.dataTransfer?.files || [];
    if (file) acceptFile(file);
  });

  elements.promptInput.addEventListener("input", () => {
    persistPrompt(elements.promptInput.value);
    if (state.result) {
      state.resultStale = true;
      elements.staleNote.hidden = false;
      setRunState("idle", "参数已修改");
    }
    updatePromptMeta();
  });

  elements.resetPromptButton.addEventListener("click", () => {
    if (!state.template) return;
    elements.promptInput.value = state.template.prompt;
    persistPrompt(state.template.prompt);
    if (state.result) {
      state.resultStale = true;
      elements.staleNote.hidden = false;
      setRunState("idle", "参数已恢复，等待重跑");
    }
    updatePromptMeta();
    elements.promptInput.focus();
  });

  elements.generateButton.addEventListener("click", generate);

  elements.promptInput.disabled = true;
  elements.resetPromptButton.disabled = true;
  updateReadyState();
  loadTemplate();
})();
