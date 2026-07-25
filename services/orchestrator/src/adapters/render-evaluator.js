import {
  buildRenderEvaluationPrompt,
  RENEWAL_RENDER_EVALUATOR_PROMPT_VERSION
} from "../prompts/renewal-v2.js";

const THRESHOLDS = Object.freeze({
  base_fidelity: 0.85,
  source_component_fidelity: 0.86,
  change_visibility: 0.72,
  visual_coherence: 0.7,
  physical_plausibility: 0.8,
  constraint_compliance: 0.9
});

function parseJson(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part?.text || "").join("")
    : content;
  const cleaned = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
}

function normalize(
  candidate,
  { requiresSourceComponent, organizationRequired }
) {
  const scores = {};
  for (const key of [...Object.keys(THRESHOLDS), "clutter_risk"]) {
    const score = Number(candidate?.scores?.[key]);
    scores[key] = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  }
  const hardFailures = Array.isArray(candidate?.hard_failures)
    ? candidate.hard_failures
        .filter((item) => typeof item === "string" && item.trim())
        .slice(0, 8)
    : [];
  const observations = {
    before_clutter_level: ["low", "medium", "high"].includes(
      candidate?.observations?.before_clutter_level
    )
      ? candidate.observations.before_clutter_level
      : "unknown",
    after_clutter_level: ["low", "medium", "high"].includes(
      candidate?.observations?.after_clutter_level
    )
      ? candidate.observations.after_clutter_level
      : "unknown",
    clutter_reduction_ratio: Number.isFinite(
      Number(candidate?.observations?.clutter_reduction_ratio)
    )
      ? Math.max(
          0,
          Math.min(1, Number(candidate.observations.clutter_reduction_ratio))
        )
      : 0,
    organization_action_visible:
      candidate?.observations?.organization_action_visible === true,
    source_component_count: Number.isInteger(
      candidate?.observations?.source_component_count
    )
      ? candidate.observations.source_component_count
      : null,
    same_category_extra_count: Number.isInteger(
      candidate?.observations?.same_category_extra_count
    )
      ? candidate.observations.same_category_extra_count
      : null
  };
  if (
    organizationRequired &&
    (
      observations.after_clutter_level !== "low" ||
      observations.clutter_reduction_ratio < 0.55 ||
      observations.organization_action_visible !== true
    ) &&
    !hardFailures.includes("clutter_not_reduced")
  ) {
    hardFailures.push("clutter_not_reduced");
    scores.clutter_risk = Math.max(scores.clutter_risk, 0.6);
  }
  if (
    requiresSourceComponent &&
    observations.same_category_extra_count > 0 &&
    !hardFailures.includes("duplicate_source_category")
  ) {
    hardFailures.push("duplicate_source_category");
  }
  const accepted =
    hardFailures.length === 0 &&
    Object.entries(THRESHOLDS).every(
      ([key, threshold]) =>
        (!requiresSourceComponent && key === "source_component_fidelity") ||
        scores[key] >= threshold
    ) &&
    scores.clutter_risk <= 0.35;
  return {
    accepted,
    scores,
    hard_failures: hardFailures,
    observations,
    repair_instruction:
      typeof candidate?.repair_instruction === "string"
        ? candidate.repair_instruction.trim().slice(0, 1200)
        : hardFailures.includes("clutter_not_reduced")
          ? "彻底移除垃圾、包装、空瓶和大部分散乱小物，只保留必要输入设备；不得增加与圈选组件同品类的第二件商品。"
          : ""
  };
}

export function createRenderEvaluator({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
}) {
  return async function evaluateRender({
    beforeImageDataUrl,
    componentImageDataUrl,
    afterImageDataUrl,
    sourceComponent,
    layoutPlan,
    requestedMode = "auto"
  }) {
    if (
      config.backendMode === "demo" ||
      requestedMode === "demo" ||
      !config.agentPlanApiKey
    ) {
      return {
        sourceType: "demo",
        promptVersion: RENEWAL_RENDER_EVALUATOR_PROMPT_VERSION,
        model: config.agentPlanTextModel,
        latencyMs: 0,
        evaluation: {
          accepted: true,
          scores: {
            base_fidelity: 1,
            source_component_fidelity: sourceComponent ? 1 : 0,
            change_visibility: 1,
            visual_coherence: 1,
            physical_plausibility: 1,
            constraint_compliance: 1,
            clutter_risk: 0
          },
          hard_failures: [],
          observations: {
            before_clutter_level: "low",
            after_clutter_level: "low",
            clutter_reduction_ratio: 1,
            organization_action_visible: true,
            source_component_count: sourceComponent ? 1 : 0,
            same_category_extra_count: 0
          },
          repair_instruction: ""
        }
      };
    }
    const startedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.agentPlanLayoutTimeoutMs ?? 90_000
    );
    try {
      const images = [
        beforeImageDataUrl,
        componentImageDataUrl,
        afterImageDataUrl
      ].filter(Boolean);
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
                  ...images.map((url) => ({
                    type: "image_url",
                    image_url: { url }
                  })),
                  {
                    type: "text",
                    text: buildRenderEvaluationPrompt({
                      sourceComponent,
                      layoutPlan
                    })
                  }
                ]
              }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 1200
          })
        }
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`render evaluator HTTP ${response.status}`);
      }
      const payload = await response.json();
      const organizationRequired = (layoutPlan?.actions || []).some((action) =>
        ["organize_loose_items", "remove_trash"].includes(action.type)
      );
      return {
        sourceType: "live",
        promptVersion: RENEWAL_RENDER_EVALUATOR_PROMPT_VERSION,
        model: payload.model || config.agentPlanTextModel,
        latencyMs: Math.max(0, now() - startedAt),
        evaluation: normalize(
          parseJson(payload?.choices?.[0]?.message?.content),
          {
            requiresSourceComponent: Boolean(sourceComponent),
            organizationRequired
          }
        )
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}
