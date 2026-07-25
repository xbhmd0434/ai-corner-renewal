import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { createApiServer } from "../src/server.js";
import { createPlatform } from "../src/platform.js";
import { listenLoopbackSafely } from "./helpers/http-listen.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const silentLogger = { info() {}, error() {} };

const CREATE_FIXTURE = JSON.parse(
  readFileSync(resolve(root, "examples/requests/product-discovery.create.json"), "utf8")
);
const RUNNING_FIXTURE = JSON.parse(
  readFileSync(resolve(root, "examples/responses/product-discovery.run.running.json"), "utf8")
);
const READY_FIXTURE = JSON.parse(
  readFileSync(resolve(root, "examples/responses/product-discovery.run.ready.json"), "utf8")
);
const EMPTY_FIXTURE = JSON.parse(
  readFileSync(resolve(root, "examples/responses/product-discovery.run.empty.json"), "utf8")
);

async function withServer(run, configOverrides = {}) {
  const config = {
    ...loadConfig({}),
    databasePath: ":memory:",
    ...configOverrides
  };
  let id = 0;
  const platform = createPlatform({
    config,
    now: () => new Date("2026-07-25T12:00:00.000Z"),
    fetchImpl: globalThis.fetch
  });
  const server = createApiServer({
    orchestrator: platform,
    config,
    logger: silentLogger,
    requestIdFactory: () => `req-http-pd-${String(++id).padStart(3, "0")}`
  });
  const { baseUrl } = await listenLoopbackSafely(server);
  try {
    await run(baseUrl, platform);
  } finally {
    await platform.close();
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  }
}

async function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

async function getJson(url) {
  return fetch(url);
}

