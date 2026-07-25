/* =============================================================
   API Mock 层  ·  后端接入时替换为真实 fetch 即可
   ============================================================= */
const FusionAPI = {
  async extractItem(videoFrameDataUrl, maskDataUrl, boundingBox) {
    await delay(1200 + Math.random() * 800);
    return {
      success: true,
      itemImage: videoFrameDataUrl,
      itemMask: maskDataUrl,
      metadata: {
        label: await generateItemLabel(),
        type: await generateItemType(),
        style: await generateItemStyle(),
        color: await generateItemColor(),
        size: await generateItemSize()
      },
      confidence: 0.85 + Math.random() * 0.13,
      boundingBox
    };
  },

  async adaptLayout(spaceImage, itemImage, itemMetadata, position) {
    await delay(1800 + Math.random() * 1200);
    return {
      success: true,
      resultImage: spaceImage,
      previewImages: [
        { id: "default", name: "默认融合", image: spaceImage },
        { id: "lighting", name: "光影增强", image: spaceImage },
        { id: "perspective", name: "透视调整", image: spaceImage },
        { id: "harmony", name: "色彩和谐", image: spaceImage }
      ],
      recommendations: [
        { label: "位置微调", suggestion: "建议将物品移至画面右侧10%" },
        { label: "光照优化", suggestion: "检测到空间光源在左侧，已自动调整阴影方向" },
        { label: "比例适配", suggestion: "物品尺寸已根据空间比例自动调整" }
      ]
    };
  },

  async recommendProducts(itemMetadata) {
    await delay(800 + Math.random() * 600);
    const presets = {
      "灯具": ["北欧极简台灯", "复古黄铜落地灯", "智能护眼灯", "工业风吊灯"],
      "家具": ["实木书桌", "极简床头柜", "人体工学椅", "藤编收纳架"],
      "电子产品": ["机械键盘", "无线充电器", "护眼台灯", "显示器支架"],
      "装饰品": ["ins风花瓶", "几何雕塑", "复古挂画", "绿植盆栽"],
      "收纳": ["亚克力收纳盒", "抽屉分隔板", "悬挂收纳袋", "多层置物架"]
    };
    const products = presets[itemMetadata.type] || ["创意摆件", "家居装饰", "实用好物", "设计感单品"];
    return {
      success: true,
      items: products.map((name, i) => ({
        id: `product-${Date.now()}-${i}`,
        name,
        price: (99 + Math.random() * 900).toFixed(0),
        rating: 4.5 + Math.random() * 0.5,
        sales: Math.floor(1000 + Math.random() * 99000),
        image: `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(name + " product photo white background")}&image_size=square`
      }))
    };
  }
};

async function generateItemLabel() {
  const labels = ["台灯", "显示器", "花瓶", "收纳盒", "绿植", "椅子", "书架", "装饰画", "地毯", "摆件"];
  await delay(10);
  return labels[Math.floor(Math.random() * labels.length)];
}

async function generateItemType() {
  const types = ["灯具", "家具", "电子产品", "装饰品", "收纳"];
  await delay(10);
  return types[Math.floor(Math.random() * types.length)];
}

async function generateItemStyle() {
  const styles = ["北欧", "日式", "极简", "复古", "工业风", "ins风"];
  await delay(10);
  return styles[Math.floor(Math.random() * styles.length)];
}

async function generateItemColor() {
  const colors = ["白色", "黑色", "原木色", "灰色", "绿色", "粉色", "蓝色", "金色"];
  await delay(10);
  return colors[Math.floor(Math.random() * colors.length)];
}

