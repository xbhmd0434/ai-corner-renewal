import { escapeHtml, formatMoney, resolveImage } from "./ui-utils.js";
import { renderProductHotspots, ShopTheLook } from "./shop-the-look.js";

export class ResultSection {
  constructor(element, actions) {
    this.element = element;
    this.actions = actions;
    this.shopTheLook = new ShopTheLook(actions);
  }

  render(viewModel, productDiscoveryViewModel = null) {
    if (!viewModel) {
      this.element.innerHTML = '<div class="inline-error">方案数据为空</div>';
      return;
    }
    const before = resolveImage(viewModel.beforeImage);
    const after = resolveImage(viewModel.afterImage);
    const checks = viewModel.validation?.checks || [];
    this.element.innerHTML = `
      <article class="result-card">
        <header class="result-header">
          <div><span class="result-kicker">YOUR CORNER · V${escapeHtml(viewModel.version)}</span><h3>${escapeHtml(viewModel.title || "这一角，焕新完成")}</h3></div>
          <span class="result-source">${escapeHtml(viewModel.sourceBadge || "AI 方案")}</span>
        </header>
        ${
          before || after
            ? `<div class="compare-stage">
                ${before ? `<img src="${escapeHtml(before)}" alt="焕新前" />` : ""}
                ${after ? `<div class="compare-stage__after" style="width:55%"><img src="${escapeHtml(after)}" alt="AI 焕新示意" />${renderProductHotspots(productDiscoveryViewModel)}</div>` : ""}
                <span class="compare-label compare-label--before">BEFORE</span><span class="compare-label compare-label--after">AFTER</span>
                ${before && after ? `<input type="range" min="0" max="100" value="55" aria-label="拖动查看焕新前后" data-compare /><i class="compare-handle" style="left:55%"><svg viewBox="0 0 20 20"><path d="m7 6-3 4 3 4m6-8 3 4-3 4"/></svg></i>` : ""}
              </div>`
            : '<div class="compare-stage"><div class="compare-placeholder">效果图正在归档，执行清单已经准备好。</div></div>'
        }
        <div class="result-body">
          <div class="result-summary"><span>预计商品合计</span><strong>${formatMoney(viewModel.totalPriceCny)}</strong><p>${escapeHtml(viewModel.summary || "基于你的空间、预算与生活限制生成。")}</p></div>
          <div class="result-facts"><span>${viewModel.products?.length || 0} 件商品</span><span>${viewModel.steps?.length || 0} 个步骤</span><span>${viewModel.appliedConstraints?.noDrilling ? "免打孔" : "按需安装"}</span></div>
          <div data-shop-root>${this.shopTheLook.render(productDiscoveryViewModel)}</div>
          <div class="result-actions">
            <button class="primary-action" type="button" data-action="details">查看落地清单</button>
            <button class="secondary-action" type="button" data-action="budget">再省一点</button>
            <button class="secondary-action" type="button" data-action="style">换种感觉</button>
            <a class="outline-action" href="#" data-action="tryon">在空间里试摆</a>
          </div>
          <div class="result-details" hidden>
            ${this.renderProducts(viewModel.products)}
            ${this.renderSteps(viewModel.steps)}
            ${this.renderChecks(checks)}
          </div>
          ${this.renderAlternatives(viewModel.alternatives)}
          ${viewModel.renderDisclaimer ? `<p class="action-help">${escapeHtml(viewModel.renderDisclaimer)}</p>` : ""}
        </div>
      </article>`;
    const compare = this.element.querySelector("[data-compare]");
    compare?.addEventListener("input", () => {
      const value = `${compare.value}%`;
      this.element.querySelector(".compare-stage__after").style.width = value;
      this.element.querySelector(".compare-handle").style.left = value;
    });
    this.element.querySelector('[data-action="details"]')?.addEventListener("click", (event) => {
      const details = this.element.querySelector(".result-details");
      details.hidden = !details.hidden;
      event.currentTarget.textContent = details.hidden ? "查看落地清单" : "收起落地清单";
    });
    this.element.querySelector('[data-action="budget"]')?.addEventListener("click", () => this.actions.onBudget?.(viewModel));
    this.element.querySelector('[data-action="style"]')?.addEventListener("click", () => this.actions.onStyle?.(viewModel));
    this.element.querySelector('[data-action="tryon"]')?.addEventListener("click", (event) => {
      event.preventDefault();
      this.actions.onTryOn?.(viewModel);
    });
    this.shopTheLook.bind(this.element.querySelector("[data-shop-root]"), productDiscoveryViewModel);
    this.shopTheLook.bindHotspots(this.element);
  }

  renderProducts(products = []) {
    if (!products.length) return "";
    return `<section class="detail-group"><h4>商品清单</h4>${products.slice(0, 8).map((item) => `<div class="product-row"><span>物</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.reason || item.dimensionsLabel || "适配本次空间")}</small></div><b>${formatMoney(item.priceCny)}</b></div>`).join("")}</section>`;
  }

  renderSteps(steps = []) {
    if (!steps.length) return "";
    return `<section class="detail-group"><h4>执行步骤</h4>${steps.map((step, index) => `<div class="step-row"><span>${index + 1}</span><div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.description)}</small></div></div>`).join("")}</section>`;
  }

  renderChecks(checks = []) {
    if (!checks.length) return "";
    return `<section class="detail-group"><h4>可信校验</h4>${checks.slice(0, 8).map((check) => `<div class="validation-row"><span>${check.status === "pass" ? "✓" : "!"}</span><div><p>${escapeHtml(check.message || check.code)}</p></div></div>`).join("")}</section>`;
  }

  renderAlternatives(alternatives = []) {
    if (!alternatives.length) return "";
    return `<div class="alternatives"><button class="text-button" type="button" data-alternatives>还有 ${alternatives.length} 个备选方向</button><div class="alternative-list">${alternatives.map((item) => `<div class="alternative-item"><strong>${escapeHtml(item.title || "备选方案")}</strong><span>${formatMoney(item.totalPriceCny)}</span></div>`).join("")}</div></div>`;
  }
}
