import test from "node:test";
import assert from "node:assert/strict";
import { createRenderEvaluator } from "../src/adapters/render-evaluator.js";

function responseWith(content) {
  return new Response(
    JSON.stringify({
      model: "vision-evaluator",
      choices: [{ message: { content: JSON.stringify(content) } }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";

test("效果图视觉校验以服务端阈值为准，而不是相信模型 accepted 字段", async () => {
  const evaluator = createRenderEvaluator({
    config: {
      backendMode: "auto",
      agentPlanApiKey: "secret",
      agentPlanBaseUrl: "https://example.invalid/api/v3",
      agentPlanTextModel: "vision-evaluator",
      agentPlanLayoutTimeoutMs: 5000
    },
    fetchImpl: async () =>
      responseWith({
        accepted: true,
        scores: {
          base_fidelity: 0.95,
          source_component_fidelity: 0.4,
          change_visibility: 0.9,
          visual_coherence: 0.9,
          physical_plausibility: 0.9,
          constraint_compliance: 0.95,
          clutter_risk: 0.1
        },
        hard_failures: [],
        repair_instruction: "保留圈选组件的原始造型和颜色"
      })
  });
  const result = await evaluator({
    beforeImageDataUrl: IMAGE,
    componentImageDataUrl: IMAGE,
    afterImageDataUrl: IMAGE,
    sourceComponent: { source_component_id: "source-component-1" },
    layoutPlan: { status: "ready" },
    requestedMode: "live"
  });
  assert.equal(result.evaluation.accepted, false);
  assert.equal(result.evaluation.scores.source_component_fidelity, 0.4);
  assert.match(result.evaluation.repair_instruction, /圈选组件/);
});

test("没有 SourceComponent 的风格任务不要求组件一致性分数", async () => {
  const evaluator = createRenderEvaluator({
    config: {
      backendMode: "auto",
      agentPlanApiKey: "secret",
      agentPlanBaseUrl: "https://example.invalid/api/v3",
      agentPlanTextModel: "vision-evaluator",
      agentPlanLayoutTimeoutMs: 5000
    },
    fetchImpl: async () =>
      responseWith({
        accepted: true,
        scores: {
          base_fidelity: 0.9,
          source_component_fidelity: 0,
          change_visibility: 0.8,
          visual_coherence: 0.8,
          physical_plausibility: 0.85,
          constraint_compliance: 0.95,
          clutter_risk: 0.2
        },
        hard_failures: [],
        repair_instruction: ""
      })
  });
  const result = await evaluator({
    beforeImageDataUrl: IMAGE,
    componentImageDataUrl: null,
    afterImageDataUrl: IMAGE,
    sourceComponent: null,
    layoutPlan: { status: "ready" },
    requestedMode: "live"
  });
  assert.equal(result.evaluation.accepted, true);
});
