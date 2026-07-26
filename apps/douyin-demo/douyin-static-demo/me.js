/* =============================================================
   个性化空间优化与商品识别  ·  前端 Demo
   - 3 步流程：引导 → 上传 → 工作台 → 导出
   - Canvas 渲染：图像 + 边界框 + 选中高亮 + 拖拽
   - 5 大模块：上传 / AI 优化 / 结果 / 物品交互 / 商品识别
   - API 全部为 mock，预留后端接入位
   ============================================================= */

const shootSubmit = document.querySelector("#meShootSubmit");
const toast = document.querySelector("#meToast");
const tabButtons = Array.from(document.querySelectorAll("[data-me-tab]"));
const grid = document.querySelector("#meGrid");
const spaceLayer = document.querySelector("#meSpaceLayer");
const spacePage = document.querySelector("#meSpacePage");

/* ---------- 通用工具 ---------- */
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function uid(prefix = "item") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* =============================================================
   API Mock 层  ·  后端接入时替换为真实 fetch 即可
   ============================================================= */
const SpaceAPI = {
  /** 物品识别：返回检测到的物品列表（含边界框 + 多维属性） */
  async recognizeItems(imageDataUrl, scene) {
    await delay(900 + Math.random() * 600);
    // mock：根据场景生成不同的物品
    const presets = {
      desk: [
        { label: "台灯", type: "灯具", style: "北欧", color: "白色", size: "中" },
        { label: "显示器", type: "电子产品", style: "简约", color: "黑色", size: "大" },
        { label: "键盘", type: "电子产品", style: "机械", color: "深灰", size: "中" },
        { label: "绿植", type: "植物", style: "ins风", color: "绿色", size: "小" }
      ],
      balcony: [
        { label: "藤椅", type: "家具", style: "复古", color: "原木", size: "大" },
        { label: "花盆", type: "植物容器", style: "陶土", color: "砖红", size: "中" },
        { label: "氛围灯", type: "灯具", style: "暖光", color: "黄色", size: "小" }
      ],
      living: [
        { label: "沙发", type: "家具", style: "现代", color: "灰色", size: "大" },
        { label: "茶几", type: "家具", style: "极简", color: "白色", size: "中" },
        { label: "地毯", type: "软装", style: "几何", color: "米色", size: "大" },
        { label: "装饰画", type: "墙饰", style: "抽象", color: "多彩", size: "中" }
      ],
      bedroom: [
        { label: "床", type: "家具", style: "现代", color: "灰色", size: "大" },
        { label: "床头柜", type: "家具", style: "简约", color: "原木", size: "中" },
        { label: "台灯", type: "灯具", style: "暖光", color: "白色", size: "小" }
      ]
    };
    const list = presets[scene] || presets.desk;
    return list.map((item, i) => ({
      id: uid("obj"),
      label: item.label,
      confidence: 0.86 + Math.random() * 0.12,
      attrs: item,
      // bbox 使用相对坐标 0~1，便于不同尺寸画布
      bbox: [
        0.08 + (i % 2) * 0.46 + Math.random() * 0.04,
        0.12 + Math.floor(i / 2) * 0.36 + Math.random() * 0.04,
        0.32 + Math.random() * 0.08,
        0.26 + Math.random() * 0.06
      ],
      removed: false
    }));
  },

  /** AI 空间优化：增添物品 */
  async addItem(imageDataUrl, scene) {
    await delay(1200 + Math.random() * 600);
    const pool = {
      desk: [{ label: "香薰机", type: "氛围", style: "ins", color: "白色", size: "小" }],
      balcony: [{ label: "悬挂花架", type: "收纳", style: "原木", color: "木色", size: "中" }],
      living: [{ label: "落地灯", type: "灯具", style: "北欧", color: "黑色", size: "大" }],
      bedroom: [{ label: "抱枕", type: "软装", style: "几何", color: "莫兰迪粉", size: "小" }]
    };
    const pick = (pool[scene] || pool.desk)[0];
    return {
      id: uid("add"),
      label: pick.label,
      confidence: 0.92,
      attrs: pick,
      bbox: [0.35 + Math.random() * 0.1, 0.4 + Math.random() * 0.1, 0.22, 0.2],
      removed: false,
      aiGenerated: true
    };
  },

  /** 商品推荐：根据物品属性返回相关商品 */
  async recommendProducts(item) {
    await delay(800 + Math.random() * 600);
    const catalog = {
      台灯: [
        { name: "北欧极简护眼台灯", price: "¥199", tags: ["护眼", "无极调光"], score: 96, shop: "小米官方店" },
        { name: "智能感应LED台灯", price: "¥329", tags: ["感应", "智能"], score: 93, shop: "华为智选" }
      ],
      显示器: [
        { name: "27寸 4K 专业设计显示器", price: "¥2199", tags: ["4K", "Type-C"], score: 95, shop: "戴尔旗舰店" },
        { name: "32寸 2K 曲面屏", price: "¥1799", tags: ["曲面", "144Hz"], score: 89, shop: "三星旗舰店" }
      ],
      沙发: [
        { name: "意式极简布艺沙发", price: "¥3580", tags: ["可拆洗", "高密度海绵"], score: 94, shop: "源氏木语" },
        { name: "科技布懒人沙发", price: "¥1280", tags: ["科技布", "可躺"], score: 90, shop: "林氏家居" }
      ],
      绿植: [
        { name: "ins 风龟背竹盆栽", price: "¥89", tags: ["净化空气", "好养"], score: 92, shop: "花加官方" }
      ]
    };
    return catalog[item.label] || [
      { name: `${item.label}同款好物`, price: "¥" + (99 + Math.floor(Math.random() * 999)), tags: [item.attrs.style, item.attrs.color], score: 88, shop: "精选好物" },
      { name: `${item.label}潮流款`, price: "¥" + (199 + Math.floor(Math.random() * 499)), tags: ["热销", "包邮"], score: 84, shop: "潮流家居" }
    ];
  },

  /** 布局优化建议 */
  async suggestLayout(items) {
    await delay(700);
    return {
      advice: "建议将大型家具沿墙摆放，留出中央动线；绿植靠近自然光源更佳。",
      score: 8.6
    };
  }
};