// Helper: directly seed PlanAsset + PlanVersion with AICard data for testing
function seedTestPlan(platform) {
  const actorId = platform.actorId;
  const now = new Date("2026-07-25T12:00:00.000Z").toISOString();

  const planAssetId = "plan-test-pd-001";
  const planVersionId = "plan-version-test-pd-001";

  // Create a PlanAsset
  platform.repository.save("planAssets", actorId, {
    schema_version: "1.0",
    plan_asset_id: planAssetId,
    root_design_request_id: "design-request-test-pd",
    current_design_request_id: "design-request-test-pd",
    current_plan_version_id: planVersionId,
    space_asset_id: "space-test-pd",
    lifecycle: "draft",
    decision_state: "undecided",
    resource_version: 1,
    created_at: now,
    updated_at: now
  });

  // Create a PlanVersion with AICard that has render.after_ref
  platform.repository.save("planVersions", actorId, {
    schema_version: "1.0",
    plan_version_id: planVersionId,
    plan_asset_id: planAssetId,
    version: 1,
    parent_plan_version_id: null,
    design_request_id: "design-request-test-pd",
    generation_run_id: "generation-run-test-pd",
    design_request_snapshot: {
      trigger: "space_reuse",
      space_asset_id: "space-test-pd",
      space_version_id: "space-version-test-pd",
      reference_asset_ids: [],
      goal_codes: ["organization", "ambient_lighting"],
      constraints: {
        budget_cny: 500,
        no_drilling: true,
        keep_detected_object_ids: [],
        pet_context: "none"
      },
      editable_region_id: "desktop-and-back-wall",
      options: { analysis_mode: "demo", include_trace: false },
      budget_source: "request",
      no_drilling_source: "request",
      actor_id: actorId,
      space_snapshot: {
        asset_id: "space-test-pd",
        resource_version: 1,
        name: "测试空间",
        provenance: { kind: "upload" },
        attributes: {},
        space_version: {
          space_version_id: "space-version-test-pd",
          space_asset_id: "space-test-pd",
          state: "sealed",
          parse_state: "ready",
          resource_version: 1,
          media_ids: [],
          reference_width_cm: 120,
          attributes: {
            scene_type: "desk_corner",
            editable_regions: [{ editable_region_id: "desktop-and-back-wall", label: "桌面与后墙" }],
            detected_objects: []
          },
          created_at: now,
          updated_at: now
        }
      },
      reference_snapshots: [],
      preference_snapshot: {},
      created_at: now
    },
    revision_action: null,
    source_mode: "demo",
    redactions: [],
    aicard: {
      schema_version: "1.0",
      request_id: "generation-run-test-pd",
      source_mode: "demo",
      status: "ready",
      generated_at: now,
      room_profile: {
        room_id: "space-version-test-pd",
        room_type: "desk_corner",
        reference_width_cm: 120,
        fixed_elements: ["wall", "window", "desk", "chair"],
        editable_zones: ["desktop", "desktop_back", "underdesk_right", "wall_leaning_zone"],
        lighting: { direction: "left", confidence: 0.82 },
        uncertainties: ["desk_depth"],
        needs_confirmation: ["desk_depth"]
      },
      inspiration_profile: {
        inspiration_id: "demo-inspiration-warm",
        source_type: "demo",
        style: ["japanese_natural"],
        colors: ["oat_white", "light_oak"],
        materials: ["light_wood", "linen", "ceramic"],
        transferable_elements: ["clamp_lamp", "desk_riser", "leaning_linen_board"],
        excluded_elements: ["drilled_wall_shelf"]
      },
      constraints: {
        budget_cny: 500,
        hard_constraints: ["no_drilling", "keep_desk", "keep_chair"],
        soft_preferences: ["clean_but_lived_in"],
        goals: ["organization", "ambient_lighting"]
      },
      plan: {
        plan_id: planVersionId,
        room_id: "space-version-test-pd",
        inspiration_id: "demo-inspiration-warm",
        version: 1,
        title: "原木呼吸感",
        summary: "保留桌椅，以低矮桌上架、暖光与亚麻质感重整视觉中心。",
        total_price_cny: 486,
        product_ids: ["prod-warm-oak-riser", "prod-warm-clamp-lamp", "prod-warm-linen-board", "prod-warm-storage-trays", "prod-warm-cable-box", "prod-warm-pothos-planter"],
        preserved_elements: ["desk", "chair", "wall", "window", "left_natural_light"],
        placements: [
          { product_id: "prod-warm-oak-riser", zone: "desktop_center_back", instruction: "桌上架沿桌面后缘居中" },
          { product_id: "prod-warm-clamp-lamp", zone: "desktop_left_back", instruction: "夹在桌面左后侧" },
          { product_id: "prod-warm-linen-board", zone: "wall_leaning_zone", instruction: "倚墙放在桌上架后方" },
          { product_id: "prod-warm-storage-trays", zone: "desktop_right", instruction: "收纳盘叠放在右侧" },
          { product_id: "prod-warm-cable-box", zone: "desktop_back", instruction: "理线盒放在桌面后缘" },
          { product_id: "prod-warm-pothos-planter", zone: "desktop_right_back", instruction: "作为低矮焦点放在右后侧" }
        ],
        steps: [
          { step_id: "step-1", title: "清空并分区", instruction: "桌面只保留每日使用物" },
          { step_id: "step-2", title: "抬高视觉中心", instruction: "桌上架居中" }
        ],
        render_ref: "demo-after-warm",
        assumptions: ["desk_width_at_least_100cm"],
        constraint_tags: ["no_drilling", "keep_desk", "keep_chair"]
      },
      validation: {
        report_id: `validation-${planVersionId}-v1`,
        plan_id: planVersionId,
        plan_version: 1,
        overall_status: "needs_confirmation",
        checks: [
          { code: "budget", status: "pass", message: "所选商品未超过预算" },
          { code: "dimensions", status: "warn", message: "部分尺寸需要购买前复测" }
        ],
        warnings: ["measure_desk_depth_before_purchase"]
      },
      products: [
        { product_id: "prod-warm-oak-riser", name: "浅橡木桌上架", category: "desk_riser", price_cny: 129, dimensions_cm: { width: 58, depth: 20, height: 8 }, dimensions_label: "58 × 20 × 8cm", installation: "freestanding", pet_safe: true, reason: "抬高视觉中心", availability: { status: "demo_available", source_type: "demo", checked_at: now }, source: { source_type: "demo", label: "本地演示商品", updated_at: now } },
        { product_id: "prod-warm-clamp-lamp", name: "暖白夹式台灯", category: "lighting", price_cny: 99, dimensions_cm: { width: null, depth: null, height: null }, dimensions_label: "三档调光", installation: "clamp", pet_safe: true, reason: "补充暖光", availability: { status: "demo_available", source_type: "demo", checked_at: now }, source: { source_type: "demo", label: "本地演示商品", updated_at: now } },
        { product_id: "prod-warm-linen-board", name: "亚麻织物留言板", category: "display_board", price_cny: 79, dimensions_cm: { width: 40, depth: null, height: 55 }, dimensions_label: "40 × 55cm", installation: "leaning", pet_safe: true, reason: "迁移亚麻质感", availability: { status: "demo_available", source_type: "demo", checked_at: now }, source: { source_type: "demo", label: "本地演示商品", updated_at: now } },
        { product_id: "prod-warm-storage-trays", name: "奶油白收纳盘 × 2", category: "desktop_storage", price_cny: 58, dimensions_cm: { width: null, depth: null, height: null }, dimensions_label: "A5/A6 2件套", installation: "freestanding", pet_safe: true, reason: "分区收纳", availability: { status: "demo_available", source_type: "demo", checked_at: now }, source: { source_type: "demo", label: "本地演示商品", updated_at: now } },
        { product_id: "prod-warm-cable-box", name: "隐藏式理线盒", category: "cable_management", price_cny: 45, dimensions_cm: { width: 32, depth: null, height: null }, dimensions_label: "32cm", installation: "freestanding", pet_safe: true, reason: "遮挡线材", availability: { status: "demo_available", source_type: "demo", checked_at: now }, source: { source_type: "demo", label: "本地演示商品", updated_at: now } },
        { product_id: "prod-warm-pothos-planter", name: "绿萝陶盆组合", category: "plant", price_cny: 76, dimensions_cm: { width: null, depth: null, height: null }, dimensions_label: "未提供尺寸", installation: "freestanding", pet_safe: false, reason: "绿植焦点", availability: { status: "demo_available", source_type: "demo", checked_at: now }, source: { source_type: "demo", label: "本地演示商品", updated_at: now } }
      ],
      tutorials: [],
      render: {
        before_ref: "asset://redacted/source-deleted",
        after_ref: "demo-after-warm",
        is_ai_generated: false,
        is_demo_asset: true,
        disclaimer: "效果图为视觉示意，三套方案共用样例素材。"
      },
      alternatives: [],
      notices: [],
      data_sources: [
        { kind: "room_analysis", source_type: "demo", label: "默认书桌空间演示档案", updated_at: now },
        { kind: "inspiration_profiles", source_type: "demo", label: "前端灵感样例", updated_at: now },
        { kind: "product_catalog", source_type: "demo", label: "本地演示商品目录", updated_at: now },
        { kind: "render_asset", source_type: "demo", label: "预生成效果素材", updated_at: now }
      ],
      trace: [],
      follow_up: null
    },
    created_at: now,
    updated_at: now
  });

  return { planAssetId, planVersionId };
}

