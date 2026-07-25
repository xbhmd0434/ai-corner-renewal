import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

const V2_OPTIONS = { experience_contract: "renewal-card/2.1", analysis_mode: "demo", include_trace: false };

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-impl-list-"));
  const config = {
    ...loadConfig({}),
    databasePath: join(directory, "state.sqlite"),
    privateMediaDirectory: join(directory, "media")
  };
  const platform = createPlatform({ config });
  return {
    platform,
    directory,
    async close() {
      await platform.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

async function waitForGen(platform, actorId, runId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const run = platform.planService.getRun(actorId, runId);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("gen run timeout");
}

async function waitForDiscovery(platform, actorId, runId) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const run = platform.productDiscoveryService.get(actorId, runId);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("discovery run timeout");
}

async function makeSavedV2Plan(platform) {
  const actorId = platform.actorId;
  const design = platform.designRequestService.create(actorId, {
    schema_version: "1.0",
    trigger: "video_apply",
    space_asset_id: "space-demo-desk",
    space_version_id: "space-demo-desk-v1",
    reference_asset_ids: ["inspiration-demo-warm"],
    goal_codes: [],
    constraints: {},
    options: V2_OPTIONS
  });
  const started = platform.planService.startRun(actorId, design.design_request_id, {
    schema_version: "1.0",
    reason: "initial"
  });
  const completed = await waitForGen(platform, actorId, started.generation_run_id);
  const planAssetId = completed.result.plan_asset_id;
  const planVersionId = completed.result.plan_version.plan_version_id;
  const planResource = platform.planService.getPlan(actorId, planAssetId);
  platform.planService.patchPlan(actorId, planAssetId, {
    schema_version: "1.0",
    resource_version: planResource.resource_version,
    changes: { lifecycle: "saved" }
  });
  return { actorId, planAssetId, planVersionId };
}

test("V2.1 ProductDiscoveryRun 结果包含 implementation_list，按 sort_group 排序", async () => {
  const runtime = createRuntime();
  try {
    const { actorId, planAssetId, planVersionId } = await makeSavedV2Plan(runtime.platform);
    const run = runtime.platform.productDiscoveryService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      reason: "initial"
    });
    const completed = await waitForDiscovery(runtime.platform, actorId, run.product_discovery_run_id);
    assert.equal(completed.status, "succeeded");
    const list = completed.result.implementation_list;
    assert.ok(Array.isArray(list) && list.length > 0, "implementation_list 必须为非空数组");
    // 排序：sort_group=0 组的项目应全部排在 sort_group=1 之前
    let previousGroup = -1;
    for (const item of list) {
      assert.ok(item.sort_group >= previousGroup, `${item.list_item_id} 违反 sort_group 单调递增`);
      previousGroup = item.sort_group;
      assert.ok(["video_selected", "source_video", "ai_supplement"].includes(item.origin_type));
      assert.ok(item.selected_match_id, "selected_match_id 必须提供");
    }
    // estimated_total_cny 是所有 selected match price 之和
    assert.equal(typeof completed.result.estimated_total_cny, "number");
    assert.equal(completed.result.currency, "CNY");
  } finally {
    await runtime.close();
  }
});

test("Style 意图：ready 列表全部标记 source_video，位于 sort_group=0", async () => {
  const runtime = createRuntime();
  try {
    const { actorId, planAssetId, planVersionId } = await makeSavedV2Plan(runtime.platform);
    const run = runtime.platform.productDiscoveryService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      reason: "initial"
    });
    const completed = await waitForDiscovery(runtime.platform, actorId, run.product_discovery_run_id);
    const list = completed.result.implementation_list;
    for (const item of list) {
      assert.equal(item.origin_type, "source_video", "style 意图下所有项目应标记 source_video");
      assert.equal(item.sort_group, 0);
    }
  } finally {
    await runtime.close();
  }
});

test("商品去重：同一 product_id 不会出现在两个 list_item", async () => {
  const runtime = createRuntime();
  try {
    const { actorId, planAssetId, planVersionId } = await makeSavedV2Plan(runtime.platform);
    const run = runtime.platform.productDiscoveryService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      reason: "initial"
    });
    const completed = await waitForDiscovery(runtime.platform, actorId, run.product_discovery_run_id);
    const productIds = completed.result.implementation_list.map((item) => {
      const subject = completed.result.subjects.find((s) => s.subject_id === item.subject_id);
      const match = subject.matches.find((m) => m.match_id === item.selected_match_id);
      return match.product_id;
    });
    assert.equal(new Set(productIds).size, productIds.length, "product_id 必须唯一");
  } finally {
    await runtime.close();
  }
});
