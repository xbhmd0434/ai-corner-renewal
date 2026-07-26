import test from "node:test";
import assert from "node:assert/strict";
import { createComponentUnderstandingProvider } from "../src/adapters/component-understanding.js";

test("组件识别上游不可达时返回明确 fallback，允许服务端继续确认 SourceComponent", async () => {
  const provider = createComponentUnderstandingProvider({
    config: {
      backendMode: "auto",
      agentPlanApiKey: "test-key",
      agentPlanBaseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      agentPlanTextModel: "doubao-seed-test",
      agentPlanLayoutTimeoutMs: 5000
    },
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
    now: () => 100
  });

  const result = await provider({
    imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    sourceContext: { caption: "桌面上的暖光小台灯" },
    requestedMode: "auto"
  });

  assert.equal(result.sourceType, "fallback");
  assert.equal(result.reason, "component_understanding_unavailable");
  assert.equal(result.identity.category_code, "lighting");
  assert.deepEqual(result.identity.search_queries, ["lighting"]);
});