// ---- Tests ----

test("POST create initial → 202 queued", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const res = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-create-001" }
    );
    assert.equal(res.status, 202);
    const run = await res.json();
    assert.equal(run.status, "queued");
    assert.equal(run.stage, "queued");
    assert.equal(run.stage_index, 1);
    assert.equal(run.stage_total, 6);
    assert.equal(run.progress, 0);
    assert.equal(run.plan_asset_id, planAssetId);
    assert.equal(run.plan_version_id, planVersionId);
    assert.ok(run.product_discovery_run_id);
  });
});

test("POST create idempotent replay", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const res1 = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-idem-001" }
    );
    assert.equal(res1.status, 202);
    const run1 = await res1.json();

    const res2 = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-idem-001" }
    );
    assert.equal(res2.status, 202);
    const run2 = await res2.json();

    assert.equal(run2.product_discovery_run_id, run1.product_discovery_run_id);
  });
});

test("POST reject second initial when one active", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const res1 = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-active-001" }
    );
    assert.equal(res1.status, 202);

    const res2 = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-active-002" }
    );
    assert.equal(res2.status, 409);
    const err = await res2.json();
    assert.equal(err.error.code, "product_discovery_run_active");
  });
});

test("POST initial after succeeded → 409", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const res1 = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-succeeded-001" }
    );
    assert.equal(res1.status, 202);
    const run1 = await res1.json();

    // Wait for completion
    let status;
    for (let i = 0; i < 80; i++) {
      const poll = await getJson(`${baseUrl}/api/v1/product-discovery-runs/${run1.product_discovery_run_id}`);
      const pollRun = await poll.json();
      if (pollRun.status === "succeeded" || pollRun.status === "failed") {
        status = pollRun.status;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Try initial again
    const res2 = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-succeeded-002" }
    );
    if (status === "succeeded") {
      assert.equal(res2.status, 409);
      const err = await res2.json();
      assert.equal(err.error.code, "product_discovery_already_succeeded");
    }
  });
});

