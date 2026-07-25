import { escapeHtml } from "./ui-utils.js";

function progressMarkup(viewModel) {
  const progress = Math.max(0, Math.min(100, Number(viewModel.progress) || 0));
  return `
    <div class="shop-progress" role="status" aria-live="polite">
      <span class="shop-progress__index">${String(Math.max(1, Math.ceil(progress / 17))).padStart(2, "0")} / 06</span>
      <div>
        <strong>${escapeHtml(viewModel.description)}</strong>
        <div class="shop-progress__track" aria-hidden="true"><i style="width:${progress}%"></i></div>
      </div>
      <b>${progress}%</b>
    </div>`;
}

function emptyState(viewModel) {
  const states = {
    unavailable: {
      code: "SERVICE / OFFLINE",
      title: "商品发现服务尚未开放",
      action: '<button class="shop-secondary" type="button" data-shop-offline>使用本地离线 Demo</button>'
    },
    empty: {
      code: "NO RELIABLE MATCH",
      title: "暂未找到可靠好物",
      action: '<button class="shop-secondary" type="button" data-shop-retry data-reason="refresh">调整效果图后重试</button>'
    },
    failed: {
      code: "DISCOVERY INTERRUPTED",
      title: "这次商品发现没有完成",
      action: viewModel.canRetry
        ? '<button class="shop-secondary" type="button" data-shop-retry data-reason="retry">重新识别</button>'
        : ""
    },
    cancelled: {
      code: "DISCOVERY CANCELLED",
      title: "已取消本次商品发现",
      action: '<button class="shop-secondary" type="button" data-shop-retry data-reason="retry">重新开始</button>'
    },
    not_started: {
      code: "SHOP THE RESULT",
      title: "准备整理可落地的好物",
      action: ""
    }
  };
  const item = states[viewModel.status] || states.not_started;
  return `
    <div class="shop-empty shop-empty--${escapeHtml(viewModel.status)}">
      <span>${item.code}</span>
      <h5>${escapeHtml(item.title)}</h5>
      <p>${escapeHtml(viewModel.errorMessage || viewModel.description)}</p>
      ${item.action}
      ${viewModel.status === "unavailable" ? '<small>需要你主动进入；接口 404 或失败不会自动切换 Demo。</small>' : ""}
    </div>`;
}

