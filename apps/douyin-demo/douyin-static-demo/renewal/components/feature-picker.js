import { escapeHtml } from "./ui-utils.js";

const DEFAULT_STYLES = [
  { id: "natural", name: "自然绿意", tag: "清新", accent: "#7a9a6b" },
  { id: "warm", name: "温暖木质", tag: "治愈", accent: "#b08b5a" },
  { id: "minimal", name: "轻巧留白", tag: "简约", accent: "#c8c0b4" },
  { id: "vintage", name: "复古焦糖", tag: "怀旧", accent: "#a0673f" }
];

export class FeaturePicker {
  constructor(element, { onChange }) {
    this.element = element;
    this.onChange = onChange;
    this.selectedStyleId = "natural";
    this.expanded = false;
  }

  render({ selectedStyleId = null, readonly = false } = {}) {
    if (selectedStyleId) {
      this.selectedStyleId = selectedStyleId;
    }
    const styles = DEFAULT_STYLES;
    const canExpand = styles.length > 2;

    this.element.innerHTML = `
      <div class="section-shell feature-section ${readonly ? "is-readonly" : ""} ${this.expanded ? "is-expanded" : "is-collapsed"}">
        <div class="section-heading">
          <div><small>03 · FEATURE</small><h3>选一种你想要的感觉</h3></div>
        </div>
        <div class="feature-style-list-wrap">
          <div class="feature-style-list">
            ${styles
              .map(
                (style) => `
                <button type="button" class="feature-style-card ${
                  style.id === this.selectedStyleId ? "selected" : ""
                }" data-style-id="${style.id}" ${readonly ? "disabled" : ""}>
                  <span class="feature-style__swatch" style="background:${style.accent}"></span>
                  <span class="feature-style__copy">
                    <strong>${escapeHtml(style.name)}</strong>
                    <small>${escapeHtml(style.tag)}</small>
                  </span>
                  <span class="feature-style__check">${style.id === this.selectedStyleId ? "✓" : ""}</span>
                </button>
              `
              )
              .join("")}
          </div>
        </div>
        ${canExpand && !readonly ? `
          <button type="button" class="feature-expand-toggle" data-toggle-expand>
            <span>${this.expanded ? "收起风格" : "展开全部风格"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        ` : ""}
      </div>`;

    this.element
      .querySelectorAll("[data-style-id]")
      .forEach((card) =>
        card.addEventListener("click", () => {
          if (readonly) return;
          const styleId = card.dataset.styleId;
          this.selectedStyleId = styleId;
          this.render({ readonly });
          this.onChange?.(styleId);
        })
      );

    this.element
      .querySelector("[data-toggle-expand]")
      ?.addEventListener("click", () => {
        this.expanded = !this.expanded;
        this.render({ selectedStyleId: this.selectedStyleId, readonly });
      });
  }
}
