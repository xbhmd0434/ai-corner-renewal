import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { PromptLabService } from "../src/services/prompt-lab-service.js";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=";
const IMAGE_DATA_URL = `data:image/png;base64,${ONE_PIXEL_PNG}`;

function config(overrides = {}) {
  return loadConfig({
    AI_BACKEND_MODE: "auto",
    AGENT_PLAN_API_KEY: "secret",
    ...overrides
  });
}

function readyPlan() {
  return {
    status: "ready",
    needs_input_reason: "",
    scene: {
      scene_type: "卧室床头角落",
      primary_function: "睡前取物与夜间照明",
      existing_style: "简洁现代",
      dominant_colors: ["米白", "深木色"],
      main_materials: ["木材", "织物"],
      lighting: "左侧自然光",
      editable_area: "床头柜台面"
    },
    preserve: [{ object: "床与床头柜", reason: "核心家具" }],
    problems: [
      {
        type: "clutter",
        area: "床头柜",
        evidence: "小物散落",
        priority: 1
      }
    ],
    design_direction: {
      goal: "整理床头并改善夜间照明",
      focal_point: "床头柜上方",
      palette: ["米白", "深木色", "暖黄"],
      materials: ["木材", "亚麻"],
      spatial_strategy: "保留半数台面留白"
    },
    actions: [
      {
        type: "organize_loose_items",
        target: "床头柜小物",
        placement: "床头柜后侧",
        instruction: "把零散小物归入一个浅口托盘",
        reason: "恢复台面秩序"
      },
      {
        type: "add",
        target: "小型台灯",
        placement: "床头柜外侧后方",
        instruction: "增加一盏低体量暖光台灯",
        reason: "提供夜间照明"
      }
    ],
    product_slots: [
      {
        slot_id: "product_01",
        category: "小型台灯",
        purpose: "夜间照明",
        quantity: 1,
        size_constraint: "底座直径不超过 18cm",
        color: "米白",
        material: "亚麻与金属",
        placement: "床头柜外侧后方",
        support: "完整落在床头柜台面",
        clearance_constraints: ["不遮挡床头开关"],
        douyin_search_queries: ["小型床头台灯 米白", "亚麻暖光台灯"]
      }
    ],
    render_instruction: "保持床和床头柜不变，整理小物并增加一盏小型台灯。",
    negative_constraints: ["不改变墙面", "不增加第二盏灯"]
  };
}

test("Prompt Lab 暴露两阶段管线但不持久化实验图片", () => {
  const service = new PromptLabService({
    config: config(),
    planner: async () => {
      throw new Error("not used");
    },
    generator: async () => {
      throw new Error("not used");
    }
  });
  const template = service.template();
  assert.equal(template.schema_version, "1.0");
  assert.equal(template.available, true);
  assert.match(template.prompt_version, /^layout-agent-v/);
  assert.deepEqual(template.pipeline, [
    "layout_planning",
    "render_prompt_build",
    "image_edit"
  ]);
  assert.match(template.prompt, /商品槽位/);
  assert.equal(template.privacy.persisted, false);
});

test("Prompt Lab 先规划，再把确定方案编译成生图指令", async () => {
  let planningInput;
  let renderInput;
  const service = new PromptLabService({
    config: config(),
    planner: async (value) => {
      planningInput = value;
      return {
        sourceType: "live",
        model: "doubao-text-test",
        latencyMs: 400,
        plan: readyPlan()
      };
    },
    generator: async (value) => {
      renderInput = value;
      return {
        sourceType: "live",
        model: "doubao-seedream-5.0-lite",
        latencyMs: 1250,
        mediaType: "image/png",
        bytes: Buffer.from(ONE_PIXEL_PNG, "base64")
      };
    }
  });
  const planningPrompt =
    "分析用户上传的真实家居场景，形成结构化布置方案和可检索的商品槽位。";
  const result = await service.render({
    schema_version: "1.0",
    prompt_version: "layout-test-v1",
    prompt: planningPrompt,
    image_data_url: IMAGE_DATA_URL
  });

  assert.equal(planningInput.prompt, planningPrompt);
  assert.equal(planningInput.imageDataUrl, IMAGE_DATA_URL);
  assert.equal(renderInput.imageDataUrl, IMAGE_DATA_URL);
  assert.match(renderInput.prompt, /小型台灯/);
  assert.match(renderInput.prompt, /完整落在床头柜台面/);
  assert.match(renderInput.prompt, /所有建筑结构和现有家具必须保持完全相同/);
  assert.match(renderInput.prompt, /organize_loose_items 只允许整理/);
  assert.doesNotMatch(renderInput.prompt, /douyin_search_queries/);
  assert.equal(result.planning_latency_ms, 400);
  assert.equal(result.render_latency_ms, 1250);
  assert.equal(result.latency_ms, 1650);
  assert.equal(result.layout_plan.status, "ready");
  assert.equal(result.product_slots[0].slot_id, "product_01");
  assert.equal(result.image_data_url, IMAGE_DATA_URL);
});

test("场景不适用时返回 needs_input，且不消耗图片生成调用", async () => {
  let renderCalls = 0;
  const service = new PromptLabService({
    config: config(),
    planner: async () => ({
      sourceType: "live",
      model: "doubao-text-test",
      latencyMs: 200,
      plan: {
        status: "needs_input",
        needs_input_reason: "当前图片是教室，不属于家居一角工作流。"
      }
    }),
    generator: async () => {
      renderCalls += 1;
      throw new Error("must not be called");
    }
  });

  await assert.rejects(
    () =>
      service.render({
        schema_version: "1.0",
        prompt: "判断当前照片是否属于家居场景，并生成结构化布置方案。",
        image_data_url: IMAGE_DATA_URL
      }),
    (error) =>
      error.code === "prompt_lab_needs_input" &&
      error.statusCode === 422 &&
      /教室/.test(error.message)
  );
  assert.equal(renderCalls, 0);
});

test("规划失败时不继续调用图片模型", async () => {
  let renderCalls = 0;
  const service = new PromptLabService({
    config: config(),
    planner: async () => ({
      sourceType: "fallback",
      reason: "planning_rate_limited",
      message: "布置规划失败，未继续调用图片模型。"
    }),
    generator: async () => {
      renderCalls += 1;
    }
  });

  await assert.rejects(
    () =>
      service.render({
        schema_version: "1.0",
        prompt: "判断当前照片是否属于家居场景，并生成结构化布置方案。",
        image_data_url: IMAGE_DATA_URL
      }),
    (error) =>
      error.code === "planning_rate_limited" && error.statusCode === 429
  );
  assert.equal(renderCalls, 0);
});

test("Prompt Lab 在模型调用前拒绝无效图片和过短 Prompt", async () => {
  let calls = 0;
  const service = new PromptLabService({
    config: config(),
    planner: async () => {
      calls += 1;
    },
    generator: async () => {
      calls += 1;
    }
  });

  await assert.rejects(
    () =>
      service.render({
        schema_version: "1.0",
        prompt: "太短",
        image_data_url: IMAGE_DATA_URL
      }),
    (error) => error.code === "prompt_lab_prompt_invalid"
  );
  await assert.rejects(
    () =>
      service.render({
        schema_version: "1.0",
        prompt: "这是一个足够长的布置规划 Prompt，用来验证非法图片不会被发送给模型。",
        image_data_url: `data:image/jpeg;base64,${ONE_PIXEL_PNG}`
      }),
    (error) => error.code === "prompt_lab_image_invalid"
  );
  assert.equal(calls, 0);
});