/* =============================================================
   状态管理
   ============================================================= */
const state = {
  step: 0, // 0=landing 1=upload 2=workspace 3=result
  scene: "desk",
  upload: null,           // { url, name, width, height }
  imageEl: null,          // Image 元素
  items: [],              // 识别到的物品
  selectedIds: new Set(),
  multiSelect: false,
  tab: "select",          // select | optimize | recognize | export
  editHistory: [],        // { items, label } 快照（当前页面撤销/重做）
  editHistoryIndex: -1,
  processing: false,
  compareMode: false,
  compareRatio: 0.5,
  products: [],
  productsLoading: false,
  activeProductFor: null
};

const SCENES = [
  { key: "desk", label: "书桌", icon: "🖥" },
  { key: "balcony", label: "阳台", icon: "🌿" },
  { key: "living", label: "客厅", icon: "🛋" },
  { key: "bedroom", label: "卧室", icon: "🛏" },
  { key: "kitchen", label: "厨房（示例）", icon: "🍳", isDemo: true },
  { key: "study", label: "书房（示例）", icon: "📚", isDemo: true }
];

/* =============================================================
   渲染入口
   ============================================================= */
function renderSpace() {
  if (!spacePage) return;
  const step = state.step;
  const top = renderTopBar();
  const body =
    step === 0 ? renderLanding() :
    step === 1 ? renderUpload() :
    step === 2 ? renderWorkspace() :
    renderResult();
  spacePage.innerHTML = top + body;
  bindSpaceEvents();
  if (step === 2) {
    setupCanvas();
    renderSheet();
  }
}

function renderTopBar() {
  const titles = [
    { strong: "个性化空间优化", small: "AI × 商品识别" },
    { strong: "上传空间图片", small: "步骤 1 / 3" },
    { strong: "AI 优化工作台", small: "步骤 2 / 3" },
    { strong: "优化结果", small: "步骤 3 / 3" }
  ];
  const t = titles[state.step];
  const showUndo = state.step === 2;
  const showCompare = state.step === 2 && state.editHistory.length > 1;
  return `
    <header class="me-space-top">
      <button class="me-space-top__back" type="button" data-sp-back aria-label="返回">‹</button>
      <div class="me-space-top__title">
        <strong>${t.strong}</strong>
        <small>${t.small}</small>
      </div>
      <div class="me-space-top__tools">
        ${showUndo ? `
          <button class="me-space-icon-btn" type="button" data-sp-undo aria-label="撤销" ${state.editHistoryIndex <= 0 ? "data-disabled=\"true\"" : ""}>↶</button>
          <button class="me-space-icon-btn" type="button" data-sp-redo aria-label="重做" ${state.editHistoryIndex >= state.editHistory.length - 1 ? "data-disabled=\"true\"" : ""}>↷</button>
          <button class="me-space-icon-btn ${state.compareMode ? "active" : ""}" type="button" data-sp-compare aria-label="对比" ${!showCompare ? "data-disabled=\"true\"" : ""}>⇄</button>
        ` : ""}
      </div>
      <button class="me-space-close" type="button" data-sp-close aria-label="关闭">×</button>
    </header>
  `;
}

/* =============================================================
   步骤 0 · 引导页
   ============================================================= */
function renderLanding() {
  return `
    <div class="me-space-scroll me-space-landing">
      <section class="me-space-hero">
        <div class="me-space-hero__grid"></div>
        <span class="me-space-hero__badge">AI × 空间美学</span>
        <h1>重塑你的<br><b>生活空间</b></h1>
        <p>上传任意生活场景图，AI 自动识别物品、智能优化布局，并推荐同款好物。从一张照片开始，重新设计你的家。</p>
      </section>

      <section class="me-space-section">
        <div class="me-space-section__title">四大核心能力</div>
        <div class="me-space-capability">
          <article>
            <i>＋</i><strong>物品增添</strong><span>AI 推荐合适物品并融入场景</span>
          </article>
          <article>
            <i>－</i><strong>物品删减</strong><span>精准移除，背景自然过渡</span>
          </article>
          <article>
            <i>↔</i><strong>布局调整</strong><span>拖拽重排，AI 给出优化建议</span>
          </article>
          <article>
            <i>◉</i><strong>商品识别</strong><span>识别物品，秒推同款购买链接</span>
          </article>
        </div>
      </section>

      <section class="me-space-section">
        <div class="me-space-section__title">三步完成空间优化</div>
        <div class="me-space-flow">
          <div class="me-space-flow__step">
            <div class="me-space-flow__num">1</div>
            <div><strong>上传场景图片</strong><span>支持 JPG / PNG，书桌、客厅、阳台均可</span></div>
          </div>
          <div class="me-space-flow__step">
            <div class="me-space-flow__num">2</div>
            <div><strong>AI 工作台编辑</strong><span>选中、增添、删除、拖拽，实时预览</span></div>
          </div>
          <div class="me-space-flow__step">
            <div class="me-space-flow__num">3</div>
            <div><strong>导出与商品推荐</strong><span>高分辨率导出，一键购买同款</span></div>
          </div>
        </div>
      </section>
    </div>
    <footer class="me-space-action">
      <button class="me-space-primary" type="button" data-sp-start>
        开始优化我的空间
        <span>上传图片，AI 帮你设计</span>
      </button>
    </footer>
  `;
}

/* =============================================================
   步骤 1 · 上传
   ============================================================= */
