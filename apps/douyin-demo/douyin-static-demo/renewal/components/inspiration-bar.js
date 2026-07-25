import { escapeHtml, imageOrPlaceholder } from "./ui-utils.js";

export class InspirationBar {
  constructor(element, { onOpenAssets }) {
    this.element = element;
    this.onOpenAssets = onOpenAssets;
  }

  render({ videoContext, selectedInspiration, readonly = false }) {
    const source = selectedInspiration || videoContext;
    const title =
      selectedInspiration?.name ||
      videoContext?.name ||
      videoContext?.caption ||
      "把刚刚刷到的喜欢带进来";
    const note = selectedInspiration
      ? "来自我的收藏"
      : videoContext
        ? `来自 ${videoContext.author_display || "当前视频"}`
        : "可从视频选区或收藏中添加参考";
    const preview =
      selectedInspiration?.accessUrl ||
      videoContext?.preview_url ||
      videoContext?.cover_url;

    this.element.innerHTML = `
      <div class="section-shell ${readonly ? "is-readonly" : ""}">
        <div class="section-heading">
          <div><small>01 · INSPIRATION</small><h3>灵感从哪里来</h3></div>
          <button type="button" data-open-assets>${source ? "换一个" : "从收藏选"}</button>
        </div>
        ${
          source
            ? `<div class="source-card">
                <div class="source-card__visual">${imageOrPlaceholder(preview, title)}</div>
                <div class="source-card__copy">
                  <span class="source-kicker">${selectedInspiration ? "COLLECTED" : "FROM VIDEO"}</span>
                  <strong>${escapeHtml(title)}</strong>
                  <p>${escapeHtml(note)}</p>
                  <div class="source-tags"><span>风格参考</span><span>可替换</span></div>
                </div>
              </div>`
            : `<button class="empty-inspiration" type="button" data-open-assets>
                <span><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/></svg></span>
                <p><strong>添加一份灵感</strong><small>从收藏的画面或物品开始</small></p>
              </button>`
        }
      </div>`;
    this.element
      .querySelectorAll("[data-open-assets]")
      .forEach((button) =>
        button.addEventListener("click", () => this.onOpenAssets?.("inspiration"))
      );
  }
}
