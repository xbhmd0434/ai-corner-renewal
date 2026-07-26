import { escapeHtml, imageOrPlaceholder } from "./ui-utils.js";

const DEFAULT_COMPONENT_IMAGE =
  "./renewal/assets/starter-mushroom-lamp.png";

export class InspirationBar {
  constructor(element, { onOpenAssets }) {
    this.element = element;
    this.onOpenAssets = onOpenAssets;
  }

  render({
    videoContext,
    selectedInspiration,
    confirmedIntent,
    readonly = false
  }) {
    const source = selectedInspiration || videoContext;
    const isComponent =
      selectedInspiration?.referenceKind === "component" ||
      confirmedIntent?.intentType === "component";
    const isUnconfirmedItem =
      selectedInspiration?.type === "item" && !isComponent;
    const title =
      selectedInspiration?.name ||
      videoContext?.name ||
      videoContext?.caption ||
      "还没有选择要搬进来的内容";
    const preview =
      selectedInspiration?.accessUrl ||
      videoContext?.preview_url ||
      videoContext?.cover_url ||
      (selectedInspiration?.assetId === "item-demo-lamp"
        ? DEFAULT_COMPONENT_IMAGE
        : null);
    const visual = preview
      ? imageOrPlaceholder(preview, title)
      : imageOrPlaceholder(null, title);
    const sourceLabel = selectedInspiration?.sourceComponent
      ? "已确认的具体组件"
      : isUnconfirmedItem
        ? "旧版单品收藏"
      : videoContext
        ? "来自当前视频"
        : "等待选择";
    const explanation = isComponent
      ? "这是要放进空间里的具体物件。生成时会保留它的蘑菇造型、白色外观与暖光特征。"
      : isUnconfirmedItem
        ? "这件旧收藏没有保留组件裁剪图，不能作为生成锚点。请返回视频重新框选并确认一次。"
      : "这是 AI 提取设计语言的参考内容，不会被当作空间底图。";

    this.element.innerHTML = `
      <div class="section-shell source-section ${readonly ? "is-readonly" : ""}">
        <div class="section-heading">
          <div>
            <small>01 · SOURCE / 搬什么</small>
            <h3>要搬进来的内容</h3>
            <p class="section-explainer">这块决定 AI 必须带进新空间的组件或灵感。</p>
          </div>
          <button type="button" data-open-assets ${readonly ? "disabled" : ""}>换一个</button>
        </div>
        <div class="source-card source-card--component">
          <div class="source-card__visual">${visual}</div>
          <div class="source-card__copy">
            <span class="source-kicker">${escapeHtml(sourceLabel)}</span>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(explanation)}</p>
            <div class="source-tags">
              <span>${isComponent ? "具体组件" : isUnconfirmedItem ? "旧版收藏" : "风格参考"}</span>
              <span>${isComponent ? "不可替换" : isUnconfirmedItem ? "需要重新框选" : "提取设计语言"}</span>
            </div>
          </div>
        </div>
      </div>`;

    this.element
      .querySelector("[data-open-assets]")
      ?.addEventListener("click", () =>
        this.onOpenAssets?.(isComponent ? "item" : "inspiration")
      );
  }
}
