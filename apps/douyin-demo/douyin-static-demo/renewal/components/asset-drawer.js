import { escapeHtml, imageOrPlaceholder } from "./ui-utils.js";

export class AssetDrawer {
  constructor(element, { onSelect }) {
    this.element = element;
    this.onSelect = onSelect;
    this.activeTab = "inspiration";
  }

  render({ assets = [], preferredTab } = {}) {
    if (preferredTab) this.activeTab = preferredTab;
    const tabs = [
      ["inspiration", "灵感"],
      ["space", "空间"],
      ["item", "物品"]
    ];
    const current = assets.filter((asset) => asset.type === this.activeTab);
    this.element.innerHTML = `
      <nav class="drawer-tabs" aria-label="收藏分类">
        ${tabs.map(([key, label]) => `<button type="button" class="${key === this.activeTab ? "is-active" : ""}" data-tab="${key}">${label}</button>`).join("")}
      </nav>
      <div class="asset-list">
        ${
          current.length
            ? current.map((asset) => `<button class="asset-item" type="button" data-asset-id="${escapeHtml(asset.assetId)}">
                <span class="asset-item__visual">${imageOrPlaceholder(asset.accessUrl, asset.name)}</span>
                <span class="asset-item__copy"><strong>${escapeHtml(asset.name || "未命名收藏")}</strong><small>${asset.type === "space" ? (asset.spaceVersionState === "sealed" ? "空间已确认" : "空间待确认") : "点按加入本次焕新"}</small></span>
                <span>选择</span>
              </button>`).join("")
            : `<div class="drawer-empty">这里还没有收藏。<br />可以从视频暂停画面框选物品后保存。</div>`
        }
      </div>`;
    this.element.querySelectorAll("[data-tab]").forEach((button) =>
      button.addEventListener("click", () => {
        this.activeTab = button.dataset.tab;
        this.render({ assets });
      })
    );
    this.element.querySelectorAll("[data-asset-id]").forEach((button) =>
      button.addEventListener("click", () =>
        this.onSelect?.(
          assets.find((asset) => asset.assetId === button.dataset.assetId)
        )
      )
    );
  }
}