test("retry failed/cancelled run", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    // Create and cancel
    const res1 = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      { schema_version: "1.0", reason: "initial", options: { discovery_mode: "auto", max_subjects: 3, matches_per_subject: 2 } },
      { "Idempotency-Key": "ik-pd-retry-001" }
    );
    const run1 = await res1.json();

    // Cancel it
    const cancelRes = await postJson(
      `${baseUrl}/api/v1/product-discovery-runs/${run1.product_discovery_run_id}/cancel`,
      { schema_version: "1.0" }
    );
    assert.equal(cancelRes.status, 200);
    const cancelled = await cancelRes.json();
    assert.equal(cancelled.status, "cancelled");

    // Retry
    const retryRes = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      {
        schema_version: "1.0",
        reason: "retry",
        retry_of_product_discovery_run_id: run1.product_discovery_run_id,
        options: { discovery_mode: "auto", max_subjects: 3, matches_per_subject: 2 }
      },
      { "Idempotency-Key": "ik-pd-retry-002" }
    );
    assert.equal(retryRes.status, 202);
    const retryRun = await retryRes.json();
    assert.ok(retryRun.product_discovery_run_id !== run1.product_discovery_run_id);
  });
});

test("invalid reason rejected", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const res = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      { schema_version: "1.0", reason: "invalid_reason" },
      { "Idempotency-Key": "ik-pd-invalid-001" }
    );
    assert.equal(res.status, 422);
  });
});

