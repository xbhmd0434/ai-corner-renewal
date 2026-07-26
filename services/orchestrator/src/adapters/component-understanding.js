import { DEMO_COMMERCE_CATEGORY_CODES } from "./commerce-catalog.js";

const PROMPT_VERSION = "source-component-understanding/1.0.0";

function componentError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 502;
  return error;
}
function cleanJson(text) {
  if (typeof text !== "string") {
    throw componentError(
      "component_understanding_contract_invalid",
      "组件识别模型没有返回 JSON"
    );
  }
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw componentError(
      "component_understanding_contract_invalid",
      "组件识别模型没有返回 JSON 对象"
    );
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function stringList(value, maximum = 8) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string" && item.trim())
        .slice(0, maximum)
        .map((item) => item.trim())
    : [];
}

function normalize(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw componentError(
      "component_understanding_contract_invalid",
      "组件识别结果不是对象"
    );
  }
  const categoryCode = String(candidate.category_code || "").trim();
  if (!DEMO_COMMERCE_CATEGORY_CODES.includes(categoryCode)) {
    throw componentError(
      "component_understanding_contract_invalid",
      `不支持的组件品类：${categoryCode || "empty"}`
    );
  }
  const confidence = Number(candidate.confidence);
  return {
    category_code: categoryCode,
    label:
      typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label.trim().slice(0, 100)
        : categoryCode,
    colors: stringList(candidate.colors),
    materials: stringList(candidate.materials),
    shape_keywords: stringList(candidate.shape_keywords),
    style_keywords: stringList(candidate.style_keywords),
    search_queries: stringList(candidate.search_queries, 4),
    confidence:
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
        ? confidence
        : null
  };
}

function fallbackIdentity(sourceContext = {}) {
  const text = `${sourceContext.caption || ""}`.toLowerCase();
  const categoryCode =
    /灯|lamp|light/.test(text)
      ? "lighting"
      : /收纳|storage|托盘/.test(text)
        ? "desktop_storage"
        : /绿植|植物|plant/.test(text)
          ? "plant"
          : "desk_riser";
  return {
    category_code: categoryCode,
    label: "视频圈选组件",
    colors: [],
    materials: [],
    shape_keywords: [],
    style_keywords: [],
    search_queries: [categoryCode],
    confidence: null
  };
}

function fallbackReason(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return "component_understanding_timeout";
  }
  if (typeof error?.code === "string" && error.code.startsWith("component_")) {
    return error.code;
  }
  return "component_understanding_unavailable";
}

function prompt() {
  return [
    "你是视频圈选组件识别 Agent。第一张且唯一的图片就是用户从视频关键帧中裁剪出的组件，不是整段视频。",
    "只识别可移动商品的视觉身份与搜索意图，不得编造品牌、SKU、价格、库存、销量、店铺或购买链接，也不得声称是同款。",
    `category_code 只能从以下代码选择：${DEMO_COMMERCE_CATEGORY_CODES.join(", ")}。`,
    "颜色、材质、形状和风格只写图片中有视觉证据的内容；不确定时使用空数组。",
    "search_queries 输出 1 到 4 条中文商品搜索词，不含平台名、品牌和价格。",
    "严格返回 JSON，不要 Markdown，不要解释：",
    '{"category_code":"desk_riser","label":"浅木色桌面增高架","colors":["浅木色"],"materials":["木"],"shape_keywords":["长方形","圆角"],"style_keywords":["原木"],"search_queries":["浅木色木质桌面增高架"],"confidence":0.88}'
  ].join("\n");
}

export function createComponentUnderstandingProvider({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
}) {
  return async function understandComponent({
    imageDataUrl,
    sourceContext,
    requestedMode = "auto"
  }) {
    if (
      config.backendMode === "demo" ||
      requestedMode === "demo" ||
      !config.agentPlanApiKey
    ) {
      return {
        sourceType: "fallback",
        reason: "component_understanding_not_configured",
        promptVersion: PROMPT_VERSION,
        model: config.agentPlanTextModel,
        latencyMs: 0,
        identity: fallbackIdentity(sourceContext)
      };
    }
    const startedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.agentPlanLayoutTimeoutMs ?? 90_000
    );
    try {
      const response = await fetchImpl(
        `${config.agentPlanBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.agentPlanApiKey}`,
            "Content-Type": "application/json"
          },
          redirect: "error",
          signal: controller.signal,
          body: JSON.stringify({
            model: config.agentPlanTextModel,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: imageDataUrl } },
                  { type: "text", text: prompt() }
                ]
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 900
          })
        }
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw componentError(
          "component_understanding_http_error",
          `组件识别模型返回 HTTP ${response.status}`
        );
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      const text = Array.isArray(content)
        ? content.map((part) => part?.text || "").join("")
        : content;
      return {
        sourceType: "live",
        promptVersion: PROMPT_VERSION,
        model: payload.model || config.agentPlanTextModel,
        latencyMs: Math.max(0, now() - startedAt),
        identity: normalize(cleanJson(text))
      };
    } catch (error) {
      return {
        sourceType: "fallback",
        reason: fallbackReason(error),
        diagnostic:
          typeof error?.message === "string"
            ? error.message.slice(0, 300)
            : "unknown component understanding error",
        promptVersion: PROMPT_VERSION,
        model: config.agentPlanTextModel,
        latencyMs: Math.max(0, now() - startedAt),
        identity: fallbackIdentity(sourceContext)
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}
