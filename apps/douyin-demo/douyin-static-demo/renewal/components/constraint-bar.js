import { escapeHtml, formatMoney } from "./ui-utils.js";

export class ConstraintBar {
  constructor(element, { onChange }) {
    this.element = element;
    this.onChange = onChange;
  }

  render({ constraints, readonly = false }) {
    if (readonly) {
      this.element.innerHTML = `
        <div class="core-summary">
          <div><small>预算上限</small><strong>${formatMoney(constraints.budget_cny)}</strong></div>
          <span>${constraints.no_drilling ? "免打孔" : "可打孔"}</span>
          <span>${constraints.pet_context !== "none" ? "有宠家庭" : "无宠物"}</span>
          <span>${constraints.rental ? "租房友好" : "长期居住"}</span>
        </div>`;
      return;
    }

    this.element.innerHTML = `
      <div class="section-shell">
        <div class="section-heading"><div><small>03 · BOUNDARIES</small><h3>说清楚生活的边界</h3></div></div>
        <label class="budget-control">
          <span>预算上限</span>
          <input type="range" min="200" max="1000" step="50" value="${Number(constraints.budget_cny || 500)}" data-key="budget_cny" />
          <output>${formatMoney(constraints.budget_cny)}</output>
        </label>
        <div class="constraint-toggles">
          ${[
            ["no_drilling", "免打孔", constraints.no_drilling],
            ["pet", "有宠物", constraints.pet_context !== "none"],
            ["rental", "租房友好", constraints.rental]
          ]
            .map(
              ([key, label, checked]) => `<label class="constraint-toggle"><span>${label}</span><input type="checkbox" data-key="${key}" ${checked ? "checked" : ""} /><i></i></label>`
            )
            .join("")}
        </div>
        <label class="constraint-note"><span>还有什么想保留？</span><input type="text" maxlength="120" data-key="user_note" value="${escapeHtml(constraints.user_note || "")}" placeholder="例如：保留桌面，想要更暖的灯光" /></label>
      </div>`;

    const emit = () => {
      const budget = Number(this.element.querySelector('[data-key="budget_cny"]').value);
      const noDrilling = this.element.querySelector('[data-key="no_drilling"]').checked;
      const pet = this.element.querySelector('[data-key="pet"]').checked;
      const rental = this.element.querySelector('[data-key="rental"]').checked;
      const userNote = this.element.querySelector('[data-key="user_note"]').value.trim();
      this.onChange?.({
        ...constraints,
        budget_cny: budget,
        no_drilling: noDrilling || rental,
        pet_context: pet ? "other" : "none",
        rental,
        user_note: userNote
      });
    };
    const range = this.element.querySelector('[data-key="budget_cny"]');
    range.addEventListener("input", () => {
      this.element.querySelector("output").textContent = formatMoney(range.value);
      emit();
    });
    this.element
      .querySelectorAll("input:not([type=range])")
      .forEach((input) => input.addEventListener("change", emit));
  }
}
