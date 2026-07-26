const ACTIVE_STATUSES = new Set(["queued", "running"]);
const ACTION_TYPES = new Set([
  "douyin_deeplink",
  "web_url",
  "search_query",
  "unavailable"
]);

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeProductBbox(value) {
  if (!value || typeof value !== "object") return null;
  const bbox = {
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height)
  };
  if (!Object.values(bbox).every(Number.isFinite)) return null;
  if (
    bbox.x < 0 ||
    bbox.y < 0 ||
    bbox.width <= 0 ||
    bbox.height <= 0 ||
    bbox.x + bbox.width > 1 ||
    bbox.y + bbox.height > 1
  ) {
    return null;
  }
  return bbox;
}

export function isSafeCommerceWebUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function adaptAction(value = {}) {
  const type = ACTION_TYPES.has(value.type) ? value.type : "unavailable";
  const query = text(value.query) || null;
  const url = text(value.url) || null;
  let disabled = type === "unavailable";
  if (type === "web_url" && !isSafeCommerceWebUrl(url)) disabled = true;
  if (type === "search_query" && !query) disabled = true;
  if (type === "douyin_deeplink" && !url) disabled = true;
  const defaults = {
    douyin_deeplink: "去抖音购买",
    web_url: "查看商品",
    search_query: "复制抖音搜索词",
    unavailable: "暂不可购买"
  };
  return {
    type,
    label: text(value.label, defaults[type]),
    url,
    query,
    disabled
  };
}

function matchLabel(matchType) {
  return {
    exact_catalog_product: "目录商品",
    visual_similar: "风格与用途相近",
    category_recommendation: "品类建议"
  }[matchType] || "方案候选";
}

function adaptMatch(match = {}) {
  return {
    id: text(match.match_id),
    productId: text(match.product_id),
    title: text(match.title, "商品信息待补充"),
    coverUrl: text(match.cover_url) || null,
    priceLabel: text(match.price_label) || null,
    matchLabel: matchLabel(match.match_type),
    reasons: Array.isArray(match.match_reasons)
      ? match.match_reasons.filter((item) => typeof item === "string" && item.trim())
      : [],
    action: adaptAction(match.commerce_action),
    sourceLabel: text(match.source?.label, "来源未标注"),
    sourceType: text(match.source?.source_type, "unavailable")
  };
}

function appearanceLabel(appearance = {}) {
  return [
    ...(appearance.colors || []),
    ...(appearance.materials || []),
    ...(appearance.style_keywords || [])
  ]
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, 4)
    .join(" · ");
}

function adaptSubjects(subjects = []) {
  let hotspotNumber = 0;
  return subjects.map((subject) => {
    const bbox = normalizeProductBbox(subject.bbox);
    if (bbox) hotspotNumber += 1;
    return {
      id: text(subject.subject_id),
      label: text(subject.label, "可购买元素"),
      bbox,
      hotspotNumber: bbox ? hotspotNumber : null,
      appearanceLabel: appearanceLabel(subject.appearance),
      placementHint: text(subject.placement_hint),
      matchState: text(subject.match_state, "unmatched"),
      matches: Array.isArray(subject.matches)
        ? subject.matches.map(adaptMatch)
        : []
    };
  });
}

