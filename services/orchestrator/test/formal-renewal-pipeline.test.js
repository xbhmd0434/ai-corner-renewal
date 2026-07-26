import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { createOrchestrator } from "../src/workflow.js";
import { FormalRenewalPipeline } from "../src/services/formal-renewal-pipeline.js";
import { buildFormalRenderPrompt } from "../src/prompts/renewal-v2.js";

const IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=";

test("正式效果图视觉校验失败后只回炉一次，并只发布通过版本", async () => {
  const demoConfig = loadConfig({ AI_BACKEND_MODE: "demo" });
  const baseCard = await createOrchestrator({
    config: demoConfig,
    requestIdFactory: () => "formal-pipeline-test"
  }).generate({
    schema_version: "1.0",
    room_input: {
      room_id: "room-test",
      image: { reference: "./assets/desk-before.png", media_type: "image/png" },
      reference_width_cm: 120,
      quality_hint: "clear"
    },
    inspiration_input: {
      inspiration_id: "inspiration-test",
      source_type: "demo",
      style_key: "warm"
    },
    constraints: {
      budget_cny: 500,
      hard_constraints: [],
      soft_preferences: [],
      goals: ["organization"]
    },
    options: { analysis_mode: "demo", include_trace: true }
  });
  baseCard.constraints.hard_constraints = ["keep_desk"];
  baseCard.plan.preserved_elements = ["desk"];

  const layoutPlan = {
    status: "ready",
    scene: {
      scene_type: "desk_corner",
      primary_function: "工作",
      existing_style: "普通",
      dominant_colors: ["白色"],
      main_materials: ["木"],
      lighting: "左侧自然光",
      editable_area: "桌面"
    },
    preserve: [{ object: "墙体", reason: "固定结构" }],
    problems: [],
    design_direction: {
      goal: "暖木质感桌面焕新",
      focal_point: "桌面灯光",
      palette: ["燕麦白"],
      materials: ["浅木"],
      spatial_strategy: "桌面右后侧补光"
    },
    actions: [
      {
        type: "add",
        target: "lighting",
        placement: "desktop_back",
        instruction: "右后侧增加暖光",
        reason: "建立层次"
      }
    ],
    product_slots: [
      {
        slot_id: "supplement-1",
        category: "lighting",
        purpose: "补充暖光",
        quantity: 1,
        size_constraint: "不占主操作区",
        color: "暖白",
        material: "金属",
        placement: "desktop_back",
        support: "桌面",
        clearance_constraints: ["不遮挡显示器"],
        douyin_search_queries: ["暖白桌面灯"]
      }
    ],
    render_instruction: "生成高完成度暖木桌面效果图",
    negative_constraints: ["不要改变机位"]
  };
  const renderPrompts = [];
  let evaluationCalls = 0;
  const pipeline = new FormalRenewalPipeline({
    layoutPlanner: async () => ({
      sourceType: "live",
      model: "planner",
      latencyMs: 1,
      plan: layoutPlan
    }),
    renderGenerator: async ({ promptOverride }) => {
      renderPrompts.push(promptOverride);
      return {
        sourceType: "live",
        model: "renderer",
        latencyMs: 1,
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mediaType: "image/png"
      };
    },
    renderEvaluator: async () => {
      evaluationCalls += 1;
      return {
        sourceType: "live",
        model: "evaluator",
        latencyMs: 1,
        evaluation:
          evaluationCalls === 1
            ? {
                accepted: false,
                scores: {},
                hard_failures: ["camera_changed"],
                repair_instruction: "恢复原始机位并加强暖光焦点"
              }
            : {
                accepted: true,
                scores: {},
                hard_failures: [],
                repair_instruction: ""
              }
      };
    },
    mediaService: {
      getForProvider() {
        return { dataUrl: IMAGE, mediaType: "image/png" };
      }
    },
    config: { ...demoConfig, backendMode: "auto" }
  });

  const output = await pipeline.execute({
    actorId: "actor-test",
    designRequest: {
      input_snapshot: {
        goal: "桌面焕新",
        constraints: { budget_cny: 500 },
        options: { analysis_mode: "auto" },
        space_snapshot: {
          space_version: { media_ids: ["room-media"] }
        },
        reference_snapshots: []
      }
    },
    baseCard,
    roomAnalysis: {
      roomProfile: {
        ...structuredClone(baseCard.room_profile),
        room_type: "live_benchmark_room"
      },
      sourceMode: "live",
      fallback: null
    },
    roomInput: { image: { data_url: IMAGE } },
    persistGeneratedRender: async () =>
      "asset://private-media/accepted-render"
  });

  assert.equal(renderPrompts.length, 2);
  assert.match(renderPrompts[1], /恢复原始机位并加强暖光焦点/);
  assert.equal(output.artifacts.render_attempts.length, 2);
  assert.equal(
    output.artifacts.scene_assessment.room_type,
    "live_benchmark_room"
  );
  assert.equal(output.card.render.after_ref, "asset://private-media/accepted-render");
  assert.equal(output.card.render.is_demo_asset, false);
  assert.ok(output.card.plan.preserved_elements.includes("desk"));
  assert.ok(output.card.plan.preserved_elements.includes("墙体"));
  assert.ok(
    ["pass", "needs_confirmation"].includes(
      output.card.validation.overall_status
    )
  );
});

test("正式渲染提示只把非圈选商品列为补充商品", () => {
  const prompt = buildFormalRenderPrompt({
    layoutPlan: {
      design_direction: { goal: "benchmark" },
      actions: [],
      product_slots: [],
      negative_constraints: []
    },
    sourceComponent: {
      source_component_id: "source-component-lamp",
      selected_catalog_candidate: {
        product_id: "source-product",
        title: "SOURCE_ONLY_NAME"
      }
    },
    styleKey: "warm",
    products: [
      {
        product_id: "source-product",
        name: "SOURCE_ONLY_NAME",
        category: "table_lamp",
        reason: "anchor"
      },
      {
        product_id: "supplement-product",
        name: "SUPPLEMENT_ONLY_NAME",
        category: "desktop_storage",
        reason: "organization"
      }
    ]
  });

  const supplementaryLine = prompt
    .split("\n")
    .find((line) => line.includes("补充商品"));
  assert.ok(supplementaryLine);
  assert.doesNotMatch(supplementaryLine, /SOURCE_ONLY_NAME/);
  assert.match(supplementaryLine, /SUPPLEMENT_ONLY_NAME/);
});
