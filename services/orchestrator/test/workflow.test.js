import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAICard } from "../../../packages/contracts/src/index.js";
import { loadConfig } from "../src/config.js";
import { createOrchestrator } from "../src/workflow.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));

function makeOrchestrator(overrides = {}) {
  let id = 0;
  return createOrchestrator({
    config: loadConfig({}),
    requestIdFactory: () => `req-test-${String(++id).padStart(3, "0")}`,
    now: () => new Date("2026-07-24T16:00:00.000Z"),
    ...overrides
  });
}

test("主案例生成可执行 AICard，硬约束由后端校验", async () => {
  const orchestrator = makeOrchestrator();
  const card = await orchestrator.generate(
    readJson("examples/requests/generate.main.json")
  );

  assertAICard(card);
  assert.equal(card.source_mode, "demo");
  assert.equal(card.status, "ready");
  assert.equal(card.plan.plan_id, "plan-warm-req-test-001-v1");
  assert.equal(card.plan.total_price_cny, 486);
  assert.equal(
    card.validation.checks.find((check) => check.code === "budget").status,
    "pass"
  );
  assert.equal(
    card.validation.checks.find((check) => check.code === "no_drilling").status,
    "pass"
  );
  assert.equal(
    card.validation.checks.find((check) => check.code === "dimensions").status,
    "warn"
  );
});

test("固定 AICard 示例与确定性 Workflow 输出一致", async () => {
  const orchestrator = makeOrchestrator({
    requestIdFactory: () => "req-demo-001"
  });
  const actual = await orchestrator.generate(
    readJson("examples/requests/generate.main.json")
  );
  const expected = readJson("examples/aicard.demo.json");
  assert.deepEqual(actual, expected);
});

test("压到 300 元会创建 v2、真实移除商品并重跑校验", async () => {
  const orchestrator = makeOrchestrator();
  const original = await orchestrator.generate(
    readJson("examples/requests/generate.main.json")
  );
  const revised = await orchestrator.revise({
    schema_version: "1.0",
    request_id: original.request_id,
    plan_id: original.plan.plan_id,
    target_budget_cny: 300
  });

  assertAICard(revised);
  assert.notEqual(revised.request_id, original.request_id);
  assert.equal(revised.plan.version, 2);
  assert.equal(revised.plan.total_price_cny, 240);
  assert.equal(revised.products.length, 4);
  assert.ok(revised.plan.total_price_cny <= 300);
  assert.equal(
    revised.validation.checks.find((check) => check.code === "budget").status,
    "pass"
  );
  assert.ok(
    revised.plan.revision.removed_product_ids.includes("prod-warm-oak-riser")
  );
  assert.equal(original.plan.total_price_cny, 486);
});

test("直接给 300 元预算会重组出 240 元可执行方案", async () => {
  const orchestrator = makeOrchestrator();
  const request = readJson("examples/requests/generate.main.json");
  request.constraints.budget_cny = 300;
  const card = await orchestrator.generate(request);

  assertAICard(card);
  assert.equal(card.status, "ready");
  assert.equal(card.plan.total_price_cny, 240);
  assert.equal(card.products.length, 4);
  assert.ok(card.plan.total_price_cny <= request.constraints.budget_cny);
  assert.equal(
    card.validation.checks.find((check) => check.code === "budget").status,
    "pass"
  );
});

test("同一父方案的多次调整会得到互不碰撞的方案和校验快照", async () => {
  const orchestrator = makeOrchestrator();
  const original = await orchestrator.generate(
    readJson("examples/requests/generate.main.json")
  );
  const to300 = await orchestrator.revise({
    schema_version: "1.0",
    request_id: original.request_id,
    plan_id: original.plan.plan_id,
    target_budget_cny: 300
  });
  const to200 = await orchestrator.revise({
    schema_version: "1.0",
    request_id: original.request_id,
    plan_id: original.plan.plan_id,
    target_budget_cny: 200
  });

  assert.notEqual(to300.plan.plan_id, to200.plan.plan_id);
  assert.notEqual(to300.validation.report_id, to200.validation.report_id);
  assert.equal(to200.plan.total_price_cny, 187);
});

