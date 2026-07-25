import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { createLayoutPlanner } from "../src/adapters/layout-planner.js";

const IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function candidatePlan() {
  return {
    status: "ready",
    needs_input_reason: "",
    scene: {
      scene_type: "客厅角落",
      primary_function: "休息与阅读",
      existing_style: "现代",
      dominant_colors: ["灰色"],
      main_materials: ["织物"],
      lighting: "右侧自然光",
      editable_area: "沙发侧边地面"
    },
    preserve: [{ object: "沙发", reason: "核心家具" }],
    problems: [{ type: "empty", area: "沙发侧边", evidence: "缺少照明", priority: 1 }],
    design_direction: {
      goal: "增加阅读舒适度",
      focal_point: "沙发侧边",
      palette: ["灰色", "黑色"],
      materials: ["织物", "金属"],
      spatial_strategy: "保持通道留白"
    },
    actions: [
      {
        type: "add",
        target: "落地灯",
        placement: "沙发外侧",
        instruction: "增加一盏细杆落地灯",
        reason: "阅读照明"
      }
    ],
    product_slots: [
      {
        slot_id: "product_01",
        category: "落地灯",
        purpose: "阅读照明",
        quantity: 1,
        size_constraint: "底座直径不超过25cm",
        color: "黑色",
        material: "金属",
        placement: "沙发外侧",
        support: "地面",
        clearance_constraints: ["不占通道"],
        douyin_search_queries: ["细杆阅读落地灯"]
      }
    ],
    render_instruction: "保持沙发不变，在外侧增加细杆落地灯。",
    negative_constraints: ["不增加边几"]
  };
}

test("Layout Planner 把图片和规划 Prompt 交给文本视觉模型并校验方案", async () => {
  let requestedUrl;
  let requestedOptions;
  let clock = 0;
  const planner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret",
      AGENT_PLAN_TEXT_MODEL: "doubao-seed-test"
    }),
    now: () => (clock += 20),
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return new Response(
        JSON.stringify({
          model: "doubao-seed-test",
          choices: [{ message: { content: JSON.stringify(candidatePlan()) } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });

  const result = await planner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "分析场景并制定布置方案。"
  });
  const body = JSON.parse(requestedOptions.body);

  assert.match(requestedUrl, /\/chat\/completions$/);
  assert.equal(requestedOptions.headers.Authorization, "Bearer secret");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.max_tokens, 4000);
  assert.equal(body.messages[0].content[0].image_url.url, IMAGE_DATA_URL);
  assert.equal(body.messages[0].content[1].text, "分析场景并制定布置方案。");
  assert.equal(result.sourceType, "live");
  assert.equal(result.plan.product_slots[0].category, "落地灯");
  assert.equal(result.latencyMs, 20);
});

test("Layout Planner 拒绝超出动作和商品槽位上限的模型输出", async () => {
  const invalidPlan = candidatePlan();
  invalidPlan.product_slots = Array.from({ length: 6 }, (_, index) => ({
    ...invalidPlan.product_slots[0],
    slot_id: `product_0${index + 1}`
  }));
  const planner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(invalidPlan) } }]
        }),
        { status: 200 }
      )
  });

  const result = await planner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "分析场景并制定布置方案。"
  });
  assert.equal(result.sourceType, "fallback");
  assert.equal(result.reason, "planning_contract_invalid");
});

test("Layout Planner 拒绝移动、替换或删除现有家具的动作", async () => {
  const invalidPlan = candidatePlan();
  invalidPlan.actions[0] = {
    type: "reposition",
    target: "原有沙发",
    placement: "向左移动",
    instruction: "移动原有沙发",
    reason: "腾出空间"
  };
  const planner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(invalidPlan) } }]
        }),
        { status: 200 }
      )
  });

  const result = await planner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "保持家具几何不变，只规划新增物品。"
  });
  assert.equal(result.sourceType, "fallback");
  assert.equal(result.reason, "planning_contract_invalid");
});