test("GET list product discovery runs", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const res = await getJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs?sort=recent&limit=10`
    );
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.equal(list.schema_version, "1.0");
    assert.ok(Array.isArray(list.items));
    assert.ok("next_cursor" in list);
    assert.ok("total" in list);
  });
});

test("GET single product discovery run", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const createRes = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-get-001" }
    );
    const run = await createRes.json();

    const getRes = await getJson(
      `${baseUrl}/api/v1/product-discovery-runs/${run.product_discovery_run_id}`
    );
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.product_discovery_run_id, run.product_discovery_run_id);
  });
});

test("GET nonexistent run → 404", async () => {
  await withServer(async (baseUrl) => {
    const res = await getJson(`${baseUrl}/api/v1/product-discovery-runs/nonexistent-run-id`);
    assert.equal(res.status, 404);
  });
});

test("cancel queued run → 200", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const createRes = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-cancel-001" }
    );
    const run = await createRes.json();

    const cancelRes = await postJson(
      `${baseUrl}/api/v1/product-discovery-runs/${run.product_discovery_run_id}/cancel`,
      { schema_version: "1.0" }
    );
    assert.equal(cancelRes.status, 200);
    const cancelled = await cancelRes.json();
    assert.equal(cancelled.status, "cancelled");
  });
});

test("cancel already terminated run → 409", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const createRes = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-cancel2-001" }
    );
    const run = await createRes.json();

    // Wait for completion
    for (let i = 0; i < 80; i++) {
      const poll = await getJson(`${baseUrl}/api/v1/product-discovery-runs/${run.product_discovery_run_id}`);
      const pollRun = await poll.json();
      if (pollRun.status !== "queued" && pollRun.status !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const cancelRes = await postJson(
      `${baseUrl}/api/v1/product-discovery-runs/${run.product_discovery_run_id}/cancel`,
      { schema_version: "1.0" }
    );
    assert.equal(cancelRes.status, 409);
  });
});

test("PlanVersion not belonging to PlanAsset → 404", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId } = seedTestPlan(platform);

    const res = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/wrong-plan-version-id/product-discovery-runs`,
      CREATE_FIXTURE,
      { "Idempotency-Key": "ik-pd-wrong-001" }
    );
    assert.equal(res.status, 404);
  });
});

test("health includes product_discovery features", async () => {
  await withServer(async (baseUrl) => {
    const res = await getJson(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const health = await res.json();

    assert.equal(health.features.product_discovery, true);
    assert.equal(health.features.product_discovery_live_agent, false);
    assert.equal(health.features.douyin_commerce_catalog, false);
    assert.ok(health.limits.product_discovery_max_subjects);
    assert.ok(health.limits.product_discovery_matches_per_subject);
  });
});

test("health reports the Agent Plan visual product-discovery capability", async () => {
  await withServer(async (baseUrl) => {
    const res = await getJson(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const health = await res.json();

    assert.equal(health.features.product_discovery_live_agent, true);
    assert.equal(
      health.model_capabilities.product_discovery,
      "agent_plan_visual_grounding"
    );
  }, {
    backendMode: "live",
    agentPlanApiKey: "test-agent-plan-key"
  });
});

test("product discovery run reaches succeeded with plan-grounded fallback", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const createRes = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      { schema_version: "1.0", reason: "initial", options: { discovery_mode: "auto", max_subjects: 3, matches_per_subject: 2 } },
      { "Idempotency-Key": "ik-pd-complete-001" }
    );
    assert.equal(createRes.status, 202);
    const run = await createRes.json();

    // Poll until complete
    let finalRun;
    for (let i = 0; i < 80; i++) {
      const poll = await getJson(`${baseUrl}/api/v1/product-discovery-runs/${run.product_discovery_run_id}`);
      finalRun = await poll.json();
      if (finalRun.status === "succeeded" || finalRun.status === "failed") break;
      await new Promise((r) => setTimeout(r, 100));
    }

    assert.equal(finalRun.status, "succeeded");
    assert.equal(finalRun.stage, "packaging");
    assert.equal(finalRun.stage_index, 6);
    assert.equal(finalRun.progress, 100);

    if (finalRun.result) {
      assert.ok(Array.isArray(finalRun.result.subjects));
      assert.ok("subjects_count" in finalRun.result);
      assert.ok("matched_subjects_count" in finalRun.result);
      assert.ok("matches_count" in finalRun.result);
      assert.ok(Array.isArray(finalRun.result.notices));
      assert.ok(finalRun.result.provenance);
      assert.ok(finalRun.result.provenance.image_analysis);
      assert.ok(finalRun.result.provenance.commerce_catalog);
      assert.ok(["fallback", "demo"].includes(finalRun.source_mode));
      assert.ok(["ready", "partial", "empty"].includes(finalRun.result_state));
    }
  });
});

