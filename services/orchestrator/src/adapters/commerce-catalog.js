import { products as demoProducts } from "../data/demo-catalog.js";

const ALLOWED_URL_SCHEMES = new Set(["https:", "douyin:"]);

/**
 * CommerceCatalogAdapter — 本轮复用 demo-catalog.js 的商品事实。
 * 不复制第二份商品数据；Demo 商品返回 source_type=demo_catalog；
 * 没有真实链接时返回 search_query；不得伪造抖音商品链接。
 */
export class DemoCommerceCatalogAdapter {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
  }

  /**
   * @param {object} params
   * @param {string} params.actorId
   * @param {object} params.subject - DiscoveredSubject
   * @param {object} [params.budgetContext]
   * @param {number} [params.limit=3]
   * @returns {Promise<{sourceType: string, checkedAt: string, candidates: object[]}>}
   */
  async retrieve({ actorId, subject, budgetContext, limit = 3 }) {
    const checkedAt = this.now().toISOString();
    const candidates = [];

    // 按品类代码匹配 Demo 商品
    const categoryMap = {
      table_lamp: ["prod-warm-clamp-lamp", "prod-green-mushroom-lamp"],
      desk_riser: ["prod-warm-oak-riser", "prod-green-bamboo-riser", "prod-compact-monitor-riser"],
      display_board: ["prod-warm-linen-board"],
      desktop_storage: ["prod-warm-storage-trays", "prod-compact-sorting-cups", "prod-green-rattan-baskets"],
      cable_management: ["prod-warm-cable-box", "prod-compact-magnetic-clips", "prod-green-wood-cable-clips"],
      plant: ["prod-warm-pothos-planter", "prod-green-peperomia-planter", "prod-green-fern-vase", "prod-pet-safe-faux-plant"],
      file_storage: ["prod-compact-file-rack"],
      underdesk_storage: ["prod-compact-underdesk-drawer"],
      monitor_riser: ["prod-compact-monitor-riser"],
      desk_mat: ["prod-green-linen-mat"],
      lighting: ["prod-warm-clamp-lamp", "prod-green-mushroom-lamp"],
      plant_alternative: ["prod-pet-safe-faux-plant"]
    };

    const matchingIds = categoryMap[subject.category_code] || [];
    const allIds = subject.product_ids || matchingIds;

    for (const productId of allIds) {
      if (candidates.length >= limit) break;
      const product = demoProducts[productId];
      if (!product) continue;

      candidates.push(this.#toCandidate(product, checkedAt));
    }

    // 如果没有品类匹配，尝试关键词搜索
    if (candidates.length === 0 && subject.search_queries?.length) {
      for (const [id, product] of Object.entries(demoProducts)) {
        if (candidates.length >= limit) break;
        if (product.category === "wall_shelf" && !product.eligible_for_default_plan) continue;
        const searchText = `${product.name} ${product.category}`.toLowerCase();
        const matches = subject.search_queries.some((q) =>
          q.toLowerCase().split(/\s+/).some((term) => searchText.includes(term))
        );
        if (matches) {
          candidates.push(this.#toCandidate(product, checkedAt));
        }
      }
    }

    return {
      sourceType: "demo_catalog",
      checkedAt,
      candidates
    };
  }

  #toCandidate(product, checkedAt) {
    return {
      product_id: product.product_id,
      title: product.name,
      category_code: product.category,
      price_cny: product.price_cny,
      price_label: `¥${product.price_cny}`,
      cover_url: null,
      availability: {
        status: "demo",
        checked_at: checkedAt
      },
      source: {
        source_type: "demo_catalog",
        label: "本地 Demo 商品目录",
        checked_at: checkedAt
      },
      commerce_action: {
        type: "search_query",
        label: "去抖音搜",
        url: null,
        query: `${product.name}`
      }
    };
  }
}

/**
 * 确定性 Grounding：
 * - product_id 唯一
 * - 商品来源字段完整
 * - price_cny 为整数或 null
 * - URL 使用允许 scheme/host
 * - match_type=exact_catalog_product 需要足够证据
 * - 每个 subject 返回不超过请求上限
 */
export function groundProductMatches(subjects, catalogCandidates, { matchesPerSubject = 3, now = new Date().toISOString() } = {}) {
  const seenProductIds = new Set();

  for (const subject of subjects) {
    subject.match_state = "unmatched";
    subject.matches = [];

    const candidates = (catalogCandidates[subject.subject_id] || []).slice(0, matchesPerSubject);
    if (!candidates.length) continue;

    const validMatches = [];
    for (const candidate of candidates) {
      // 确定性校验
      if (!candidate.product_id || typeof candidate.product_id !== "string") continue;
      if (seenProductIds.has(candidate.product_id)) continue;
      if (candidate.price_cny !== null && (!Number.isInteger(candidate.price_cny) || candidate.price_cny < 0)) continue;
      if (candidate.commerce_action?.url) {
        try {
          const parsed = new URL(candidate.commerce_action.url);
          if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) continue;
        } catch {
          continue;
        }
      }

      // match_type 校验：没有 exact 证据时不能返回 exact_catalog_product
      let matchType = candidate.match_type || "visual_similar";
      if (matchType === "exact_catalog_product") {
        // 除非有足够的证据，否则降级
        if (!candidate.match_reasons?.some((r) => r.includes("exact") || r.includes("精确"))) {
          matchType = "visual_similar";
        }
      }

      seenProductIds.add(candidate.product_id);
      validMatches.push({
        match_id: `match-${subject.subject_id}-${candidate.product_id}`,
        product_id: candidate.product_id,
        title: candidate.title,
        category_code: candidate.category_code || subject.category_code,
        cover_url: candidate.cover_url || null,
        price_cny: candidate.price_cny,
        price_label: candidate.price_label || (candidate.price_cny != null ? `¥${candidate.price_cny}` : "暂无价格"),
        match_type: matchType,
        match_confidence: candidate.match_confidence ?? null,
        match_reasons: candidate.match_reasons || [],
        availability: candidate.availability || { status: "demo", checked_at: now },
        commerce_action: candidate.commerce_action || { type: "search_query", label: "去抖音搜", url: null, query: candidate.title },
        source: candidate.source || { source_type: "demo_catalog", label: "本地 Demo 商品目录", checked_at: now }
      });
    }

    subject.matches = validMatches;
    if (validMatches.length > 0) {
      subject.match_state = "matched";
    }
  }

  return subjects;
}
