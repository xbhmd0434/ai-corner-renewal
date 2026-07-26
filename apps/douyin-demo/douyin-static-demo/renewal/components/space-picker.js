import { escapeHtml, imageOrPlaceholder } from "./ui-utils.js";

export class SpacePicker {
  constructor(element, { onSelect, onUpload, onCamera, onConfirm }) {
    this.element = element;
    this.onSelect = onSelect;
    this.onUpload = onUpload;
    this.onCamera = onCamera;
    this.onConfirm = onConfirm;
    this.expanded = false;
  }

  render({ spaces = [], selectedSpace, readonly = false }) {
    const alternatives = spaces
      .filter((space) => space.assetId !== selectedSpace?.assetId)
      .slice(0, 3);
    const canExpand = alternatives.length > 0;
    const selectedVisual = selectedSpace
      ? imageOrPlaceholder(selectedSpace.accessUrl, selectedSpace.name)
      : imageOrPlaceholder(null, "等待选择空间");

    this.element.innerHTML = `
      <div class="section-shell space-section ${readonly ? "is-readonly" : ""} ${this.expanded ? "is-expanded" : "is-collapsed"}">
        <div class="section-heading">
          <div>
            <small>02 · DESTINATION / 搬到哪里</small>
            <h3>要被改造的真实空间</h3>
            <p class="section-explainer">这块是生成底图。AI 会保持机位、墙面、桌体和主要设备不变。</p>
          </div>
          ${
            canExpand && !readonly
              ? `<button type="button" data-toggle-expand>${this.expanded ? "收起" : "换空间"}</button>`
              : ""
          }
        </div>
        <div class="space-hero ${selectedSpace ? "is-ready" : ""}">
          <div class="space-hero__visual">${selectedVisual}</div>
          <div class="space-hero__meta">
            <span>空间底图 · BEFORE</span>
            <strong>${escapeHtml(selectedSpace?.name || "请选择一个空间")}</strong>
            <p>保留双屏与原木桌体；桌面杂物、线缆和可移动小物允许整理。</p>
            <em>${selectedSpace?.spaceVersionState === "sealed" ? "已确认，可用于生成" : "需要先完成空间确认"}</em>
          </div>
        </div>
        ${
          this.expanded
            ? `<div class="space-list">
                ${alternatives
                  .map(
                    (space) => `<button class="space-option" type="button" data-space-id="${escapeHtml(space.assetId)}" ${readonly ? "disabled" : ""}>
                      <span class="space-option__visual">${imageOrPlaceholder(space.accessUrl, space.name)}</span>
                      <span class="space-option__copy">
                        <strong>${escapeHtml(space.name || "我的空间")}</strong>
                        <small>${space.spaceVersionState === "sealed" ? "已确认，可直接使用" : "待确认空间识别"}</small>
                      </span>
                      <i class="space-option__radio"></i>
                    </button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          !readonly
            ? `<div class="space-upload-actions">
                <button class="space-upload-btn" type="button" data-camera>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13.5" r="4"/></svg>
                  <span><strong>拍一张我的空间</strong><small>使用相机</small></span>
                </button>
                <button class="space-upload-btn" type="button" data-album>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 3-2 4 4"/></svg>
                  <span><strong>上传我的空间</strong><small>从相册选择</small></span>
                </button>
              </div>`
            : ""
        }
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
      .querySelector("[data-album]")
      ?.addEventListener("click", () => this.onUpload?.());
    this.element
      .querySelector("[data-camera]")
      ?.addEventListener("click", () => this.onCamera?.());
    this.element
      .querySelector("[data-confirm]")
      ?.addEventListener("click", () => this.onConfirm?.());
    this.element
      .querySelector("[data-toggle-expand]")
      ?.addEventListener("click", () => {
        this.expanded = !this.expanded;
        this.render({ spaces, selectedSpace, readonly });
      });
  }
}