async function generateItemSize() {
  const sizes = ["小", "中", "大"];
  await delay(10);
  return sizes[Math.floor(Math.random() * sizes.length)];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* =============================================================
   视频流物品融合功能  ·  VideoFusionController
   ============================================================= */
class VideoFusionController {
  constructor() {
    this.layer = document.getElementById("videoFusionLayer");
    this.page = document.getElementById("videoFusionPage");
    this.videoFrame = null;
    this.currentStep = 0;
    this.extractedItem = null;
    this.spaceImage = null;
    this.fusionResult = null;
    this.brushCanvas = null;
    this.brushCtx = null;
    this.isDrawing = false;
    this.brushSize = 15;
    this.maskPoints = [];
    this.init();
  }

  init() {
    this.setupEvents();
  }

  setupEvents() {
    document.addEventListener("click", (e) => {
      if (e.target.closest(".video-fusion-legacy-trigger")) {
        this.openVideoFusion(e.target.closest(".video-slide"));
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.layer.classList.contains("open")) {
        this.close();
      }
    });
  }

  async openVideoFusion(slide) {
    const video = slide.querySelector("video");
    if (!video) return;

    video.pause();
    this.videoFrame = await this.extractVideoFrame(video);

    this.layer.classList.add("open");
    this.layer.setAttribute("aria-hidden", "false");
    this.currentStep = 1;
    this.renderStep1();
  }

  extractVideoFrame(video) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    });
  }

  close() {
    this.layer.classList.remove("open");
    this.layer.setAttribute("aria-hidden", "true");
    this.page.innerHTML = "";
    this.currentStep = 0;
    this.extractedItem = null;
    this.spaceImage = null;
    this.fusionResult = null;
  }

  // ===== Step 1: 视频帧物品提取 =====
  renderStep1() {
    this.page.innerHTML = `
      <div class="video-fusion-top">
        <button class="video-fusion-top__back" type="button" aria-label="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div class="video-fusion-top__title">
          <strong>提取物品</strong>
          <small>用画笔圈出想要提取的区域</small>
        </div>
        <div class="video-fusion-top__tools">
          <button class="video-fusion-icon-btn active" data-tool="brush" type="button" aria-label="画笔">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button class="video-fusion-icon-btn" data-tool="eraser" type="button" aria-label="橡皮擦">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 20H7L3 16C2.5 15.5 2 14.8 2 14V6c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2c0 1.5-.8 2.8-2 3.5"/>
              <path d="M6 11l14-5"/>
            </svg>
          </button>
          <button class="video-fusion-icon-btn" data-tool="clear" type="button" aria-label="清除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
        <button class="video-fusion-close" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="video-fusion-step1">
        <div class="video-fusion-canvas-stage">
          <div class="video-fusion-canvas-wrap">
            <div class="video-fusion-canvas-inner">
              <img class="video-fusion-frame" src="${this.videoFrame}" alt="视频帧" />
              <canvas class="video-fusion-brush" id="brushCanvas"></canvas>
            </div>
          </div>

          <div class="video-fusion-paint-bar">
            <button class="video-fusion-paint-btn active" data-tool="brush" type="button" aria-label="画笔">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
            <button class="video-fusion-paint-btn" data-tool="eraser" type="button" aria-label="橡皮擦">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 20H7L3 16C2.5 15.5 2 14.8 2 14V6c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2c0 1.5-.8 2.8-2 3.5"/>
                <path d="M6 11l14-5"/>
              </svg>
            </button>
            <button class="video-fusion-paint-btn" data-tool="clear" type="button" aria-label="清除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </div>

          <div class="video-fusion-size-picker">
            <button class="video-fusion-size-btn ${this.brushSize === 10 ? 'active' : ''}" data-size="10" type="button">•</button>
            <button class="video-fusion-size-btn ${this.brushSize === 15 ? 'active' : ''}" data-size="15" type="button">••</button>
            <button class="video-fusion-size-btn ${this.brushSize === 25 ? 'active' : ''}" data-size="25" type="button">•••</button>
          </div>

          <div class="video-fusion-extracting" id="extractingOverlay">
            <div class="video-fusion-extracting__ring"></div>
            <strong>正在智能提取物品...</strong>
            <small>AI正在识别物品边缘</small>
          </div>
        </div>
      </div>

      <div class="video-fusion-action">
        <button class="video-fusion-primary" type="button" id="extractBtn" data-disabled="true">
          提取物品
          <span>完成圈画后点击提取</span>
        </button>
      </div>
    `;

    this.setupBrushCanvas();
    this.bindStep1Events();
  }

  setupBrushCanvas() {
    const frame = this.page.querySelector(".video-fusion-frame");
    const canvas = this.page.querySelector("#brushCanvas");

    const initCanvas = () => {
      const rect = frame.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // 使用CSS尺寸设置canvas内部分辨率，确保坐标匹配
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      this.brushCanvas = canvas;
      this.brushCtx = canvas.getContext("2d");
      this.brushCtx.scale(dpr, dpr); // 缩放上下文以匹配DPR
      this.brushCtx.strokeStyle = "#fe2c55";
      this.brushCtx.lineWidth = this.brushSize;
      this.brushCtx.lineCap = "round";
      this.brushCtx.lineJoin = "round";
      this.brushCtx.globalAlpha = 0.7;
      this.brushCtx.globalCompositeOperation = "source-over"; // 初始化为画笔模式
    };

    if (frame.complete && frame.naturalWidth > 0) {
      initCanvas();
    } else {
      frame.addEventListener("load", initCanvas, { once: true });
    }
  }

  bindStep1Events() {
    const canvas = this.brushCanvas;
    const ctx = this.brushCtx;
    const extractBtn = this.page.querySelector("#extractBtn");
    const extractingOverlay = this.page.querySelector("#extractingOverlay");
    const closeBtn = this.page.querySelector(".video-fusion-close");
    const backBtn = this.page.querySelector(".video-fusion-top__back");

    closeBtn.addEventListener("click", () => this.close());
    backBtn.addEventListener("click", () => this.close());

    this.page.querySelectorAll(".video-fusion-paint-btn, .video-fusion-icon-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.page.querySelectorAll(".video-fusion-paint-btn").forEach(b => b.classList.remove("active"));
        this.page.querySelectorAll(".video-fusion-icon-btn").forEach(b => b.classList.remove("active"));

        const tool = btn.dataset.tool;
        if (tool === "brush") {
          btn.classList.add("active");
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = "#fe2c55";
        } else if (tool === "eraser") {
          btn.classList.add("active");
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
        } else if (tool === "clear") {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          this.maskPoints = [];
          extractBtn.setAttribute("data-disabled", "true");
        }
      });
    });

    this.page.querySelectorAll(".video-fusion-size-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.page.querySelectorAll(".video-fusion-size-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.brushSize = Number(btn.dataset.size);
        ctx.lineWidth = this.brushSize;
      });
    });

    // 跟踪上一个点，避免重绘整个路径
    let lastPoint = null;

    const startDraw = (e) => {
      // 阻止浏览器默认行为（滚动、缩放等）
      if (e.cancelable) e.preventDefault();

      // 锁定指针到canvas，即使移出边界也能捕获事件
      canvas.setPointerCapture(e.pointerId);

      this.isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 不再硬编码复合模式，保留当前工具的设置
      ctx.beginPath();
      ctx.moveTo(x, y);
      lastPoint = { x, y };
      this.maskPoints.push({ x, y });

      // 画第一个点（小圆点），避免落笔时没有显示
      ctx.lineTo(x + 0.5, y + 0.5);
      ctx.stroke();

      // 在window上绑定move和up，确保即使离开canvas也能继续绘制
      window.addEventListener("pointermove", draw);
      window.addEventListener("pointerup", stopDraw);
      window.addEventListener("pointercancel", stopDraw);
    };

    const draw = (e) => {
      if (!this.isDrawing) return;

      // 阻止浏览器默认行为
      if (e.cancelable) e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 只画从lastPoint到当前点的线段，避免重绘整个路径
      if (lastPoint) {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      lastPoint = { x, y };
      this.maskPoints.push({ x, y });
      extractBtn.setAttribute("data-disabled", this.maskPoints.length < 10 ? "true" : "false");
    };

    const stopDraw = (e) => {
      // 释放指针捕获
      if (e && e.pointerId) {
        canvas.releasePointerCapture(e.pointerId);
      }

      this.isDrawing = false;
      lastPoint = null;
      ctx.closePath();

      // 移除window上的事件监听
      window.removeEventListener("pointermove", draw);
      window.removeEventListener("pointerup", stopDraw);
      window.removeEventListener("pointercancel", stopDraw);
    };

    // 使用Pointer Events统一处理鼠标、触摸、笔输入
    canvas.addEventListener("pointerdown", startDraw);

    extractBtn.addEventListener("click", () => this.handleExtract(extractingOverlay));
  }

  async handleExtract(overlay) {
    overlay.classList.add("show");

    try {
      const maskDataUrl = this.brushCanvas.toDataURL("image/png");
      const bounds = this.calculateBounds(this.maskPoints);

      const result = await FusionAPI.extractItem(
        this.videoFrame,
        maskDataUrl,
        bounds
      );

      this.extractedItem = result;
      this.renderStep2();
    } catch (error) {
      console.error("提取失败:", error);
      alert("物品提取失败，请重试");
    } finally {
      overlay.classList.remove("show");
    }
  }

  calculateBounds(points) {
    if (!points.length) return { x: 0, y: 0, width: 100, height: 100 };
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }

  // ===== Step 2: 物品预览 =====
  renderStep2() {
    const meta = this.extractedItem?.metadata || {};

    this.page.innerHTML = `
      <div class="video-fusion-top">
        <button class="video-fusion-top__back" type="button" aria-label="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div class="video-fusion-top__title">
          <strong>识别结果</strong>
          <small>置信度 ${(this.extractedItem?.confidence || 0).toFixed(2)}</small>
        </div>
        <div class="video-fusion-close" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </div>
      </div>

      <div class="video-fusion-step2">
        <div class="video-fusion-item-preview">
          <div class="video-fusion-item-card">
            <img src="${this.extractedItem?.itemImage || this.videoFrame}" alt="提取的物品" />
            <div class="video-fusion-item-card__meta">
              <strong>${meta.label || "未知物品"}</strong>
              <small>智能识别结果</small>
            </div>
            <div class="video-fusion-item-attrs">
              <span>${meta.type || ""}</span>
              <span>${meta.style || ""}</span>
              <span>${meta.color || ""}</span>
              <span>${meta.size || ""}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="video-fusion-item-actions">
        <button class="secondary" type="button">重新提取</button>
        <button class="primary" type="button" id="continueBtn">继续融合</button>
      </div>
    `;

    this.bindStep2Events();
  }

  bindStep2Events() {
    const backBtn = this.page.querySelector(".video-fusion-top__back");
    const closeBtn = this.page.querySelector(".video-fusion-close");
    const secondaryBtn = this.page.querySelector(".secondary");
    const primaryBtn = this.page.querySelector("#continueBtn");

    backBtn.addEventListener("click", () => this.renderStep1());
    closeBtn.addEventListener("click", () => this.close());
    secondaryBtn.addEventListener("click", () => this.renderStep1());
    primaryBtn.addEventListener("click", () => this.renderStep3());
  }

  // ===== Step 3: 空间图片选择 =====
  renderStep3() {
    this.page.innerHTML = `
      <div class="video-fusion-top">
        <button class="video-fusion-top__back" type="button" aria-label="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div class="video-fusion-top__title">
          <strong>选择空间</strong>
          <small>选择要融合的个人空间图片</small>
        </div>
        <div class="video-fusion-close" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </div>
      </div>

      <div class="video-fusion-step3">
        <div class="video-fusion-space-grid">
          <button type="button" data-space="desk">
            <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=minimalist%20desk%20space%20workstation%20with%20computer%20lamp%20plants%20clean%20modern&image_size=portrait_4_3" alt="书桌" />
          </button>
          <button type="button" data-space="balcony">
            <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=cozy%20balcony%20space%20with%20plants%20chair%20sunlight%20modern%20apartment&image_size=portrait_4_3" alt="阳台" />
          </button>
          <button type="button" data-space="living">
            <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20living%20room%20space%20with%20sofa%20coffee%20table%20plants%20natural%20light&image_size=portrait_4_3" alt="客厅" />
          </button>
          <button type="button" data-space="bedroom">
            <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=minimalist%20bedroom%20space%20with%20bed%20nightstand%20lamp%20clean%20modern&image_size=portrait_4_3" alt="卧室" />
          </button>
          <button type="button" data-space="kitchen">
            <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20kitchen%20space%20with%20countertop%20appliances%20clean%20bright&image_size=portrait_4_3" alt="厨房" />
          </button>
          <button type="button" id="uploadBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 15v-6"/>
              <path d="M19 12l-7 7-7-7"/>
            </svg>
          </button>
          <input type="file" accept="image/*" id="spaceInput" style="display:none" />
        </div>
      </div>

      <div class="video-fusion-action">
        <button class="video-fusion-primary" type="button" id="fusionBtn" data-disabled="true">
          开始融合
          <span>请先选择空间图片</span>
        </button>
      </div>
    `;

    this.bindStep3Events();
  }

  bindStep3Events() {
    const backBtn = this.page.querySelector(".video-fusion-top__back");
    const closeBtn = this.page.querySelector(".video-fusion-close");
    const fusionBtn = this.page.querySelector("#fusionBtn");
    const spaceButtons = this.page.querySelectorAll(".video-fusion-space-grid button:not(#uploadBtn)");
    const uploadBtn = this.page.querySelector("#uploadBtn");
    const spaceInput = this.page.querySelector("#spaceInput");

    backBtn.addEventListener("click", () => this.renderStep2());
    closeBtn.addEventListener("click", () => this.close());

    spaceButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        spaceButtons.forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.spaceImage = btn.querySelector("img").src;
        fusionBtn.setAttribute("data-disabled", "false");
      });
    });

    uploadBtn.addEventListener("click", () => spaceInput.click());

    spaceInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.spaceImage = event.target.result;
          spaceButtons.forEach(b => b.classList.remove("selected"));
          fusionBtn.setAttribute("data-disabled", "false");
        };
        reader.readAsDataURL(file);
      }
    });

    fusionBtn.addEventListener("click", () => this.handleFusion());
  }

  // ===== Step 4: AI融合与布局适配 =====
  async handleFusion() {
    const extractingOverlay = document.createElement("div");
    extractingOverlay.className = "video-fusion-extracting show";
    extractingOverlay.innerHTML = `
      <div class="video-fusion-extracting__ring"></div>
      <strong>AI正在智能融合...</strong>
      <small>正在进行光影匹配与透视调整</small>
    `;
    this.page.appendChild(extractingOverlay);

    try {
      const result = await FusionAPI.adaptLayout(
        this.spaceImage,
        this.extractedItem?.itemImage || this.videoFrame,
        this.extractedItem?.metadata || {},
        { x: 0.5, y: 0.5, scale: 1, rotation: 0 }
      );

      this.fusionResult = result;
      this.renderStep4();
    } catch (error) {
      console.error("融合失败:", error);
      alert("AI融合失败，请重试");
    } finally {
      extractingOverlay.remove();
    }
  }

  renderStep4() {
    const previews = this.fusionResult.previewImages;

    this.page.innerHTML = `
      <div class="video-fusion-top">
        <button class="video-fusion-top__back" type="button" aria-label="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div class="video-fusion-top__title">
          <strong>融合效果</strong>
          <small>AI智能布局适配完成</small>
        </div>
        <div class="video-fusion-close" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </div>
      </div>

      <div class="video-fusion-step4">
        <div class="video-fusion-fusion-stage">
          <div class="video-fusion-fusion-canvas-wrap">
            <img class="video-fusion-fusion-canvas" src="${previews[0].image}" alt="融合效果" />
          </div>

          <div class="video-fusion-ai-hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;display:inline">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            ${this.fusionResult.recommendations[0]?.label}
          </div>

          <div class="video-fusion-compare show">
            <div class="video-fusion-compare__after">
              <img src="${previews[0].image}" alt="融合后" />
            </div>
            <div class="video-fusion-compare__before">
              <img src="${this.spaceImage}" alt="原图" />
            </div>
            <div class="video-fusion-compare__handle"></div>
            <span class="video-fusion-compare__tag video-fusion-compare__tag--before">原图</span>
            <span class="video-fusion-compare__tag video-fusion-compare__tag--after">融合后</span>
          </div>
        </div>

        <div class="video-fusion-fusion-bar">
          ${this.fusionResult.recommendations.map((r, i) => `
            <button type="button" ${i === 0 ? 'class="active"' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
              ${r.label}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="video-fusion-action">
        <button class="video-fusion-primary" type="button" id="previewBtn">
          查看融合效果
          <span>多种融合方式预览</span>
        </button>
      </div>
    `;

    this.bindStep4Events();
    this.setupCompareSlider();
  }

  bindStep4Events() {
    const backBtn = this.page.querySelector(".video-fusion-top__back");
    const closeBtn = this.page.querySelector(".video-fusion-close");
    const previewBtn = this.page.querySelector("#previewBtn");

    backBtn.addEventListener("click", () => this.renderStep3());
    closeBtn.addEventListener("click", () => this.close());
    previewBtn.addEventListener("click", () => this.renderStep5());
  }

  setupCompareSlider() {
    const handle = this.page.querySelector(".video-fusion-compare__handle");
    const before = this.page.querySelector(".video-fusion-compare__before");
    const preview = this.page.querySelector(".video-fusion-compare");

    if (!handle || !before || !preview) return;

    const moveHandle = (x) => {
      const rect = preview.getBoundingClientRect();
      const percent = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
      handle.style.left = `${percent}%`;
      before.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    };

    preview.addEventListener("mousemove", (e) => moveHandle(e.clientX));
    preview.addEventListener("touchmove", (e) => moveHandle(e.touches[0].clientX));
  }

  // ===== Step 5: 融合效果预览 =====
  renderStep5() {
    const previews = this.fusionResult.previewImages;

    this.page.innerHTML = `
      <div class="video-fusion-top">
        <button class="video-fusion-top__back" type="button" aria-label="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div class="video-fusion-top__title">
          <strong>效果预览</strong>
          <small>选择最佳融合效果</small>
        </div>
        <div class="video-fusion-close" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </div>
      </div>

      <div class="video-fusion-step5">
        <div class="video-fusion-preview-grid">
          ${previews.map((p, i) => `
            <button class="video-fusion-preview-card ${i === 0 ? 'selected' : ''}" data-index="${i}" type="button">
              <img src="${p.image}" alt="${p.name}" />
              <span class="video-fusion-preview-card__label">${p.name}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="video-fusion-action">
        <button class="video-fusion-primary" type="button" id="recommendBtn">
          查看商品推荐
          <span>根据识别结果推荐</span>
        </button>
      </div>
    `;

    this.bindStep5Events();
  }

  bindStep5Events() {
    const backBtn = this.page.querySelector(".video-fusion-top__back");
    const closeBtn = this.page.querySelector(".video-fusion-close");
    const recommendBtn = this.page.querySelector("#recommendBtn");
    const previewCards = this.page.querySelectorAll(".video-fusion-preview-card");

    backBtn.addEventListener("click", () => this.renderStep4());
    closeBtn.addEventListener("click", () => this.close());

    previewCards.forEach(card => {
      card.addEventListener("click", () => {
        previewCards.forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
      });
    });

    recommendBtn.addEventListener("click", () => this.renderRecommendations());
  }

  // ===== Step 6: 商品推荐 =====
  async renderRecommendations() {
    const loading = document.createElement("div");
    loading.className = "video-fusion-extracting show";
    loading.innerHTML = `
      <div class="video-fusion-extracting__ring"></div>
      <strong>正在生成商品推荐...</strong>
      <small>根据物品特征匹配商品</small>
    `;
    this.page.appendChild(loading);

    try {
      const result = await FusionAPI.recommendProducts(this.extractedItem?.metadata || {});
      const meta = this.extractedItem?.metadata || {};

      this.page.innerHTML = `
        <div class="video-fusion-top">
          <button class="video-fusion-top__back" type="button" aria-label="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <div class="video-fusion-top__title">
            <strong>商品推荐</strong>
            <small>为你推荐相似商品</small>
          </div>
          <div class="video-fusion-close" type="button" aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </div>
        </div>

        <div class="video-fusion-step2">
          <div class="video-fusion-item-preview">
            <div class="video-fusion-item-card">
              <img src="${this.extractedItem?.itemImage || this.videoFrame}" alt="${meta.label}" />
              <div class="video-fusion-item-card__meta">
                <strong>${meta.label || "未知物品"}</strong>
                <small>识别到的物品</small>
              </div>
              <div class="video-fusion-item-attrs">
                <span>${meta.type || ""}</span>
                <span>${meta.style || ""}</span>
                <span>${meta.color || ""}</span>
              </div>
            </div>
          </div>

          <div style="padding: 0 14px; flex: 1; overflow-y: auto;">
            <div style="font-size: 13px; font-weight: 900; margin-bottom: 10px;">推荐商品</div>
            ${result.items.map(p => `
              <div style="display: flex; gap: 10px; padding: 10px; background: rgba(255,255,255,0.04); border-radius: 12px; margin-bottom: 10px;">
                <img src="${p.image}" alt="${p.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;" />
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                  <div style="font-size: 12px; font-weight: 700;">${p.name}</div>
                  <div style="font-size: 14px; font-weight: 900; color: #fe2c55; margin-top: 4px;">¥${p.price}</div>
                  <div style="font-size: 10px; color: rgba(245,245,247,0.56); margin-top: 2px;">
                    ⭐ ${p.rating} | ${(p.sales / 10000).toFixed(1)}w人付款
                  </div>
                </div>
                <button style="padding: 8px 16px; background: linear-gradient(90deg, #a78bfa, #fe2c55); color: white; border-radius: 8px; font-size: 12px; font-weight: 900; align-self: center;">
                  去购买
                </button>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="video-fusion-action">
          <button class="video-fusion-primary" type="button" id="saveBtn">
            保存融合图片
            <span>保存到相册</span>
          </button>
        </div>
      `;

      this.bindRecommendEvents();
    } catch (error) {
      console.error("推荐失败:", error);
      alert("商品推荐失败，请重试");
    } finally {
      loading.remove();
    }
  }

  bindRecommendEvents() {
    const backBtn = this.page.querySelector(".video-fusion-top__back");
    const closeBtn = this.page.querySelector(".video-fusion-close");
    const saveBtn = this.page.querySelector("#saveBtn");

    backBtn.addEventListener("click", () => this.renderStep5());
    closeBtn.addEventListener("click", () => this.close());

    saveBtn.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `fusion-${Date.now()}.png`;
      link.href = this.fusionResult.previewImages[0].image;
      link.click();
    });
  }
}

/* =============================================================
   原有视频流逻辑
   ============================================================= */
const feed = document.querySelector("#feed");
const videoTemplate = document.querySelector("#videoTemplate");
const SUBMIT_DB_NAME = "douyin-demo-submissions";
const SUBMIT_STORE_NAME = "videos";

const videos = [
  {
    id: "video-1",
    url: "./videos/video1.mp4",
    caption: "最爽风景配剧",
    author: "@白了少年头",
    tags: "#爽剧",
    likes: 4799,
    comments: 858,
    saves: 31
  },
  {
    id: "video-2",
    url: "./videos/video2.mp4",
    caption: "大学大变样",
    author: "@白了少年头",
    tags: "#桌面变身",
    likes: 5939,
    comments: 756,
    saves: 358
  },
  {
    id: "video-3",
    url: "./videos/video3.mp4",
    caption: "宿舍桌面设计小妙招",
    author: "@sjjs",
    tags: "#桌面变身",
    likes: 1641,
    comments: 299,
    saves: 151
  }
];

let activeVideo = null;
let activeSlide = null;
let currentIndex = 0;
let touchStartY = 0;
let wheelLocked = false;
let slideObserver = null;
let hasUserInteracted = false;
let fusionController = null;

function openSubmitDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(SUBMIT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUBMIT_STORE_NAME)) {
        db.createObjectStore(SUBMIT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getSubmittedVideoRecord(id) {
  if (!id) return null;
  const db = await openSubmitDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(SUBMIT_STORE_NAME, "readonly");
    const request = tx.objectStore(SUBMIT_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

async function loadSubmittedVideoFromProfile() {
  let submittedId = "";
  try {
    submittedId = sessionStorage.getItem("demo:openSubmittedVideo") || "";
    if (submittedId) sessionStorage.removeItem("demo:openSubmittedVideo");
  } catch {
    submittedId = "";
  }
  if (!submittedId) return;
  hasUserInteracted = true;

  try {
    const record = await getSubmittedVideoRecord(submittedId);
    if (!record?.blob) return;
    const existingIndex = videos.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) videos.splice(existingIndex, 1);
    videos.unshift({
      id: record.id,
      url: URL.createObjectURL(record.blob),
      caption: record.caption || "我心中的世界杯经典",
      author: record.author || "@我的投稿",
      tags: record.tags || "#我心中的世界杯经典",
      likes: 128,
      comments: 24,
      saves: 18
    });
  } catch {
    // Keep the static demo usable even if browser storage is unavailable.
  }
}

function formatCount(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function buildVideoEntryContext(item, video, goal) {
  return {
    provider: "douyin_static_demo",
    external_content_id: item.id,
    author_display: item.author,
    timestamp_ms: Math.max(0, Math.round(video.currentTime * 1000)),
    name: `${item.author} 的视频灵感`,
    caption: item.caption,
    goal
  };
}

function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 严格隐私模式下仍允许用户进入对应功能页。
  }
}

function openAiEntrySheet(item, video) {
  document.querySelector(".ai-entry-layer")?.remove();
  video.pause();

  const layer = document.createElement("section");
  layer.className = "ai-entry-layer";
  layer.setAttribute("aria-hidden", "false");
  layer.innerHTML = `
    <div class="ai-entry-sheet" role="dialog" aria-modal="true" aria-label="进入 AI 一角焕新">
      <div class="ai-entry-sheet__grip"></div>
      <header class="ai-entry-sheet__header">
        <div>
          <small>AI · FROM THIS VIDEO</small>
          <strong>把这份喜欢带进生活</strong>
        </div>
        <button type="button" data-ai-close aria-label="关闭">×</button>
      </header>
      <div class="ai-entry-sheet__source">
        <span class="ai-entry-sheet__thumb">▶</span>
        <div><strong data-ai-caption></strong><small data-ai-author></small></div>
      </div>
      <div class="ai-entry-sheet__choices">
        <button type="button" data-ai-entry="space">
          <span class="ai-entry-sheet__icon ai-entry-sheet__icon--space">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 20h18M5 20V9l7-5 7 5v11"/>
              <path d="M9 20v-6h6v6"/>
            </svg>
          </span>
          <span><b>放进我的空间</b><small>延续现有 AI 一角焕新</small></span>
          <i>›</i>
        </button>
      </div>
      <p class="ai-entry-sheet__note">当前视频入口只传递来源与时间点，不上传整段视频。</p>
    </div>
  `;

  layer.querySelector("[data-ai-caption]").textContent =
    item.caption || "当前视频";
  layer.querySelector("[data-ai-author]").textContent =
    `${item.author || "视频作者"} · ${Math.round(video.currentTime || 0)}s`;

  const close = () => layer.remove();
  layer.querySelector("[data-ai-close]").addEventListener("click", close);
  layer.addEventListener("click", (event) => {
    if (event.target === layer) close();
  });
  layer
    .querySelector('[data-ai-entry="space"]')
    .addEventListener("click", () => {
      writeSessionValue(
        "video-entry-context",
        buildVideoEntryContext(
          item,
          video,
          "把视频里的家居氛围适配到我的真实空间"
        )
      );
      window.location.href = "./renewal.html?source=video";
    });
  document.querySelector(".phone")?.append(layer);
}

function renderFeed() {
  feed.innerHTML = "";

  videos.forEach((item, index) => {
    const node = videoTemplate.content.firstElementChild.cloneNode(true);
    const video = node.querySelector("video");
    const playToggle = node.querySelector(".play-toggle");
    const likeButton = node.querySelector(".like-button");
    const counters = node.querySelectorAll(".stack-button small");

    node.dataset.index = String(index);
    node.dataset.videoId = item.id;
    node.dataset.author = item.author;
    node.dataset.caption = item.caption;
    node.querySelector(".author").textContent = item.author;
    node.querySelector(".caption").textContent = item.caption;
    node.querySelector(".tags").textContent = item.tags;
    counters[0].textContent = formatCount(item.likes);
    counters[1].textContent = formatCount(item.comments);
    counters[2].textContent = formatCount(item.saves);

    video.src = item.url;
    video.muted = false;
    video.volume = 1;
    video.addEventListener("error", () => {
      node.classList.add("paused");
      node.style.background = "linear-gradient(145deg, #1c1d22, #111114 52%, #25151a)";
      node.querySelector(".caption").textContent = `未找到 ${item.url}，请保持 videos 文件夹和 index.html 在一起`;
    });

    node.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      hasUserInteracted = true;
      toggleVideo(video, node);
    });

    playToggle.addEventListener("click", () => {
      hasUserInteracted = true;
      toggleVideo(video, node);
    });

    likeButton.addEventListener("click", () => {
      item.likes += likeButton.classList.contains("liked") ? -1 : 1;
      likeButton.classList.toggle("liked");
      counters[0].textContent = formatCount(item.likes);
    });

    // 单一 AI 入口把视频来源与时间点交给正式焕新流程。
    const actionRail = node.querySelector(".action-rail");
    if (actionRail) {
      const fusionBtn = document.createElement("button");
      fusionBtn.className = "video-fusion-trigger";
      fusionBtn.type = "button";
      fusionBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3l1.45 4.55L18 9l-4.55 1.45L12 15l-1.45-4.55L6 9l4.55-1.45L12 3z"/>
          <path d="M18.5 14l.75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75L18.5 14z"/>
        </svg>
        <small>AI</small>
      `;
      fusionBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openAiEntrySheet(item, video);
      });
      actionRail.insertBefore(fusionBtn, actionRail.firstChild);
    }

    feed.append(node);
  });

  observeVideos();
}