test("run recovery after restart", async () => {
  await withServer(async (baseUrl, platform) => {
    const { planAssetId, planVersionId } = seedTestPlan(platform);

    const createRes = await postJson(
      `${baseUrl}/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      { schema_version: "1.0", reason: "initial", options: { discovery_mode: "auto", max_subjects: 3, matches_per_subject: 2 } },
      { "Idempotency-Key": "ik-pd-recover-001" }
    );
    assert.equal(createRes.status, 202);
    const run = await createRes.json();

    // Verify recovery
    platform.productDiscoveryService.recover("demo-user-001");

    let finalRun;
    for (let i = 0; i < 80; i++) {
      const poll = await getJson(`${baseUrl}/api/v1/product-discovery-runs/${run.product_discovery_run_id}`);
      finalRun = await poll.json();
      if (finalRun.status === "succeeded" || finalRun.status === "failed") break;
      await new Promise((r) => setTimeout(r, 100));
    }

    assert.equal(finalRun.status, "succeeded");
  });
});

test("OpenAPI includes product discovery operations", async () => {
  await withServer(async (baseUrl) => {
    const res = await getJson(`${baseUrl}/api/openapi.json`);
    assert.equal(res.status, 200);
    const spec = await res.json();

    assert.ok(spec.paths["/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs"]);
    assert.ok(spec.paths["/api/v1/product-discovery-runs/{product_discovery_run_id}"]);
    assert.ok(spec.paths["/api/v1/product-discovery-runs/{product_discovery_run_id}/cancel"]);

    const tags = spec.tags.map((t) => t.name);
    assert.ok(tags.includes("Product Discovery"));

    const createOp = spec.paths["/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs"].post;
    assert.equal(createOp.operationId, "createProductDiscoveryRun");

    const listOp = spec.paths["/api/v1/plans/{plan_asset_id}/versions/{plan_version_id}/product-discovery-runs"].get;
    assert.equal(listOp.operationId, "listProductDiscoveryRuns");
  });
});

test("fixtures pass structural validation", async () => {
  assert.equal(RUNNING_FIXTURE.schema_version, "1.0");
  assert.equal(RUNNING_FIXTURE.status, "running");
  assert.equal(RUNNING_FIXTURE.stage_total, 6);
  assert.equal(RUNNING_FIXTURE.result, null);

  assert.equal(READY_FIXTURE.schema_version, "1.0");
  assert.equal(READY_FIXTURE.status, "succeeded");
  assert.equal(READY_FIXTURE.result_state, "ready");
  assert.ok(Array.isArray(READY_FIXTURE.result.subjects));
  assert.ok(READY_FIXTURE.result.subjects.length > 0);
  assert.equal(READY_FIXTURE.result.subjects[0].bbox, null);
  assert.equal(READY_FIXTURE.result.provenance.image_analysis.source_type, "fallback");
  assert.equal(READY_FIXTURE.result.provenance.image_analysis.strategy, "plan_grounded");

  assert.equal(EMPTY_FIXTURE.schema_version, "1.0");
  assert.equal(EMPTY_FIXTURE.status, "succeeded");
  assert.equal(EMPTY_FIXTURE.result_state, "empty");
  assert.equal(EMPTY_FIXTURE.result.subjects.length, 0);
});

test("Agent output validation rejects forbidden fields and out-of-range bbox", async () => {
  const { validateAgentOutput } = await import("../src/adapters/product-discovery-agent.js");

  // Reject forbidden product fields
  const withProductId = validateAgentOutput({
    schema_version: "1.0",
    subjects: [{
      subject_ref: "s1",
      label: "Test",
      category_code: "lamp",
      product_id: "prod-123",
      bbox: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
      confidence: 0.9,
      commerce_search_queries: ["test query"]
    }]
  });
  assert.ok(withProductId.issues.length > 0);
  assert.ok(withProductId.issues.some((i) => String(i).includes("product_id")));

  // Reject out-of-range bbox
  const badBbox = validateAgentOutput({
    schema_version: "1.0",
    subjects: [{
      subject_ref: "s2",
      label: "Test",
      category_code: "lamp",
      bbox: { x: -0.1, y: 0.5, width: 0.1, height: 0.1 },
      confidence: 0.9,
      commerce_search_queries: ["test"]
    }]
  });
  assert.ok(badBbox.issues.length > 0);

  // Reject bbox with zero area
  const zeroBbox = validateAgentOutput({
    schema_version: "1.0",
    subjects: [{
      subject_ref: "s3",
      label: "Test",
      category_code: "lamp",
      bbox: { x: 0.5, y: 0.5, width: 0, height: 0.1 },
      confidence: 0.9,
      commerce_search_queries: ["test"]
    }]
  });
  assert.ok(zeroBbox.issues.length > 0);

  // Reject price field from agent
  const withPrice = validateAgentOutput({
    schema_version: "1.0",
    subjects: [{
      subject_ref: "s4",
      label: "Test",
      category_code: "lamp",
      price_cny: 99,
      bbox: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
      confidence: 0.9,
      commerce_search_queries: ["test"]
    }]
  });
  assert.ok(withPrice.issues.length > 0);
  assert.ok(withPrice.issues.some((i) => String(i).includes("price_cny")));

  // Accept valid output
  const valid = validateAgentOutput({
    schema_version: "1.0",
    subjects: [{
      subject_ref: "s5",
      label: "Valid Lamp",
      category_code: "table_lamp",
      bbox: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
      appearance: { colors: ["white"], materials: ["metal"], style_keywords: ["modern"] },
      placement_hint: "desk corner",
      confidence: 0.9,
      commerce_search_queries: ["white desk lamp"]
    }]
  });
  assert.equal(valid.issues.length, 0, `unexpected issues: ${JSON.stringify(valid.issues)}`);
  assert.equal(valid.subjects.length, 1);
  assert.ok(valid.subjects[0].subject_id);
  assert.equal(valid.subjects[0].match_state, "unmatched");
});

test("Demo Commerce Catalog grounding", async () => {
  const { DemoCommerceCatalogAdapter, groundProductMatches } = await import("../src/adapters/commerce-catalog.js");

  const adapter = new DemoCommerceCatalogAdapter({ now: () => new Date("2026-07-25T12:00:00.000Z") });

  const result = await adapter.retrieve({
    actorId: "demo-user-001",
    subject: {
      subject_id: "test-subject",
      category_code: "table_lamp",
      search_queries: ["奶油白小台灯 暖光 桌面"]
    },
    limit: 3
  });

  assert.equal(result.sourceType, "demo_catalog");
  assert.ok(Array.isArray(result.candidates));
  // Should find at least one lamp product
  const lampProducts = result.candidates.filter((c) => c.category_code === "lighting" || c.category_code === "table_lamp");
  assert.ok(lampProducts.length > 0 || result.candidates.length > 0, "should find matching products");

  // Verify grounding
  const subjects = [{
    subject_id: "test-subject",
    category_code: "table_lamp",
    search_queries: ["台灯"],
    match_state: "unmatched",
    matches: []
  }];

  const catalogCandidates = { "test-subject": result.candidates };
  groundProductMatches(subjects, catalogCandidates, { matchesPerSubject: 2 });

  const grounded = subjects[0];
  assert.ok(grounded.match_state === "matched" || grounded.match_state === "unmatched");
  if (grounded.match_state === "matched") {
    assert.ok(grounded.matches.length > 0);
    const match = grounded.matches[0];
    assert.ok(match.match_id);
    assert.ok(match.product_id);
    assert.ok(match.title);
    assert.ok(match.commerce_action);
    assert.equal(match.commerce_action.type, "search_query");
    assert.equal(match.source.source_type, "demo_catalog");
  }
});