function renderUpload() {
  const has = !!state.upload;
  return `
    <div class="me-space-scroll me-space-upload">
      <!-- 拍照按钮 -->
      <button class="me-space-camera-btn" type="button" data-sp-camera aria-label="拍照">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <strong>拍照上传</strong>
        <small>直接拍摄空间照片</small>
      </button>

      <label class="me-space-drop ${has ? "has-image" : ""}" for="meSpaceFileInput">
        <input id="meSpaceFileInput" class="me-space-drop__input" type="file" accept="image/jpeg,image/png,image/jpg,image/webp">
        <input id="meSpaceCameraInput" class="me-space-drop__input" type="file" accept="image/*" capture="environment">
        ${has ? `
          <div class="me-space-drop__preview">
            <img src="${escapeHtml(state.upload.url)}" alt="空间预览" />
            <div class="me-space-drop__preview-meta">
              <strong>${escapeHtml(state.upload.name)}</strong>
              <button type="button" data-sp-clear>重新选择</button>
            </div>
          </div>
        ` : `
          <div class="me-space-drop__icon">🖼</div>
          <strong>点击上传空间图片</strong>
          <small>支持 JPG / PNG / WEBP · 静态演示：图片仅保存在当前浏览器会话</small>
        `}
      </label>

      <div class="me-space-scene-label">
        <span>选择场景类型</span>
        <small>AI 会根据场景智能识别</small>
      </div>
      <div class="me-space-scene">
        ${SCENES.map((s) => `
          <button type="button" class="${state.scene === s.key ? "active" : ""}" data-sp-scene="${s.key}">
            <i>${s.icon}</i>
            <span>${s.label}</span>
          </button>
        `).join("")}
      </div>

      <div class="me-space-format">
        <span>JPG</span><span>PNG</span><span>WEBP</span><span>≤ 20MB</span><span>推荐 1920×1080+</span>
      </div>
    </div>
    <footer class="me-space-action">
      <button class="me-space-primary" type="button" data-sp-next ${!has ? "data-disabled=\"true\"" : ""}>
        进入 AI 工作台
        <span>识别物品并开始优化</span>
      </button>
    </footer>
  `;
}

/* =============================================================
   步骤 2 · 工作台
   ============================================================= */
function renderWorkspace() {
  return `
    <div class="me-space-work">
      <div class="me-space-stage" id="spStage">
        <div class="me-space-canvas-wrap" id="spCanvasWrap">
          <canvas class="me-space-canvas" id="spCanvas"></canvas>
        </div>
        <div class="me-space-stage-hud">
          <span class="me-space-hud-pill">物品 <b id="spItemCount">0</b></span>
          <span class="me-space-hud-pill hot">选中 <b id="spSelCount">0</b></span>
        </div>
        <div class="me-space-processing" id="spProcessing">
          <div class="me-space-processing__ring"></div>
          <strong id="spProcTitle">AI 处理中</strong>
          <small id="spProcHint">请稍候，响应延迟 ≤ 2 秒</small>
        </div>
        <div class="me-space-compare" id="spCompare">
          <div class="me-space-compare__after" id="spCompareAfter"></div>
          <div class="me-space-compare__before" id="spCompareBefore"></div>
          <div class="me-space-compare__handle" id="spCompareHandle"></div>
          <span class="me-space-compare__tag me-space-compare__tag--before">优化前</span>
          <span class="me-space-compare__tag me-space-compare__tag--after">优化后</span>
        </div>
        <button class="me-space-fab" type="button" data-sp-recognize aria-label="识别商品">
          <i>◉</i>
          <span>识别</span>
        </button>
      </div>
      <div class="me-space-sheet" id="spSheet">
        <div class="me-space-sheet__grip" data-sp-grip></div>
        <div class="me-space-sheet__head">
          <div>
            <strong id="spSheetTitle">物品列表</strong>
            <small id="spSheetHint">点击物品可选中</small>
          </div>
          <small id="spSheetMeta"></small>
        </div>
        <div class="me-space-sheet__body" id="spSheetBody"></div>
      </div>
      <nav class="me-space-tabs" aria-label="工具切换">
        <button class="me-space-tab ${state.tab === "select" ? "active" : ""}" type="button" data-sp-tab="select">
          <i>◉</i><span>选择</span>
        </button>
        <button class="me-space-tab ${state.tab === "optimize" ? "active" : ""}" type="button" data-sp-tab="optimize">
          <i>✦</i><span>AI 优化</span>
        </button>
        <button class="me-space-tab ${state.tab === "recognize" ? "active" : ""}" type="button" data-sp-tab="recognize">
          <i>🏷</i><span>商品</span>
        </button>
        <button class="me-space-tab ${state.tab === "export" ? "active" : ""}" type="button" data-sp-tab="export">
          <i>↥</i><span>导出</span>
        </button>
      </nav>
    </div>
  `;
}

/* =============================================================
   步骤 3 · 结果
   ============================================================= */
function renderResult() {
  const totalOps = state.editHistory.length;
  const recognized = state.items.filter((i) => !i.removed).length;
  const removed = state.items.filter((i) => i.removed).length;
  return `
    <div class="me-space-scroll me-space-result">
      <div class="me-space-result__mark">✓</div>
      <h2>空间优化完成</h2>
      <p>已为你生成高分辨率优化结果，可下载到本地或继续编辑。</p>
      <div class="me-space-result__stats">
        <div><strong>${recognized}</strong><small>识别物品</small></div>
        <div><strong>${removed}</strong><small>已移除</small></div>
        <div><strong>${Math.max(0, totalOps - 1)}</strong><small>编辑次数</small></div>
      </div>
      <div class="me-space-section">
        <div class="me-space-section__title">导出选项</div>
        <div class="me-space-export-row">
          <button type="button" data-sp-export data-quality="hd">导出 高清 1080P</button>
          <button type="button" class="primary" data-sp-export data-quality="2k">导出 2K 超清</button>
        </div>
        <div class="me-space-export-row">
          <button type="button" data-sp-back-workspace>返回继续编辑</button>
          <button type="button" data-sp-share>分享到抖音</button>
        </div>
      </div>
    </div>
    <footer class="me-space-action">
      <button class="me-space-primary" type="button" data-sp-done>
        完成
        <span>返回我的主页</span>
      </button>
    </footer>
  `;
}

