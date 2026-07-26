import { escapeHtml, formatMoney } from "./ui-utils.js";

export class HistoryDrawer {
  constructor(element, { onSelect }) {
    this.element = element;
    this.onSelect = onSelect;
  }

  render({ plans = [], loading = false, error = "" } = {}) {
    if (loading) {
      this.element.innerHTML = '<div class="drawer-empty">正在读取历史方案…</div>';
      return;
    }
    if (error) {
      this.element.innerHTML = `<div class="inline-error">${escapeHtml(error)}</div>`;
      return;
    }
    this.element.innerHTML = `
      <div class="history-list">
        ${
          plans.length
            ? plans.map((plan) => `<button class="history-item" type="button" data-plan-id="${escapeHtml(plan.plan_asset_id)}" data-version-id="${escapeHtml(plan.current_plan_version_id || "")}">
                <span class="history-item__version">v${escapeHtml(plan.current_version?.version || 1)}</span>
                <span class="history-item__copy"><strong>${escapeHtml(plan.current_version?.title || "一角焕新方案")}</strong><small>${escapeHtml(plan.space_name || "我的空间")} · ${formatMoney(plan.current_version?.total_price_cny)}</small></span>
                <span>查看</span>
              </button>`).join("")
            : '<div class="drawer-empty">还没有历史方案。<br />完成一次生成后会自动出现在这里。</div>'
        }
      </div>`;
    this.element.querySelectorAll("[data-plan-id]").forEach((button) =>
      button.addEventListener("click", () =>
        this.onSelect?.(button.dataset.planId, button.dataset.versionId)
      )
    );
  }
}
