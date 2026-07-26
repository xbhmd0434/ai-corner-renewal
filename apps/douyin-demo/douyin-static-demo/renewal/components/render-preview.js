import { escapeHtml, resolveImage } from "./ui-utils.js";

export class RenderPreview {
  constructor(element) {
    this.element = element;
  }

  render({
    planVersion = null,
    selectedSpace = null,
    selectedReference = null,
    confirmedIntent = null,
    coreState = "IDLE",
    canGenerate = false
  } = {}) {
    const afterSrc = planVersion ? resolveImage(planVersion.afterImage) : null;
    const beforeSrc = planVersion ? resolveImage(planVersion.beforeImage) : null;
    const spaceSrc = selectedSpace?.accessUrl || selectedSpace?.preview || null;
    const isComponentIntent =
      confirmedIntent?.intentType === "component" ||
      selectedReference?.referenceKind === "component";
    const componentLabel =
      selectedReference?.sourceComponent?.label ||
      confirmedIntent?.summary ||
      selectedReference?.name ||
      "圈选组件";
    const spaceLabel = selectedSpace?.name || "选中的空间";
    const componentSrc =
      selectedReference?.accessUrl ||
      (selectedReference?.assetId === "item-demo-lamp" && isComponentIntent
        ? "./renewal/assets/starter-mushroom-lamp.png"
        : null);
    const isBusy = ["GENERATING", "ADJUSTING"].includes(coreState);
    this.element.hidden = false;

    if (afterSrc || isBusy) {
      this.element.innerHTML = `
        <div class="section-shell render-preview__shell ${isBusy ? "is-loading" : ""}">
          <div class="section-heading">
            <div><small>RESULT · AI RENDER</small><h3>${afterSrc ? "搬进我家后的效果" : "正在搬进我家"}</h3></div>
            <span class="render-preview__badge">${isBusy ? "AI 生成中" : "已生成"}</span>
          </div>
          <div class="render-preview__image-wrap">
            ${afterSrc
              ? `<img src="${escapeHtml(afterSrc)}" alt="焕新结果预览" class="render-preview__image" />`
              : spaceSrc
                ? `<img src="${escapeHtml(spaceSrc)}" alt="原始空间" class="render-preview__image" />`
                : ""}
            ${
              afterSrc && beforeSrc
                ? `<div class="render-preview__before"><img src="${escapeHtml(beforeSrc)}" alt="焕新前" /><span>原空间</span></div>`
                : ""
            }
            ${
              isBusy
                ? `<div class="render-preview__overlay"><div class="render-preview__spinner"></div><span>AI 正在整理桌面并放入组件…</span></div>`
                : ""
            }
          </div>
          ${planVersion?.summary ? `<p class="render-preview__summary">${escapeHtml(planVersion.summary)}</p>` : ""}
        </div>`;
      return;
    }

    this.element.innerHTML = `
      <div class="section-shell move-plan ${canGenerate ? "is-ready" : ""}">
        <div class="section-heading">
          <div>
            <small>03 · AI ACTION / 怎么搬</small>
            <h3>AI 将执行这些动作</h3>
            <p class="section-explainer">这里是本次生成的边界说明，不是第三张输入图。</p>
          </div>
          <span class="render-preview__badge">${canGenerate ? "准备就绪" : "等待输入"}</span>
        </div>
        <div class="move-plan__equation">
          <figure>
            ${componentSrc ? `<img src="${escapeHtml(componentSrc)}" alt="要搬入的${escapeHtml(componentLabel)}" />` : "<span>?</span>"}
            <figcaption><b>A</b> ${escapeHtml(componentLabel)}</figcaption>
          </figure>
          <i aria-hidden="true">＋</i>
          <figure>
            ${spaceSrc ? `<img src="${escapeHtml(spaceSrc)}" alt="要改造的${escapeHtml(spaceLabel)}" />` : "<span>?</span>"}
            <figcaption><b>B</b> ${escapeHtml(spaceLabel)}</figcaption>
          </figure>
        </div>
        <ol class="move-plan__rules">
          <li><b>保留</b><span>双显示器、桌体、墙面与原机位</span></li>
          <li><b>整理</b><span>移除垃圾，归拢杂物与外露线缆</span></li>
          <li><b>${isComponentIntent ? "放入" : "参考"}</b><span>${
            isComponentIntent
              ? `只放入“${escapeHtml(componentLabel)}”，并把它作为视觉焦点`
              : `参考“${escapeHtml(componentLabel)}”的配色、材质与氛围`
          }</span></li>
        </ol>
      </div>`;
  }
}