/* =============================================================
   事件绑定
   ============================================================= */
function bindSpaceEvents() {
  spacePage?.querySelectorAll("[data-sp-close]").forEach((b) =>
    b.addEventListener("click", closeSpaceActivity)
  );
  spacePage?.querySelectorAll("[data-sp-back]").forEach((b) =>
    b.addEventListener("click", () => {
      if (state.step === 0) {
        closeSpaceActivity();
      } else if (state.step === 1) {
        state.step = 0;
        renderSpace();
      } else if (state.step === 2) {
        state.step = 1;
        renderSpace();
      } else {
        state.step = 2;
        renderSpace();
      }
    })
  );
  spacePage?.querySelectorAll("[data-sp-start]").forEach((b) =>
    b.addEventListener("click", () => {
      state.step = 1;
      renderSpace();
    })
  );
  spacePage?.querySelectorAll("[data-sp-scene]").forEach((b) =>
    b.addEventListener("click", () => {
      state.scene = b.dataset.spScene;
      renderSpace();
    })
  );
  spacePage?.querySelectorAll("[data-sp-clear]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.upload?.url) URL.revokeObjectURL(state.upload.url);
      state.upload = null;
      renderSpace();
    })
  );
  spacePage?.querySelector("#meSpaceFileInput")?.addEventListener("change", handleFileSelect);
  spacePage?.querySelector("#meSpaceCameraInput")?.addEventListener("change", handleFileSelect);
  spacePage?.querySelectorAll("[data-sp-camera]").forEach((b) =>
    b.addEventListener("click", () => {
      spacePage?.querySelector("#meSpaceCameraInput")?.click();
    })
  );
  spacePage?.querySelectorAll("[data-sp-next]").forEach((b) =>
    b.addEventListener("click", enterWorkspace)
  );
  spacePage?.querySelectorAll("[data-sp-undo]").forEach((b) =>
    b.addEventListener("click", undo)
  );
  spacePage?.querySelectorAll("[data-sp-redo]").forEach((b) =>
    b.addEventListener("click", redo)
  );
  spacePage?.querySelectorAll("[data-sp-compare]").forEach((b) =>
    b.addEventListener("click", toggleCompare)
  );
  spacePage?.querySelectorAll("[data-sp-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.spTab;
      renderSheet();
      updateTabActive();
    })
  );
  spacePage?.querySelectorAll("[data-sp-recognize]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = "recognize";
      renderSheet();
      updateTabActive();
      runRecognizeFlow();
    })
  );
  spacePage?.querySelectorAll("[data-sp-export]").forEach((b) =>
    b.addEventListener("click", () => exportImage(b.dataset.quality || "hd"))
  );
  spacePage?.querySelectorAll("[data-sp-back-workspace]").forEach((b) =>
    b.addEventListener("click", () => {
      state.step = 2;
      renderSpace();
    })
  );
  spacePage?.querySelectorAll("[data-sp-share]").forEach((b) =>
    b.addEventListener("click", () => showToast("已生成分享链接（示例）"))
  );
  spacePage?.querySelectorAll("[data-sp-done]").forEach((b) =>
    b.addEventListener("click", () => {
      closeSpaceActivity();
      showToast("空间优化已完成");
    })
  );
  spacePage?.querySelectorAll("[data-sp-grip]").forEach((b) =>
    b.addEventListener("click", () => {
      const sheet = spacePage.querySelector("#spSheet");
      sheet?.classList.toggle("expanded");
    })
  );

  bindSheetEvents();
}

function updateTabActive() {
  spacePage?.querySelectorAll(".me-space-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.spTab === state.tab);
  });
}

/* =============================================================
   文件上传处理
   ============================================================= */
