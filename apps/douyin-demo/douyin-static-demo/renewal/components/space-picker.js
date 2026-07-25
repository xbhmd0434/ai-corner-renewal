import { escapeHtml, imageOrPlaceholder } from "./ui-utils.js";

export class SpacePicker {
  constructor(element, { onSelect, onUpload, onConfirm }) {
    this.element = element;
    this.onSelect = onSelect;
    this.onUpload = onUpload;
    this.onConfirm = onConfirm;
  }

  render({ spaces = [], selectedSpace, readonly = false }) {
    const visible = spaces.slice(0, 3);
    this.element.innerHTML = `
      <div class="section-shell ${readonly ? "is-readonly" : ""}">
        <div class="section-heading">
          <div><small>02 · MY SPACE</small><h3>选择要焕新的角落</h3></div>
        </div>
        <div class="space-list">
          ${visible
            .map(
              (space) => `<button class="space-option ${
                selectedSpace?.assetId === space.assetId ? "is-selected" : ""
              }" type="button" data-space-id="${escapeHtml(space.assetId)}" ${readonly ? "disabled" : ""}>
                <span class="space-option__visual">${imageOrPlaceholder(space.accessUrl, space.name)}</span>
                <span class="space-option__copy"><strong>${escapeHtml(space.name || "我的空间")}</strong><small>${
                  space.spaceVersionState === "sealed" ? "已确认，可直接使用" : "待确认空间识别"
                }</small></span>
                <i class="space-option__radio"></i>
              </button>`
            )
            .join("")}
          <button class="space-action" type="button" data-upload ${readonly ? "disabled" : ""}>
            <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5"/></svg>
            <span><strong>上传我的空间</strong><small>JPEG / PNG / WebP</small></span>
          </button>
        </div>
        ${
          selectedSpace && selectedSpace.spaceVersionState !== "sealed"
            ? `<div class="parse-confirm"><p><strong>空间识别已完成</strong><br />确认可编辑区域后，才会进入方案生成。</p><button type="button" data-confirm>确认空间</button></div>`
            : ""
        }
      </div>`;
    this.element.querySelectorAll("[data-space-id]").forEach((button) =>
      button.addEventListener("click", () => this.onSelect?.(button.dataset.spaceId))
    );
    this.element
      .querySelector("[data-upload]")
      ?.addEventListener("click", () => this.onUpload?.());
    this.element
      .querySelector("[data-confirm]")
      ?.addEventListener("click", () => this.onConfirm?.());
  }
}