function presentationFor(run, deliveryMode) {
  if (deliveryMode === "offline_fixture") {
    return {
      sourceBadge: "本地离线 Demo",
      sourceTone: "demo",
      description: "使用共享 fixture 验证购买承接流程，不代表服务端已完成识别。"
    };
  }
  const image = run.result?.provenance?.image_analysis || {};
  const catalog = run.result?.provenance?.commerce_catalog || {};
  const imageLive = image.source_type === "live" || image.strategy === "image_agent";
  const planGrounded = image.source_type === "fallback" || image.strategy === "plan_grounded";
  const demoCatalog = catalog.source_type === "demo_catalog";
  const douyinCatalog = ["douyin_catalog", "live"].includes(catalog.source_type);

  if (run.result_state === "empty") {
    return {
      sourceBadge: "暂未找到可靠好物",
      sourceTone: "neutral",
      description: "这张焕新图里暂时没有足够可靠的可购买结果。"
    };
  }
  if (imageLive && douyinCatalog) {
    return {
      sourceBadge: "AI 识别 · 抖音好物",
      sourceTone: "live",
      description: "从焕新图里找到这些抖音好物。"
    };
  }
  if (planGrounded && demoCatalog) {
    return {
      sourceBadge: "方案关联 · Demo 商品",
      sourceTone: "demo",
      description: "根据本次方案，为你整理了可搜索好物。"
    };
  }
  if (imageLive && demoCatalog) {
    return {
      sourceBadge: "AI 识别 · Demo 候选",
      sourceTone: "demo",
      description: "画面元素由图像分析发现；商品来自 Demo 目录。"
    };
  }
  if (planGrounded) {
    return {
      sourceBadge: "根据方案关联",
      sourceTone: "fallback",
      description: "根据本次方案，为你整理了可搜索好物。"
    };
  }
  return {
    sourceBadge: "来源待确认",
    sourceTone: "neutral",
    description: "商品来源尚未完整标注，暂不作真实目录承诺。"
  };
}

function viewStatus(run = {}) {
  if (run.status === "queued") return "queued";
  if (run.status === "running") return "analyzing";
  if (run.status === "failed") return "failed";
  if (run.status === "cancelled") return "cancelled";
  if (run.status === "succeeded") {
    return new Set(["ready", "partial", "empty"]).has(run.result_state)
      ? run.result_state
      : "empty";
  }
  return "not_started";
}

const STAGE_COPY = {
  queued: "正在准备商品发现",
  analyzing_render: "正在从焕新图里找可购买的元素",
  building_queries: "正在整理适合搜索的关键词",
  retrieving_products: "正在匹配抖音好物",
  grounding_matches: "正在核对商品来源",
  packaging: "正在整理购买清单"
};

export function adaptProductDiscoveryRun(run, options = {}) {
  if (!run || typeof run !== "object") {
    throw new TypeError("ProductDiscoveryRun is required");
  }
  const status = viewStatus(run);
  const presentation = presentationFor(run, options.deliveryMode);
  return {
    runId: text(run.product_discovery_run_id),
    planAssetId: text(run.plan_asset_id),
    planVersionId: text(run.plan_version_id),
    status,
    stage: text(run.stage) || null,
    progress: Math.max(0, Math.min(100, Number(run.progress) || 0)),
    title: "把这一角搬回家",
    ...presentation,
    description:
      ACTIVE_STATUSES.has(run.status)
        ? STAGE_COPY[run.stage] || "正在整理可落地的好物"
        : presentation.description,
    subjects: adaptSubjects(run.result?.subjects || []),
    notices: Array.isArray(run.result?.notices)
      ? run.result.notices.map((notice) => ({
          code: text(notice.code),
          level: text(notice.level, "info"),
          message: text(notice.message)
        }))
      : [],
    canRetry:
      run.status === "failed" ||
      run.status === "cancelled" ||
      Boolean(run.retryable),
    errorMessage: text(run.error?.message) || null,
    deliveryMode: options.deliveryMode || "api"
  };
}

export function createUnavailableProductDiscoveryViewModel(reason) {
  return {
    runId: null,
    planAssetId: null,
    planVersionId: null,
    status: "unavailable",
    stage: null,
    progress: 0,
    title: "把这一角搬回家",
    description: text(reason, "商品发现服务尚未开放。"),
    sourceBadge: "服务尚未开放",
    sourceTone: "neutral",
    subjects: [],
    notices: [],
    canRetry: false,
    errorMessage: null,
    deliveryMode: "api"
  };
}