function toggleVideo(video, slide) {
  if (video.paused) {
    slide.classList.remove("user-paused");
    playWithSound(video, slide);
  } else {
    video.pause();
    slide.classList.add("paused", "user-paused");
  }
}

function playWithSound(video, slide) {
  slide.classList.remove("user-paused");
  video.muted = false;
  video.volume = 1;
  video.play()
    .then(() => slide.classList.remove("paused"))
    .catch(() => {
      video.muted = true;
      video.play()
        .then(() => slide.classList.remove("paused"))
        .catch(() => slide.classList.add("paused"));
    });
}

function observeVideos() {
  if (slideObserver) slideObserver.disconnect();
  slideObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector("video");
        if (!video) return;

        if (entry.isIntersecting) {
          currentIndex = Number(entry.target.dataset.index || 0);
          if (activeVideo && activeVideo !== video) activeVideo.pause();
          activeVideo = video;
          activeSlide = entry.target;
          if (hasUserInteracted) playWithSound(video, entry.target);
          else entry.target.classList.add("paused");
        } else {
          video.pause();
        }
      });
    },
    { threshold: 0.72 }
  );

  document.querySelectorAll(".video-slide").forEach((slide) => slideObserver.observe(slide));
}

function scrollToVideo(index, behavior = "smooth") {
  currentIndex = Math.max(0, Math.min(index, videos.length - 1));
  feed.scrollTo({
    top: currentIndex * feed.clientHeight,
    behavior
  });
}