test("v1 预算调整拒绝不降反升的目标，避免无理由切换方案", async () => {
  const orchestrator = makeOrchestrator();
  const original = await orchestrator.generate(
    readJson("examples/requests/generate.main.json")
  );

  await assert.rejects(
    () =>
      orchestrator.revise({
        schema_version: "1.0",
        request_id: original.request_id,
        plan_id: original.plan.plan_id,
        target_budget_cny: 1000
      }),
    {
      code: "target_budget_not_lower",
      statusCode: 422
    }
  );
});

test("预算调整沿用父卡的空间分析时间，不伪装成重新识别", async () => {
  const timestamps = [
    "2026-07-24T16:00:00.000Z",
    "2026-07-24T16:05:00.000Z"
  ];
  const orchestrator = makeOrchestrator({
    now: () => new Date(timestamps.shift())
  });
  const original = await orchestrator.generate(
    readJson("examples/requests/generate.main.json")
  );
  const revised = await orchestrator.revise({
    schema_version: "1.0",
    request_id: original.request_id,
    plan_id: original.plan.plan_id,
    target_budget_cny: 300
  });
  const originalRoomSource = original.data_sources.find(
    (source) => source.kind === "room_analysis"
  );
  const revisedRoomSource = revised.data_sources.find(
    (source) => source.kind === "room_analysis"
  );

  assert.notEqual(revised.generated_at, original.generated_at);
  assert.equal(revisedRoomSource.updated_at, originalRoomSource.updated_at);
});

test("信息不足和预算过低返回可解释的 needs_input", async () => {
  const orchestrator = makeOrchestrator();
  const missingDimension = await orchestrator.generate(
    readJson("examples/requests/generate.missing-dimension.json")
  );
  const lowBudget = await orchestrator.generate(
    readJson("examples/requests/generate.low-budget.json")
  );

  assert.equal(missingDimension.status, "needs_input");
  assert.equal(missingDimension.follow_up.reason_code, "missing_reference_width");
  assert.ok(missingDimension.plan);

  assert.equal(lowBudget.status, "needs_input");
  assert.equal(lowBudget.follow_up.reason_code, "budget_below_minimum");
  assert.equal(lowBudget.plan, null);
  assert.equal(lowBudget.validation, null);
});

test("宠物安全约束会替换商品，并同步替换摆放引用", async () => {
  const orchestrator = makeOrchestrator();
  const card = await orchestrator.generate(
    readJson("examples/requests/generate.pet-friendly.json")
  );

  assert.ok(card.products.every((product) => product.pet_safe === true));
  assert.ok(card.plan.product_ids.includes("prod-pet-safe-faux-plant"));
  assert.ok(
    card.plan.placements.some(
      (placement) => placement.product_id === "prod-pet-safe-faux-plant"
    )
  );
  assert.equal(
    card.validation.checks.find((check) => check.code === "pet_safety").status,
    "pass"
  );
});

test("真实网关失败时返回同协议 fallback，而非法客户端请求仍报错", async () => {
  const config = loadConfig({
    AI_BACKEND_MODE: "live",
    ROOM_ANALYZER_URL: "https://room-analyzer.invalid",
    ROOM_ANALYZER_TIMEOUT_MS: "100"
  });
  const orchestrator = makeOrchestrator({
    config,
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });
  const request = readJson("examples/requests/generate.main.json");
  request.options.analysis_mode = "live";
  const card = await orchestrator.generate(request);

  assertAICard(card);
  assert.equal(card.source_mode, "fallback");
  assert.equal(card.status, "fallback_ready");
  assert.ok(card.notices.some((notice) => notice.code === "upstream_unavailable"));

  const revised = await orchestrator.revise({
    schema_version: "1.0",
    request_id: card.request_id,
    plan_id: card.plan.plan_id,
    target_budget_cny: 300
  });
  assert.equal(revised.source_mode, "fallback");
  assert.equal(revised.status, "fallback_ready");
  assert.ok(
    revised.notices.some((notice) => notice.code === "upstream_unavailable")
  );
  assert.equal(revised.trace[1].status, "fallback");

  request.constraints.budget_cny = 0;
  await assert.rejects(() => orchestrator.generate(request), {
    code: "contract_validation_failed",
    statusCode: 422
  });
});

