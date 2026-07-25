import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentPlanProductDiscoveryProvider,
  validateAgentOutput
} from "../src/adapters/product-discovery-agent.js";

const IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=";

function agentContext() {
  return {
    sceneType: "desk_corner",
    planTitle: "原木呼吸感",
    placements: [
      {
        product_id: "prod-warm-clamp-lamp",
        zone: "desktop_back",
        instruction: "夹在桌面右后侧"
      }
    ],
    aicard: {
      products: [
        {
          product_id: "prod-warm-clamp-lamp",
          name: "暖白夹式台灯",
          category: "lighting"
        }
      ],
      plan: {
        placements: [
          {
            product_id: "prod-warm-clamp-lamp",
            zone: "desktop_back"
          }
        ]
      }
    },
    planVersion: {
      implementation_source_roles: [
        {
          product_id: "prod-warm-clamp-lamp",
          role: "source_video"
        }
      ]
    }
  };
}

test("Agent Plan 商品发现会看 after 图并只输出视觉需求", async () => {
  let captured;
  const agentOutput = {
    schema_version: "1.0",
    subjects: [
      {
        subject_ref: "planned-1",
        label: "暖白夹式台灯",
        category_code: "lighting",
        bbox: { x: 0.68, y: 0.18, width: 0.16, height: 0.32 },
        appearance: {
          colors: ["暖白"],
          materials: ["哑光金属"],
          style_keywords: ["轻巧", "暖光"]
        },
        placement_hint: "桌面右后侧",
        confidence: 0.93,
        commerce_search_queries: ["暖白夹式台灯 桌面 暖光"]
      }
    ]
  };
  const provider = new AgentPlanProductDiscoveryProvider({
    config: {
      backendMode: "live",
      agentPlanApiKey: "test-key",
      agentPlanBaseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      agentPlanTextModel: "doubao-seed-2.0-lite",
      agentPlanDiscoveryTimeoutMs: 5000,
      agentPlanDiscoveryResponseLimitBytes: 32 * 1024
    },
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(agentOutput)
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  });

  const result = await provider.discover({
    image: { dataUrl: IMAGE_DATA_URL, mediaType: "image/png" },
    context: agentContext(),
    limits: { maxSubjects: 6, maxQueriesPerSubject: 3 },
    requestedMode: "auto"
  });

  assert.equal(
    captured.url,
    "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions"
  );
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.body.response_format.type, "json_object");
  assert.equal(
    captured.body.messages[0].content[0].image_url.url,
    IMAGE_DATA_URL
  );
  const prompt = captured.body.messages[0].content[1].text;
  assert.match(prompt, /商品发现视觉 Agent/);
  assert.match(prompt, /暖白夹式台灯/);
  assert.doesNotMatch(prompt, /prod-warm-clamp-lamp/);
  assert.match(prompt, /不能输出 product_id/);

  assert.equal(result.sourceType, "live");
  assert.equal(result.strategy, "image_agent");
  assert.equal(result.provider, "volcengine_agent_plan");
  assert.equal(result.promptVersion, "product-discovery-agent/1.0");
  assert.deepEqual(result.subjects, agentOutput.subjects);
  assert.equal(validateAgentOutput(agentOutput, 6).valid, true);
});

test("Demo 模式不会调用商品发现 Agent", async () => {
  let calls = 0;
  const provider = new AgentPlanProductDiscoveryProvider({
    config: {
      backendMode: "demo",
      agentPlanApiKey: "test-key"
    },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("不应调用");
    }
  });

  const result = await provider.discover({
    image: { dataUrl: IMAGE_DATA_URL, mediaType: "image/png" },
    context: agentContext(),
    limits: { maxSubjects: 3 },
    requestedMode: "auto"
  });

  assert.equal(calls, 0);
  assert.equal(result.sourceType, "fallback");
  assert.equal(result.strategy, "plan_grounded");
  assert.equal(result.subjects[0].bbox, null);
});

test("Agent 输出不能把商品事实藏在嵌套字段或越界 bbox 中", () => {
  const invalid = {
    schema_version: "1.0",
    subjects: [
      {
        subject_ref: "supplement-1",
        label: "桌面灯",
        category_code: "lighting",
        bbox: { x: 0.9, y: 0.2, width: 0.2, height: 0.3 },
        appearance: {
          colors: ["白色"],
          materials: [],
          style_keywords: [],
          offer: { price_cny: 99 }
        },
        placement_hint: "桌面",
        confidence: 0.9,
        commerce_search_queries: ["白色桌面灯"]
      }
    ]
  };

  const validation = validateAgentOutput(invalid, 6);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.includes("禁止字段 price_cny")));
  assert.ok(validation.issues.some((issue) => issue.includes("bbox 超出图片边界")));
});