function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|jpg|webp)$/.test(file.type)) {
    showToast("仅支持 JPG / PNG / WEBP 格式");
    return;
  }
  if (state.upload?.url) URL.revokeObjectURL(state.upload.url);
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.upload = { url, name: file.name, width: img.naturalWidth, height: img.naturalHeight };
    state.imageEl = img;
    renderSpace();
  };
  img.onerror = () => {
    showToast("图片加载失败");
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/* =============================================================
   进入工作台
   ============================================================= */
async function enterWorkspace() {
  if (!state.upload) return;
  state.step = 2;
  state.items = [];
  state.selectedIds = new Set();
  state.editHistory = [];
  state.editHistoryIndex = -1;
  renderSpace();

  showProcessing("AI 识别中", "正在分析图片中的物品");
  try {
    const items = await SpaceAPI.recognizeItems(state.upload.url, state.scene);
    state.items = items;
    pushHistory("初始识别");
    showToast(`已识别到 ${items.length} 个物品`);
  } catch (e) {
    showToast("识别失败，请重试");
  } finally {
    hideProcessing();
    redrawCanvas();
    renderSheet();
  }
}

/* =============================================================
   Canvas 渲染引擎
   ============================================================= */
let canvasCtx = null;
let canvasLayout = { scale: 1, offsetX: 0, offsetY: 0, displayW: 0, displayH: 0 };

function setupCanvas() {
  const canvas = spacePage?.querySelector("#spCanvas");
  if (!canvas || !state.imageEl) return;
  const ctx = canvas.getContext("2d");
  canvasCtx = ctx;

  const resize = () => {
    const wrap = spacePage?.querySelector("#spCanvasWrap");
    if (!wrap) return;
    const maxW = wrap.clientWidth - 24;
    const maxH = wrap.clientHeight - 24;
    const imgW = state.imageEl.naturalWidth;
    const imgH = state.imageEl.naturalHeight;
    const scale = Math.min(maxW / imgW, maxH / imgH, 1);
    const dw = Math.max(1, Math.floor(imgW * scale));
    const dh = Math.max(1, Math.floor(imgH * scale));
    canvas.width = imgW;
    canvas.height = imgH;
    canvas.style.width = dw + "px";
    canvas.style.height = dh + "px";
    canvasLayout = { scale, offsetX: 0, offsetY: 0, displayW: dw, displayH: dh };
    redrawCanvas();
  };

  resize();
  window.removeEventListener("resize", canvasResizeHandler);
  canvasResizeHandler = resize;
  window.addEventListener("resize", resize);

  // 交互
  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("pointermove", onCanvasPointerMove);
  canvas.addEventListener("pointerup", onCanvasPointerUp);
  canvas.addEventListener("pointercancel", onCanvasPointerUp);
}

let canvasResizeHandler = null;

function redrawCanvas() {
  const canvas = spacePage?.querySelector("#spCanvas");
  if (!canvas || !canvasCtx || !state.imageEl) return;
  const ctx = canvasCtx;
  const img = state.imageEl;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  // 绘制物品框
  state.items.forEach((item) => {
    if (item.removed) {
      drawRemovedOverlay(ctx, item);
    } else {
      drawItemBox(ctx, item, state.selectedIds.has(item.id));
    }
  });

  updateStageHud();
}

function drawItemBox(ctx, item, selected) {
  const [rx, ry, rw, rh] = item.bbox;
  const x = rx * ctx.canvas.width;
  const y = ry * ctx.canvas.height;
  const w = rw * ctx.canvas.width;
  const h = rh * ctx.canvas.height;
  const color = item.aiGenerated ? "#ffcd3a" : "#25f4ee";

  ctx.save();
  ctx.lineWidth = selected ? 4 : 2;
  ctx.strokeStyle = selected ? "#fe2c55" : color;
  if (selected) {
    ctx.shadowColor = "rgba(254,44,85,0.6)";
    ctx.shadowBlur = 12;
  }
  ctx.strokeRect(x, y, w, h);

  // 角标
  const cornerLen = Math.min(14, w / 4, h / 4);
  ctx.lineWidth = 3;
  ctx.strokeStyle = selected ? "#fe2c55" : color;
  [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * cornerLen);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * cornerLen, cy);
    ctx.stroke();
  });

  // 标签
  const label = `${item.label} ${Math.round(item.confidence * 100)}%`;
  ctx.font = "600 14px Inter, sans-serif";
  const tw = ctx.measureText(label).width + 12;
  const th = 20;
  ctx.fillStyle = selected ? "#fe2c55" : color;
  roundRect(ctx, x, y - th - 2, tw, th, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 6, y - 8);

  if (item.aiGenerated) {
    ctx.fillStyle = "rgba(255,205,58,0.18)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function drawRemovedOverlay(ctx, item) {
  const [rx, ry, rw, rh] = item.bbox;
  const x = rx * ctx.canvas.width;
  const y = ry * ctx.canvas.height;
  const w = rw * ctx.canvas.width;
  const h = rh * ctx.canvas.height;
  ctx.save();
  ctx.fillStyle = "rgba(7,6,13,0.6)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "600 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("已移除", x + w / 2, y + h / 2);
  ctx.textAlign = "start";
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function updateStageHud() {
  const itemcount = spacePage?.querySelector("#spItemCount");
  const selcount = spacePage?.querySelector("#spSelCount");
  if (itemcount) itemcount.textContent = state.items.filter((i) => !i.removed).length;
  if (selcount) selcount.textContent = state.selectedIds.size;
}

/* ---------- 指针交互：选中 + 拖拽 ---------- */
let pointerState = { down: false, moved: false, dragging: null, startX: 0, startY: 0, origBox: null };

function getCanvasPoint(e) {
  const canvas = spacePage?.querySelector("#spCanvas");
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

function hitTest(x, y) {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item.removed) continue;
    const [rx, ry, rw, rh] = item.bbox;
    const ix = rx * canvasCtx.canvas.width;
    const iy = ry * canvasCtx.canvas.height;
    const iw = rw * canvasCtx.canvas.width;
    const ih = rh * canvasCtx.canvas.height;
    if (x >= ix && x <= ix + iw && y >= iy && y <= iy + ih) return item;
  }
  return null;
}

function onCanvasPointerDown(e) {
  const canvas = spacePage?.querySelector("#spCanvas");
  canvas?.setPointerCapture(e.pointerId);
  pointerState.down = true;
  pointerState.moved = false;
  const p = getCanvasPoint(e);
  pointerState.startX = p.x;
  pointerState.startY = p.y;
  const hit = hitTest(p.x, p.y);
  if (hit) {
    if (!state.selectedIds.has(hit.id)) {
      if (!state.multiSelect) state.selectedIds.clear();
      state.selectedIds.add(hit.id);
      renderSheet();
    }
    pointerState.dragging = hit;
    pointerState.origBox = [...hit.bbox];
  } else {
    if (state.selectedIds.size > 0) {
      state.selectedIds.clear();
      renderSheet();
    }
  }
  redrawCanvas();
}

function onCanvasPointerMove(e) {
  if (!pointerState.down || !pointerState.dragging) return;
  const p = getCanvasPoint(e);
  const dx = (p.x - pointerState.startX) / canvasCtx.canvas.width;
  const dy = (p.y - pointerState.startY) / canvasCtx.canvas.height;
  if (Math.abs(dx) > 0.005 || Math.abs(dy) > 0.005) pointerState.moved = true;
  const item = pointerState.dragging;
  const orig = pointerState.origBox;
  let nx = Math.max(0, Math.min(1 - orig[2], orig[0] + dx));
  let ny = Math.max(0, Math.min(1 - orig[3], orig[1] + dy));
  item.bbox = [nx, ny, orig[2], orig[3]];
  redrawCanvas();
}