function goNext() {
  scrollToVideo(currentIndex + 1);
}

function goPrevious() {
  scrollToVideo(currentIndex - 1);
}

feed.addEventListener("touchstart", (event) => {
  touchStartY = event.changedTouches[0].clientY;
}, { passive: true });

feed.addEventListener("touchend", (event) => {
  const deltaY = touchStartY - event.changedTouches[0].clientY;
  if (Math.abs(deltaY) < 36) return;
  if (deltaY > 0) goNext();
  else goPrevious();
}, { passive: true });

feed.addEventListener("wheel", (event) => {
  if (wheelLocked || Math.abs(event.deltaY) < 18) return;
  wheelLocked = true;
  if (event.deltaY > 0) goNext();
  else goPrevious();
  setTimeout(() => {
    wheelLocked = false;
  }, 520);
}, { passive: true });

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") goNext();
  if (event.key === "ArrowUp") goPrevious();
});

async function initDemo() {
  await loadSubmittedVideoFromProfile();
  renderFeed();

  // 初始化物品融合控制器
  fusionController = new VideoFusionController();

  // 底部“+”进入已经接通后端的焕新工作台。
  const feedShootButton = document.querySelector("#feedShootButton");
  if (feedShootButton) {
    feedShootButton.addEventListener("click", () => {
      window.location.href = "./renewal.html?source=home";
    });
  }
}

initDemo();