test("关闭 trace 后预算调整也不会重新写入 trace", async () => {
  const orchestrator = makeOrchestrator();
  const request = readJson("examples/requests/generate.main.json");
  request.options.include_trace = false;
  const original = await orchestrator.generate(request);
  const revised = await orchestrator.revise({
    schema_version: "1.0",
    request_id: original.request_id,
    plan_id: original.plan.plan_id,
    target_budget_cny: 300
  });

  assert.deepEqual(original.trace, []);
  assert.deepEqual(revised.trace, []);
});

test("未接入真实灵感解析时不会把本地样例伪装成用户来源", async () => {
  const orchestrator = makeOrchestrator();
  const card = await orchestrator.generate(
    readJson("examples/requests/generate.blurry.json")
  );

  assert.equal(card.inspiration_profile.source_type, "demo");
  assert.ok(
    card.notices.some(
      (notice) => notice.code === "inspiration_source_not_connected"
    )
  );

  const revised = await orchestrator.revise({
    schema_version: "1.0",
    request_id: card.request_id,
    plan_id: card.plan.plan_id,
    target_budget_cny: 300
  });
  assert.ok(
    revised.notices.some(
      (notice) => notice.code === "inspiration_source_not_connected"
    )
  );
});

test("未知或过期 request_id 明确返回 404，不伪装为调整成功", async () => {
  const orchestrator = makeOrchestrator();
  await assert.rejects(
    () =>
      orchestrator.revise({
        schema_version: "1.0",
        request_id: "req-does-not-exist",
        plan_id: "plan-warm-v1",
        target_budget_cny: 300
      }),
    { code: "card_not_found", statusCode: 404 }
  );
});

test("主方案接入实时 Seedream 后会替换 Demo 图片并独立记录图片来源", async () => {
  let renderCalls = 0;
  let persisted;
  const orchestrator = makeOrchestrator({
    config: loadConfig({
      AI_BACKEND_MODE: "auto",
      AGENT_PLAN_API_KEY: "secret"
    }),
    roomAnalyzer: async (roomInput) => ({
      sourceMode: "live",
      fallback: null,
      roomProfile: {
        room_id: roomInput.room_id,
        room_type: "desk_corner",
        reference_width_cm: roomInput.reference_width_cm,
        fixed_elements: ["wall", "desk", "chair"],
        editable_zones: [
          "desktop",
          "desktop_back",
          "underdesk_right",
          "wall_leaning_zone"
        ],
        lighting: { direction: "left", confidence: 0.9 },
        uncertainties: [],
        needs_confirmation: []
      }
    }),
    renderGenerator: async () => {
      renderCalls += 1;
      return {
        sourceType: "live",
        model: "doubao-seedream-5.0-lite",
        latencyMs: 1200,
        mediaType: "image/png",
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47])
      };
    },
    persistGeneratedRender: (value) => {
      persisted = value;
      return "asset://private-media/media-live-render";
    }
  });
  const request = readJson("examples/requests/generate.main.json");
  request.options.analysis_mode = "live";
  request.room_input.image = {
    data_url: "data:image/png;base64,iVBORw0KGgo=",
    media_type: "image/png"
  };

  const card = await orchestrator.generate(request);

  assertAICard(card);
  assert.equal(renderCalls, 1);
  assert.ok(Buffer.isBuffer(persisted.bytes));
  assert.equal(card.source_mode, "live");
  assert.equal(card.render.is_demo_asset, false);
  assert.equal(
    card.render.after_ref,
    "asset://private-media/media-live-render"
  );
  assert.equal(card.plan.render_ref, card.render.after_ref);
  assert.ok(
    card.notices.some((notice) => notice.code === "live_render_generated")
  );
  assert.equal(
    card.data_sources.find((source) => source.kind === "render_generation")
      .source_type,
    "live"
  );
  assert.ok(
    card.alternatives.every(
      (alternative) => alternative.render.is_demo_asset === true
    )
  );
});