function onCanvasPointerUp(e) {
  if (!pointerState.down) return;
  const wasDragging = pointerState.moved && pointerState.dragging;
  pointerState.down = false;
  pointerState.dragging = null;
  pointerState.origBox = null;
  if (wasDragging) {
    pushHistory("布局调整");
    showToast("已调整位置");
  }
}

/* =============================================================
   Sheet 面板
   ============================================================= */
function renderSheet() {
  const title = spacePage?.querySelector("#spSheetTitle");
  const hint = spacePage?.querySelector("#spSheetHint");
  const meta = spacePage?.querySelector("#spSheetMeta");
  const body = spacePage?.querySelector("#spSheetBody");
  if (!title || !hint || !body) return;

  if (state.tab === "select") {
    title.textContent = "物品列表";
    hint.textContent = "点击选中，支持多选";
    meta.textContent = `${state.items.length} 个`;
    body.innerHTML = renderSelectSheet();
  } else if (state.tab === "optimize") {
    title.textContent = "AI 空间优化";
    hint.textContent = "增添 / 删除 / 一键优化";
    meta.textContent = "";
    body.innerHTML = renderOptimizeSheet();
  } else if (state.tab === "recognize") {
    title.textContent = "商品推荐";
    hint.textContent = "选中物品后点击「识别同款」";
    meta.textContent = state.products.length ? `${state.products.length} 款` : "";
    body.innerHTML = renderRecognizeSheet();
  } else if (state.tab === "export") {
    title.textContent = "历史与导出";
    hint.textContent = "查看编辑历史，导出图片";
    meta.textContent = `${state.editHistory.length} 步`;
    body.innerHTML = renderExportSheet();
  }
  bindSheetEvents();
}

function renderSelectSheet() {
  const items = state.items;
  if (!items.length) {
    return `<div class="me-space-empty-hint">暂无识别物品<br>点击右下角「识别」按钮开始</div>`;
  }
  return `
    <div class="me-space-multi-toggle ${state.multiSelect ? "on" : ""}" data-sp-multi>
      <span>多选模式</span>
      <div class="me-space-switch"></div>
    </div>
    ${items.map((item) => {
      const selected = state.selectedIds.has(item.id);
      return `
        <div class="me-space-item-row ${selected ? "selected" : ""}" data-sp-item="${item.id}">
          <div class="me-space-item-row__check">✓</div>
          <div class="me-space-item-row__copy">
            <strong>${escapeHtml(item.label)}${item.aiGenerated ? " ✦" : ""}${item.removed ? " · 已移除" : ""}</strong>
            <small>${escapeHtml(item.attrs.type)} · ${escapeHtml(item.attrs.style)} · ${escapeHtml(item.attrs.color)}</small>
          </div>
          <div class="me-space-item-row__conf">${Math.round(item.confidence * 100)}%</div>
        </div>
      `;
    }).join("")}
  `;
}

function renderOptimizeSheet() {
  const selCount = state.selectedIds.size;
  return `
    <div class="me-space-suggest">
      <button type="button" data-sp-add>
        <div class="me-space-suggest__icon">＋</div>
        <div><strong>智能增添</strong><small>AI 推荐 1 个合适物品</small></div>
      </button>
      <button type="button" data-sp-remove ${selCount === 0 ? "data-disabled=\"true\"" : ""}>
        <div class="me-space-suggest__icon">－</div>
        <div><strong>移除选中</strong><small>${selCount > 0 ? `已选 ${selCount} 个` : "请先选中物品"}</small></div>
      </button>
      <button type="button" data-sp-layout>
        <div class="me-space-suggest__icon">↔</div>
        <div><strong>布局建议</strong><small>AI 给出优化图</small></div>
      </button>
      <button type="button" data-sp-restore ${selCount === 0 ? "data-disabled=\"true\"" : ""}>
        <div class="me-space-suggest__icon">↺</div>
        <div><strong>恢复移除</strong><small>${selCount > 0 ? `已选 ${selCount} 个` : "请先选中物品"}</small></div>
      </button>
    </div>
    <div class="me-space-empty-hint" style="margin-top:14px">
      提示：选中物品后可在画布上拖拽调整位置
    </div>
  `;
}

function renderRecognizeSheet() {
  if (state.productsLoading) {
    return `
      <div class="me-space-skeleton">
        <div class="me-space-skeleton__row"></div>
        <div class="me-space-skeleton__row"></div>
        <div class="me-space-skeleton__row"></div>
      </div>
    `;
  }
  if (!state.products.length) {
    return `
      <div class="me-space-empty-hint">
        请在画布上选中 1 个物品<br>然后点击右下角「识别」按钮
      </div>
    `;
  }
  return state.products.map((p) => `
    <div class="me-space-product">
      <div class="me-space-product__thumb">🏷</div>
      <div class="me-space-product__copy">
        <strong>${escapeHtml(p.name)}</strong>
        <small>${escapeHtml(p.shop)}</small>
        <div class="me-space-product__tags">
          ${p.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
      <div class="me-space-product__buy">
        <span class="me-space-product__price">${escapeHtml(p.price)}</span>
        <a class="me-space-product__link" href="#" data-sp-buy="${escapeHtml(p.name)}">去购买</a>
        <span class="me-space-product__score">相关度 ${p.score}</span>
      </div>
    </div>
  `).join("");
}

