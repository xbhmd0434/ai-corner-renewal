/**
 * Inspiration Intent ViewModel Adapter (V2.1)
 *
 * 对应 `v2-parallel-development-contract.md` 第 6.1 节 InspirationAsset 的意图快照。
 *
 * 协议要求：
 * - InspirationAsset detail.attributes.intent_analysis 包含：
 *   state ∈ needs_confirmation | ready | failed
 *   suggested_type ∈ component | style
 *   summary, component_reference, style_reference, source_mode
 * - confirmed_intent 为不可变输入快照（用户确认后才有）
 *
 * 前端只展示后端返回的候选，不擅自纠正 Agent 结果，不推断商品字段。
 */

const STATE_VALUES = new Set(["needs_confirmation", "ready", "failed"]);
const INTENT_TYPES = new Set(["component", "style"]);

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
    .slice(0, 16);
}

/**
 * 适配 InspirationAsset detail 的意图分析字段。
 * 调用方应传入 adaptAsset 后的 asset 或后端原始 detail。
 *
 * @param {object} detail - 后端 InspirationAsset detail（含 attributes）
 * @returns {object} - InspirationIntentViewModel
 */
export function adaptInspirationIntent(detail) {
  const attributes = detail?.attributes || {};
  const analysis = attributes.intent_analysis || {};
  const confirmed = attributes.confirmed_intent || null;

  const state = STATE_VALUES.has(analysis.state)
    ? analysis.state
    : detail?.parse_state
      ? "needs_confirmation"
      : "needs_confirmation";

  const suggestedType = INTENT_TYPES.has(analysis.suggested_type)
    ? analysis.suggested_type
    : null;

  const componentReference = analysis.component_reference || null;
  const styleReference = analysis.style_reference || null;
  const candidates = Array.isArray(analysis.candidates)
    ? analysis.candidates
        .filter(
          (candidate) =>
            candidate &&
            INTENT_TYPES.has(candidate.intent_type) &&
            text(candidate.summary)
        )
        .slice(0, 2)
        .map((candidate) => ({
          intentType: candidate.intent_type,
          summary: text(candidate.summary)
        }))
    : [];

  return {
    state,
    suggestedType,
    summary: text(analysis.summary),
    sourceMode: text(analysis.source_mode, "demo"),
    componentReference: componentReference
      ? {
          categoryCode: text(componentReference.category_code),
          colors: asStringArray(componentReference.colors),
          materials: asStringArray(componentReference.materials),
          shapeKeywords: asStringArray(componentReference.shape_keywords)
        }
      : null,
    styleReference: styleReference
      ? {
          styleKeywords: asStringArray(styleReference.style_keywords),
          palette: asStringArray(styleReference.palette),
          materials: asStringArray(styleReference.materials)
        }
      : null,
    candidates,
    confirmedIntent: confirmed
      ? {
          intentType: INTENT_TYPES.has(confirmed.intent_type)
            ? confirmed.intent_type
            : null,
          summary: text(confirmed.summary),
          confirmedBy: text(confirmed.confirmed_by, "user"),
          confirmedAt: text(confirmed.confirmed_at)
        }
      : null,
    // 是否已确认可创建 DesignRequest
    isConfirmed: Boolean(
      confirmed && INTENT_TYPES.has(confirmed.intent_type)
    )
  };
}

/**
 * 构造「未确认意图」的占位 ViewModel，用于 fixture / 离线 Demo。
 *
 * @param {"component"|"style"} suggestedType
 * @param {string} summary
 * @returns {object}
 */
export function createNeedsConfirmationIntent(suggestedType, summary) {
  return {
    state: "needs_confirmation",
    suggestedType: INTENT_TYPES.has(suggestedType) ? suggestedType : null,
    summary: text(summary),
    sourceMode: "demo",
    componentReference: null,
    styleReference: null,
    confirmedIntent: null,
    isConfirmed: false
  };
}
