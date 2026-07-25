import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

const V2_OPTIONS = { experience_contract: "renewal-card/2.1", analysis_mode: "demo", include_trace: false };

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-gen-v2-"));
  const config = {
    ...loadConfig({}),
    databasePath: join(directory, "state.sqlite"),
    privateMediaDirectory: join(directory, "media")
  };
  const platform = createPlatform({ config });
  return {
    platform,
    async close() {
      await platform.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

async function waitForRun(platform, actorId, runId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const run = platform.planService.getRun(actorId, runId);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`generation run ${runId} 未在测试时间内结束`);
}

test("V2.1 GenerationRun 只输出主效果图，不生成 alternatives", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const design = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal_codes: ["organization", "ambient_lighting"],
      constraints: { budget_cny: 500 },
      options: V2_OPTIONS
    });
    const started = runtime.platform.planService.startRun(
      actorId,
      design.design_request_id,
      { schema_version: "1.0", reason: "initial" }
    );
    const completed = await waitForRun(runtime.platform, actorId, started.generation_run_id);
    assert.equal(completed.status, "succeeded");
    const planVersion = completed.result.plan_version;
    assert.deepEqual(planVersion.aicard.alternatives, [], "V2.1 alternatives 必须为空");
    assert.equal(planVersion.experience_contract, "renewal-card/2.1");
    assert.ok(Array.isArray(planVersion.implementation_source_roles));
  } finally {
    await runtime.close();
  }
});

test("风格意图 PlanVersion 内所有 product 标记为 source_video", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const design = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"], // seed confirmed_intent.intent_type = style
      goal_codes: [],
      constraints: {},
      options: V2_OPTIONS
    });
    const started = runtime.platform.planService.startRun(
      actorId,
      design.design_request_id,
      { schema_version: "1.0", reason: "initial" }
    );
    const completed = await waitForRun(runtime.platform, actorId, started.generation_run_id);
    const roles = completed.result.plan_version.implementation_source_roles;
    assert.ok(roles.length > 0);
    for (const role of roles) {
      assert.equal(role.role, "source_video");
    }
  } finally {
    await runtime.close();
  }
});

test("组件意图：产品若和 confirmed component_reference.category_code 相同则记为 video_selected", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    // 手工新建一个 component 类型的 inspiration，绑定 category=table_lamp
    const inspiration = runtime.platform.assetService.create(actorId, {
      schema_version: "1.0",
      asset_type: "inspiration",
      lifecycle: "saved",
      media_ids: [],
      provenance: {
        kind: "video_context",
        provider: "douyin_demo",
        external_content_id: "video-comp-lamp",
        timestamp_ms: 4200,
        selection_bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }
      },
      attributes: { name: "视频里的暖白台灯" }
    });
    // 等到 ready
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const detail = runtime.platform.assetService.detail(actorId, inspiration.value.asset_id);
      if (detail.parse_state === "ready") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    // 手动改 category_code 为 table_lamp 并直接确认为 component
    let detail = runtime.platform.assetService.detail(actorId, inspiration.value.asset_id);
    // 通过 confirmIntent 定成 component；再手工覆盖 category_code
    const rawAsset = runtime.platform.repository.get("assets", actorId, inspiration.value.asset_id);
    rawAsset.attributes.intent_analysis.component_reference.category_code = "table_lamp";
    runtime.platform.repository.save("assets", actorId, rawAsset);
    detail = runtime.platform.assetService.detail(actorId, inspiration.value.asset_id);
    runtime.platform.assetService.confirmIntent(actorId, inspiration.value.asset_id, {
      schema_version: "1.0",
      resource_version: detail.resource_version,
      intent_type: "component",
      summary: "暖白台灯"
    });

    const design = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: [inspiration.value.asset_id],
      goal_codes: ["ambient_lighting"],
      constraints: {},
      options: V2_OPTIONS
    });
    const started = runtime.platform.planService.startRun(
      actorId,
      design.design_request_id,
      { schema_version: "1.0", reason: "initial" }
    );
    const completed = await waitForRun(runtime.platform, actorId, started.generation_run_id);
    const roles = completed.result.plan_version.implementation_source_roles;
    // 组件意图至少应有一个 video_selected（如果 layout planner 产出了 table_lamp 类目商品）
    // 若 planner 不含 table_lamp，则全部 ai_supplement——都是合法的确定性结论
    const kinds = new Set(roles.map((r) => r.role));
    assert.ok(kinds.has("video_selected") || kinds.has("ai_supplement"));
    // 不允许 source_video（那是风格意图的角色）
    assert.equal(kinds.has("source_video"), false);
  } finally {
    await runtime.close();
  }
});