function renderExportSheet() {
  const history = state.editHistory;
  if (!history.length) {
    return `<div class="me-space-empty-hint">暂无编辑历史</div>`;
  }
  return `
    <div class="me-space-section__title" style="margin-bottom:8px">编辑历史</div>
    <div class="me-space-history">
      ${history.map((h, i) => `
        <button class="${i === state.editHistoryIndex ? "current" : ""}" type="button" data-sp-history="${i}" title="${escapeHtml(h.label)}">
          <i>${i === 0 ? "◉" : i}</i>
          <small>${escapeHtml(h.label)}</small>
        </button>
      `).join("")}
    </div>
    <div class="me-space-export-row">
      <button type="button" data-sp-export data-quality="hd">导出 1080P</button>
      <button type="button" class="primary" data-sp-export data-quality="2k">导出 2K</button>
    </div>
    <div class="me-space-export-row">
      <button type="button" data-sp-finish>完成并查看结果</button>
      <button type="button" data-sp-share>分享</button>
    </div>
  `;
}

function bindSheetEvents() {
  spacePage?.querySelectorAll("[data-sp-item]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.spItem;
      if (state.multiSelect) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else {
        state.selectedIds.clear();
        state.selectedIds.add(id);
      }
      renderSheet();
      redrawCanvas();
    });
  });

  spacePage?.querySelector("[data-sp-multi]")?.addEventListener("click", () => {
    state.multiSelect = !state.multiSelect;
    if (!state.multiSelect && state.selectedIds.size > 1) {
      const first = state.selectedIds.values().next().value;
      state.selectedIds = new Set([first]);
    }
    renderSheet();
    redrawCanvas();
  });

  spacePage?.querySelectorAll("[data-sp-add]").forEach((b) =>
    b.addEventListener("click", addAiItem)
  );
  spacePage?.querySelectorAll("[data-sp-remove]").forEach((b) =>
    b.addEventListener("click", removeSelected)
  );
  spacePage?.querySelectorAll("[data-sp-restore]").forEach((b) =>
    b.addEventListener("click", restoreSelected)
  );
  spacePage?.querySelectorAll("[data-sp-layout]").forEach((b) =>
    b.addEventListener("click", suggestLayout)
  );
  spacePage?.querySelectorAll("[data-sp-buy]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      showToast(`即将跳转：${b.dataset.spBuy}（示例链接）`);
    })
  );
  spacePage?.querySelectorAll("[data-sp-history]").forEach((b) =>
    b.addEventListener("click", () => jumpHistory(Number(b.dataset.spHistory)))
  );
  spacePage?.querySelectorAll("[data-sp-finish]").forEach((b) =>
    b.addEventListener("click", () => {
      state.step = 3;
      renderSpace();
    })
  );
}

/* =============================================================
   AI 操作
   ============================================================= */
async function addAiItem() {
  showProcessing("AI 增添中", "正在生成合适物品");
  try {
    const item = await SpaceAPI.addItem(state.upload.url, state.scene);
    state.items.push(item);
    state.selectedIds = new Set([item.id]);
    pushHistory(`增添 ${item.label}`);
    showToast(`已增添：${item.label}`);
  } catch {
    showToast("AI 增添失败");
  } finally {
    hideProcessing();
    redrawCanvas();
    renderSheet();
  }
}

function removeSelected() {
  if (state.selectedIds.size === 0) return;
  let n = 0;
  state.items.forEach((item) => {
    if (state.selectedIds.has(item.id) && !item.removed) {
      item.removed = true;
      n++;
    }
  });
  if (n > 0) {
    state.selectedIds.clear();
    pushHistory(`移除 ${n} 项`);
    showToast(`已移除 ${n} 个物品`);
    redrawCanvas();
    renderSheet();
  }
}

function restoreSelected() {
  if (state.selectedIds.size === 0) return;
  let n = 0;
  state.items.forEach((item) => {
    if (state.selectedIds.has(item.id) && item.removed) {
      item.removed = false;
      n++;
    }
  });
  if (n > 0) {
    pushHistory(`恢复 ${n} 项`);
    showToast(`已恢复 ${n} 个物品`);
    redrawCanvas();
    renderSheet();
  }
}

async function suggestLayout() {
  showProcessing("AI 分析布局", "正在生成优化建议");
  try {
    const result = await SpaceAPI.suggestLayout(state.items);
    showToast(`布局评分 ${result.score} / 10`);
    setTimeout(() => showToast(result.advice), 1500);
  } finally {
    hideProcessing();
  }
}

async function runRecognizeFlow() {
  if (state.selectedIds.size === 0) {
    showToast("请先在画布上选中 1 个物品");
    return;
  }
  if (state.selectedIds.size > 1) {
    showToast("一次仅识别 1 个物品，已使用第一个");
  }
  const id = state.selectedIds.values().next().value;
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  state.productsLoading = true;
  state.activeProductFor = id;
  renderSheet();
  try {
    const products = await SpaceAPI.recommendProducts(item);
    state.products = products;
    showToast(`已推荐 ${products.length} 款同款商品`);
  } catch {
    showToast("商品推荐失败");
  } finally {
    state.productsLoading = false;
    renderSheet();
  }
}

/* =============================================================
   历史记录（撤销 / 重做）
   ============================================================= */
function pushHistory(label) {
  const snapshot = {
    label,
    items: state.items.map((i) => ({ ...i, bbox: [...i.bbox] }))
  };
  state.editHistory = state.editHistory.slice(0, state.editHistoryIndex + 1);
  state.editHistory.push(snapshot);
  state.editHistoryIndex = state.editHistory.length - 1;
  refreshTopBarTools();
}

function applyHistory(idx) {
  if (idx < 0 || idx >= state.editHistory.length) return;
  const snapshot = state.editHistory[idx];
  state.items = snapshot.items.map((i) => ({ ...i, bbox: [...i.bbox] }));
  state.editHistoryIndex = idx;
  state.selectedIds.clear();
  redrawCanvas();
  renderSheet();
  refreshTopBarTools();
}

