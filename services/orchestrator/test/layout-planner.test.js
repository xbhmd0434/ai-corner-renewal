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

test("Layout Planner 对超量商品槽位去重并按容量安全裁剪", async () => {
  const oversizedPlan = candidatePlan();
  oversizedPlan.product_slots = Array.from({ length: 6 }, (_, index) => ({
    ...oversizedPlan.product_slots[0],
    slot_id: `product_0${index + 1}`,
    category: index === 5 ? "补充商品1" : `补充商品${index + 1}`,
    placement: index === 5 ? "区域1" : `区域${index + 1}`
  }));
  const planner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(oversizedPlan) } }]
        }),
        { status: 200 }
      )
  });

  const result = await planner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "分析场景并制定布置方案。"
  });
  assert.equal(result.sourceType, "live");
  assert.equal(result.plan.product_slots.length, 4);
  assert.deepEqual(result.normalization, {
    actions_received: 1,
    actions_kept: 1,
    product_slots_received: 6,
    product_slots_kept: 4,
    defaulted_fields: [],
    product_slots_deduplicated: 1
  });
});

test("Layout Planner 为合法动作缺失的 placement 补受控默认并记录审计", async () => {
  const incompletePlan = candidatePlan();
  delete incompletePlan.actions[0].placement;
  const planner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(incompletePlan) } }]
        }),
        { status: 200 }
      )
  });

  const result = await planner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "保持家具不变并补充照明。"
  });
  assert.equal(result.sourceType, "live");
  assert.match(result.plan.actions[0].placement, /可编辑区域/);
  assert.deepEqual(result.normalization.defaulted_fields, [
    "actions[0].placement"
  ]);
});

test("Layout Planner 为清理整理动作补可推导字段，但不替 add 猜目标", async () => {
  const incompletePlan = candidatePlan();
  incompletePlan.actions = [{ type: "organize_loose_items" }];
  const responseFor = (plan) =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(plan) } }]
      }),
      { status: 200 }
    );
  const planner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () => responseFor(incompletePlan)
  });

  const result = await planner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "整理桌面。"
  });
  assert.equal(result.sourceType, "live");
  assert.equal(result.plan.actions[0].target, "散乱小物与线缆");
  assert.match(result.plan.actions[0].instruction, /分类归拢/);
  assert.deepEqual(result.normalization.defaulted_fields, [
    "actions[0].target",
    "actions[0].placement",
    "actions[0].instruction",
    "actions[0].reason"
  ]);

  const unsafePlan = candidatePlan();
  unsafePlan.actions = [{ type: "add" }];
  const rejectingPlanner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () => responseFor(unsafePlan)
  });
  const rejected = await rejectingPlanner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "增加一件商品。"
  });
  assert.equal(rejected.sourceType, "fallback");
  assert.equal(rejected.reason, "planning_contract_invalid");
});

test("Layout Planner 裁剪超量动作时优先保留清理、整理和 SourceComponent", async () => {
  const oversizedPlan = candidatePlan();
  oversizedPlan.actions = [
    ...Array.from({ length: 8 }, (_, index) => ({
      type: "add",
      target: `补充商品${index + 1}`,
      placement: `区域${index + 1}`,
      instruction: `增加补充商品${index + 1}`,
      reason: "完善构图"
    })),
    {
      type: "remove_trash",
      target: "桌面垃圾",
      placement: "移出画面",
      instruction: "清理包装与空瓶",
      reason: "降低杂乱"
    },
    {
      type: "organize_loose_items",
      target: "散乱小物",
      placement: "分区收纳",
      instruction: "归拢线缆与小物",
      reason: "改善秩序"
    },
    {
      type: "add",
      target: "source_component:source-component-1",
      placement: "桌面右侧",
      instruction: "原样放入圈选组件",
      reason: "形成视觉焦点"
    }
  ];
  const planner = createLayoutPlanner({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(oversizedPlan) } }]
        }),
        { status: 200 }
      )
  });

  const result = await planner({
    imageDataUrl: IMAGE_DATA_URL,
    prompt: "保持必要动作并裁剪次要新增物。"
  });
  assert.equal(result.sourceType, "live");
  assert.equal(result.plan.actions.length, 8);
  assert.deepEqual(
    result.plan.actions.slice(0, 3).map((item) => item.type),
    ["remove_trash", "organize_loose_items", "add"]
  );
  assert.equal(
    result.plan.actions[2].target,
    "source_component:source-component-1"
  );
  assert.equal(result.normalization.actions_received, 11);
  assert.equal(result.normalization.actions_kept, 8);
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