function matchMarkup(match, subject, deliveryMode) {
  const reasons = match.reasons?.length
    ? `<ul>${match.reasons.slice(0, 3).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
    : '<p class="shop-match__reason">由商品目录返回，暂无更多匹配说明。</p>';
  const isDemo = deliveryMode === "offline_fixture" || match.sourceType === "demo_catalog";
  return `
    <article class="shop-match" data-match-id="${escapeHtml(match.id)}">
      <div class="shop-match__visual" aria-hidden="true">
        ${match.coverUrl ? `<img src="${escapeHtml(match.coverUrl)}" alt="" />` : `<span>${escapeHtml(subject.label.slice(0, 1))}</span>`}
      </div>
      <div class="shop-match__body">
        <span class="shop-match__type">${escapeHtml(match.matchLabel)}</span>
        <h6>${escapeHtml(match.title)}</h6>
        ${reasons}
        <div class="shop-match__footer">
          <strong>${escapeHtml(match.priceLabel || "价格暂未提供")}</strong>
          <div class="shop-match__action">
            ${match.action.type === "search_query" && match.action.query ? `<span class="shop-match__query">搜索：${escapeHtml(match.action.query)}</span>` : ""}
            ${isDemo ? '<small>Demo 来源</small>' : `<small>${escapeHtml(match.sourceLabel)}</small>`}
            <button type="button" data-commerce-action data-subject-id="${escapeHtml(subject.id)}" data-match-id="${escapeHtml(match.id)}" ${match.action.disabled ? "disabled" : ""}>${escapeHtml(match.action.label)}</button>
          </div>
        </div>
      </div>
    </article>`;
}

function subjectMarkup(subject, deliveryMode) {
  const matches = subject.matches || [];
  return `
    <section class="shop-subject" id="shop-subject-${escapeHtml(subject.id)}" data-subject-id="${escapeHtml(subject.id)}" tabindex="-1">
      <header>
        <span class="shop-subject__number">${subject.hotspotNumber ? String(subject.hotspotNumber).padStart(2, "0") : "—"}</span>
        <div><h5>${escapeHtml(subject.label)}</h5><p>${escapeHtml(subject.appearanceLabel || subject.placementHint || "根据本次方案关联")}</p></div>
        <small>${matches.length ? `${matches.length} 个候选` : "暂无候选"}</small>
      </header>
      ${
        matches.length
          ? `<div class="shop-match-list">${matches.map((match) => matchMarkup(match, subject, deliveryMode)).join("")}</div>`
          : '<p class="shop-subject__unmatched">这个元素暂未找到可靠商品，已保留在部分结果中。</p>'
      }
    </section>`;
}

function agentImpactMarkup(viewModel) {
  const impact = viewModel.agentImpact;
  if (!impact) return "";
  return `
    <aside class="shop-agent-impact" aria-label="视觉 Agent 工作说明">
      <span>${escapeHtml(impact.eyebrow)}</span>
      <strong>${escapeHtml(impact.title)}</strong>
      <p>${escapeHtml(impact.description)}</p>
      ${impact.model ? `<small>模型：${escapeHtml(impact.model)}${impact.promptVersion ? ` · ${escapeHtml(impact.promptVersion)}` : ""}</small>` : ""}
    </aside>`;
}

export function renderProductHotspots(viewModel) {
  if (!viewModel || !["ready", "partial"].includes(viewModel.status)) return "";
  const subjects = (viewModel.subjects || []).filter(
    (subject) => subject.bbox && subject.hotspotNumber
  );
  if (!subjects.length) return "";
  return `<div class="product-hotspots" aria-label="焕新图商品热点">${subjects
    .map((subject) => {
      const left = (subject.bbox.x + subject.bbox.width / 2) * 100;
      const top = (subject.bbox.y + subject.bbox.height / 2) * 100;
      return `<button type="button" style="left:${left}%;top:${top}%" data-product-hotspot="${escapeHtml(subject.id)}" aria-label="查看 ${escapeHtml(subject.label)}">${subject.hotspotNumber}</button>`;
    })
    .join("")}</div>`;
}

export class ShopTheLook {
  constructor(actions = {}) {
    this.actions = actions;
  }

  render(viewModel) {
    if (!viewModel) return "";
    const working = ["queued", "analyzing"].includes(viewModel.status);
    const hasResults = ["ready", "partial"].includes(viewModel.status);
    return `
      <section class="shop-the-look shop-the-look--${escapeHtml(viewModel.sourceTone || "neutral")}" aria-labelledby="shopTheLookTitle">
        <header class="shop-heading">
          <div><span>SHOP THE RESULT</span><h4 id="shopTheLookTitle">把这一角搬回家</h4></div>
          <em>${escapeHtml(viewModel.sourceBadge)}</em>
        </header>
        ${agentImpactMarkup(viewModel)}
        ${
          working
            ? `${progressMarkup(viewModel)}<button class="shop-text-action" type="button" data-shop-cancel>取消识别</button>`
            : hasResults
              ? `<p class="shop-intro">${escapeHtml(viewModel.description)}</p>
                 ${viewModel.status === "partial" ? '<p class="shop-partial-note">部分画面元素暂未匹配，已保留可用结果。</p>' : ""}
                 <div class="shop-subject-list">${viewModel.subjects.map((subject) => subjectMarkup(subject, viewModel.deliveryMode)).join("")}</div>`
              : emptyState(viewModel)
        }
        ${viewModel.deliveryMode === "offline_fixture" ? '<p class="shop-offline-banner">本地离线 Demo · 数据来自共享 fixture</p>' : ""}
      </section>`;
  }

  bind(root, viewModel) {
    if (!root || !viewModel) return;
    root.querySelector("[data-shop-cancel]")?.addEventListener("click", () =>
      this.actions.onCancel?.(viewModel)
    );
    root.querySelector("[data-shop-offline]")?.addEventListener("click", () =>
      this.actions.onOfflineDemo?.(viewModel)
    );
    root.querySelectorAll("[data-shop-retry]").forEach((button) =>
      button.addEventListener("click", () =>
        this.actions.onRetry?.(button.dataset.reason, viewModel)
      )
    );
    root.querySelectorAll("[data-commerce-action]").forEach((button) =>
      button.addEventListener("click", () => {
        const subject = viewModel.subjects.find((item) => item.id === button.dataset.subjectId);
        const match = subject?.matches.find((item) => item.id === button.dataset.matchId);
        if (subject && match) this.actions.onCommerceAction?.(match.action, subject, match, viewModel);
      })
    );
  }

  bindHotspots(root) {
    root?.querySelectorAll("[data-product-hotspot]").forEach((button) => {
      button.addEventListener("click", () => {
        const subject = root.querySelector(
          `[data-subject-id="${CSS.escape(button.dataset.productHotspot)}"]`
        );
        subject?.scrollIntoView({ behavior: "smooth", block: "center" });
        subject?.focus({ preventScroll: true });
      });
    });
  }
}