function undo() {
  if (state.editHistoryIndex <= 0) return;
  applyHistory(state.editHistoryIndex - 1);
  showToast("已撤销");
}

function redo() {
  if (state.editHistoryIndex >= state.editHistory.length - 1) return;
  applyHistory(state.editHistoryIndex + 1);
  showToast("已重做");
}

function jumpHistory(idx) {
  applyHistory(idx);
  showToast(`已跳转到：${state.editHistory[idx].label}`);
}

function refreshTopBarTools() {
  if (state.step !== 2) return;
  const undoBtn = spacePage?.querySelector("[data-sp-undo]");
  const redoBtn = spacePage?.querySelector("[data-sp-redo]");
  const compareBtn = spacePage?.querySelector("[data-sp-compare]");
  if (undoBtn) undoBtn.toggleAttribute("data-disabled", state.editHistoryIndex <= 0);
  if (redoBtn) redoBtn.toggleAttribute("data-disabled", state.editHistoryIndex >= state.editHistory.length - 1);
  if (compareBtn) compareBtn.toggleAttribute("data-disabled", state.editHistory.length <= 1);
}

/* =============================================================
   对比模式
   ============================================================= */
function toggleCompare() {
  state.compareMode = !state.compareMode;
  const compare = spacePage?.querySelector("#spCompare");
  const btn = spacePage?.querySelector("[data-sp-compare]");
  if (!compare || !btn) return;
  compare.classList.toggle("show", state.compareMode);
  btn.classList.toggle("active", state.compareMode);
  if (state.compareMode) {
    drawCompareLayers();
    setupCompareHandle();
  }
}

function drawCompareLayers() {
  const before = spacePage?.querySelector("#spCompareBefore");
  const after = spacePage?.querySelector("#spCompareAfter");
  if (!before || !after || !state.imageEl) return;
  before.innerHTML = "";
  after.innerHTML = "";
  // 优化前：原图
  const c1 = document.createElement("canvas");
  c1.width = state.imageEl.naturalWidth;
  c1.height = state.imageEl.naturalHeight;
  c1.getContext("2d").drawImage(state.imageEl, 0, 0);
  before.appendChild(c1);
  // 优化后：当前 canvas 截图
  const c2 = document.createElement("canvas");
  c2.width = state.imageEl.naturalWidth;
  c2.height = state.imageEl.naturalHeight;
  const ctx2 = c2.getContext("2d");
  ctx2.drawImage(state.imageEl, 0, 0);
  state.items.forEach((item) => {
    if (item.removed) {
      drawRemovedOverlay(ctx2, item);
    } else {
      drawItemBox(ctx2, item, false);
    }
  });
  after.appendChild(c2);
}

function setupCompareHandle() {
  const handle = spacePage?.querySelector("#spCompareHandle");
  const before = spacePage?.querySelector("#spCompareBefore");
  if (!handle || !before) return;
  let dragging = false;
  const update = (clientX) => {
    const stage = spacePage?.querySelector("#spStage");
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - 12) / (rect.width - 24)));
    handle.style.left = `calc(12px + ${ratio * 100}% - 17px)`;
    before.style.clipPath = `inset(0 ${100 - ratio * 100}% 0 0)`;
  };
  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (dragging) update(e.clientX);
  });
  handle.addEventListener("pointerup", () => (dragging = false));
}

/* =============================================================
   处理遮罩
   ============================================================= */
function showProcessing(title, hint) {
  state.processing = true;
  const p = spacePage?.querySelector("#spProcessing");
  const t = spacePage?.querySelector("#spProcTitle");
  const h = spacePage?.querySelector("#spProcHint");
  p?.classList.add("show");
  if (t) t.textContent = title;
  if (h) h.textContent = hint;
}

function hideProcessing() {
  state.processing = false;
  spacePage?.querySelector("#spProcessing")?.classList.remove("show");
}

/* =============================================================
   导出
   ============================================================= */
function exportImage(quality) {
  showToast("当前为演示模式，导出功能暂未开放");
}

/* =============================================================
   打开 / 关闭
   ============================================================= */
function openSpaceActivity() {
  if (!spaceLayer || !spacePage) return;
  state.step = 0;
  state.upload = null;
  state.imageEl = null;
  state.items = [];
  state.selectedIds = new Set();
  state.editHistory = [];
  state.editHistoryIndex = -1;
  state.products = [];
  state.compareMode = false;
  state.tab = "select";
  spaceLayer.classList.add("open");
  spaceLayer.setAttribute("aria-hidden", "false");
  renderSpace();
}

function closeSpaceActivity() {
  if (!spaceLayer || !spacePage) return;
  if (state.upload?.url) URL.revokeObjectURL(state.upload.url);
  state.upload = null;
  state.imageEl = null;
  state.items = [];
  state.products = [];
  spaceLayer.classList.remove("open");
  spaceLayer.setAttribute("aria-hidden", "true");
  spacePage.innerHTML = "";
}

shootSubmit?.addEventListener("click", () => {
  window.location.href = "./renewal.html?source=home";
});

/* =============================================================
   原有页面交互（tab 切换、data-me-click 提示等）
   ============================================================= */
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((item) => item.classList.toggle("active", item === button));
    const tab = button.getAttribute("data-me-tab") || "works";
    grid?.setAttribute("data-active-tab", tab);
    showToast(`已切换到「${button.textContent?.trim() || "内容"}」`);
  });
});

document.querySelectorAll("[data-me-click]").forEach((button) => {
  button.addEventListener("click", () => showToast(button.getAttribute("data-me-click") || "已点击"));
});

try {
  const submitIntent = sessionStorage.getItem("demo:openSubmitActivity");
  if (submitIntent) sessionStorage.removeItem("demo:openSubmitActivity");
} catch {
  // sessionStorage may be unavailable in very strict browser modes.
}
