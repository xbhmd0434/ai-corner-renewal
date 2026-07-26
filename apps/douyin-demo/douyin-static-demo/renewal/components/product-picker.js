import { escapeHtml } from "./ui-utils.js";

const DEFAULT_PRODUCTS = [
  { id: "desk", name: "书桌", category: "家具", checked: true },
  { id: "chair", name: "椅子", category: "家具", checked: true },
  { id: "lamp", name: "台灯", category: "灯具", checked: false },
  { id: "bookshelf", name: "书架", category: "家具", checked: false },
  { id: "plant", name: "绿植", category: "装饰", checked: false },
  { id: "rug", name: "地毯", category: "装饰", checked: false }
];

export class ProductPicker {
  constructor(element, { onChange }) {
    this.element = element;
    this.onChange = onChange;
    this.expanded = false;
  }

  render({ selectedProductIds = [], readonly = false } = {}) {
    const products = DEFAULT_PRODUCTS.map((p) => ({
      ...p,
      checked: selectedProductIds.length ? selectedProductIds.includes(p.id) : p.checked
    }));
    const canExpand = products.length > 2;

    this.element.innerHTML = `
      <div class="section-shell product-section ${readonly ? "is-readonly" : ""} ${this.expanded ? "is-expanded" : "is-collapsed"}">
        <div class="section-heading">
          <div><small>02 · PRODUCT</small><h3>勾选图中哪些商品</h3></div>
          <button type="button" data-select-all ${readonly ? "disabled" : ""}>一键全选加入购物车</button>
        </div>
        <div class="product-list-wrap">
          <div class="product-list">
            ${products
              .map(
                (p) => `<label class="product-item">
                <span class="product-item__check">
                  <input type="checkbox" data-product-id="${p.id}" ${p.checked ? "checked" : ""} ${readonly ? "disabled" : ""} />
                  <i></i>
                </span>
                <span class="product-item__copy">
                  <strong>${escapeHtml(p.name)}</strong>
                  <small>${escapeHtml(p.category)}</small>
                </span>
              </label>`
              )
              .join("")}
          </div>
        </div>
        ${canExpand && !readonly ? `
          <button type="button" class="product-expand-toggle" data-toggle-expand>
            <span>${this.expanded ? "收起商品" : "展开全部商品"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        ` : ""}
      </div>`;

    const emitChange = () => {
      const selectedIds = Array.from(
        this.element.querySelectorAll("input[type=checkbox]:checked")
      ).map((cb) => cb.dataset.productId);
      this.onChange?.(selectedIds);
    };

    this.element
      .querySelectorAll("input[type=checkbox]")
      .forEach((input) =>
        input.addEventListener("change", emitChange)
      );

    this.element
      .querySelector("[data-select-all]")
      ?.addEventListener("click", () => {
        this.element
          .querySelectorAll("input[type=checkbox]")
          .forEach((cb) => {
            cb.checked = true;
          });
        emitChange();
      });

    this.element
      .querySelector("[data-toggle-expand]")
      ?.addEventListener("click", () => {
        this.expanded = !this.expanded;
        this.render({ selectedProductIds, readonly });
      });
  }
}
