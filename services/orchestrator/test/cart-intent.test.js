import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

const V2_OPTIONS = { experience_contract: "renewal-card/2.1", analysis_mode: "demo", include_trace: false };

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-cart-"));
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

async function makeReadyDiscoveryRun(runtime) {
  const platform = runtime.platform;
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
  const completedGen = await waitForGen(platform, actorId, started.generation_run_id);
  const planAssetId = completedGen.result.plan_asset_id;
  const planVersionId = completedGen.result.plan_version.plan_version_id;
  const planResource = platform.planService.getPlan(actorId, planAssetId);
  platform.planService.patchPlan(actorId, planAssetId, {
    schema_version: "1.0",
    resource_version: planResource.resource_version,
    changes: { lifecycle: "saved" }
  });
  const discovery = platform.productDiscoveryService.create(actorId, planAssetId, planVersionId, {
    schema_version: "1.0",
    reason: "initial"
  });
  return await waitForDiscovery(platform, actorId, discovery.product_discovery_run_id);
}

test("CartIntent: 全部有效项目返回 search_bundle（默认宿主 Bridge 未接）", async () => {
  const runtime = createRuntime();
  try {
    const run = await makeReadyDiscoveryRun(runtime);
    const list = run.result.implementation_list;
    const items = list.map((item) => ({
      list_item_id: item.list_item_id,
      match_id: item.selected_match_id,
      quantity: 1
    }));
    const intent = runtime.platform.commerceHandoffService.create(
      runtime.platform.actorId,
      run.product_discovery_run_id,
      { schema_version: "1.0", items }
    );
    assert.equal(intent.status, "ready");
    assert.equal(intent.action.type, "search_bundle");
    assert.equal(intent.rejected.length, 0);
    assert.equal(intent.accepted_count, items.length);
    // token 短时、opaque
    assert.ok(intent.action.token && intent.action.token.length >= 20);
    assert.ok(new Date(intent.action.expires_at).getTime() > Date.now());
  } finally {
    await runtime.close();
  }
});

test("CartIntent: 篡改 match_id → reason=match_not_in_subject", async () => {
  const runtime = createRuntime();
  try {
    const run = await makeReadyDiscoveryRun(runtime);
    const first = run.result.implementation_list[0];
    const intent = runtime.platform.commerceHandoffService.create(
      runtime.platform.actorId,
      run.product_discovery_run_id,
      {
        schema_version: "1.0",
        items: [{ list_item_id: first.list_item_id, match_id: "match-fake-non-existent", quantity: 1 }]
      }
    );
    assert.equal(intent.status, "unavailable");
    assert.equal(intent.accepted_count, 0);
    assert.equal(intent.rejected[0].reason_code, "match_not_in_subject");
  } finally {
    await runtime.close();
  }
});

test("CartIntent: 引用不属于该 run 的 list_item → reason=list_item_not_in_run", async () => {
  const runtime = createRuntime();
  try {
    const run = await makeReadyDiscoveryRun(runtime);
    const intent = runtime.platform.commerceHandoffService.create(
      runtime.platform.actorId,
      run.product_discovery_run_id,
      {
        schema_version: "1.0",
        items: [
          { list_item_id: "implementation-item-fake", match_id: "match-fake", quantity: 1 }
        ]
      }
    );
    assert.equal(intent.status, "unavailable");
    assert.equal(intent.rejected[0].reason_code, "list_item_not_in_run");
  } finally {
    await runtime.close();
  }
});

test("CartIntent: 不允许对未 succeeded 的 ProductDiscoveryRun 发起", async () => {
  const runtime = createRuntime();
  try {
    // 建一个假的 run 记录，status=running
    runtime.platform.repository.save("productDiscoveryRuns", runtime.platform.actorId, {
      schema_version: "1.0",
      product_discovery_run_id: "run-not-succeeded",
      plan_asset_id: "plan-x",
      plan_version_id: "plan-version-x",
      render_fingerprint: "sha256:x",
      status: "running",
      stage: "packaging",
      source_mode: null,
      result_state: null,
      retryable: false,
      result: null,
      error: null,
      cancel_requested: false,
      notices: [],
      options: {},
      created_at: "2026-07-25T00:00:00.000Z",
      updated_at: "2026-07-25T00:00:00.000Z"
    });
    let error;
    try {
      runtime.platform.commerceHandoffService.create(
        runtime.platform.actorId,
        "run-not-succeeded",
        { schema_version: "1.0", items: [{ list_item_id: "x", match_id: "y", quantity: 1 }] }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.code, "product_discovery_run_not_succeeded");
  } finally {
    await runtime.close();
  }
});

test("CartIntent: 拒绝重复 list_item 与非法 quantity", async () => {
  const runtime = createRuntime();
  try {
    const run = await makeReadyDiscoveryRun(runtime);
    const first = run.result.implementation_list[0];
    let dupError;
    try {
      runtime.platform.commerceHandoffService.create(
        runtime.platform.actorId,
        run.product_discovery_run_id,
        {
          schema_version: "1.0",
          items: [
            { list_item_id: first.list_item_id, match_id: first.selected_match_id, quantity: 1 },
            { list_item_id: first.list_item_id, match_id: first.selected_match_id, quantity: 1 }
          ]
        }
      );
    } catch (err) {
      dupError = err;
    }
    assert.ok(dupError);
    assert.equal(dupError.code, "cart_intent_invalid");
    let qtyError;
    try {
      runtime.platform.commerceHandoffService.create(
        runtime.platform.actorId,
        run.product_discovery_run_id,
        {
          schema_version: "1.0",
          items: [{ list_item_id: first.list_item_id, match_id: first.selected_match_id, quantity: 0 }]
        }
      );
    } catch (err) {
      qtyError = err;
    }
    assert.ok(qtyError);
    assert.equal(qtyError.code, "cart_intent_invalid");
  } finally {
    await runtime.close();
  }
});

test("CartIntent: 部分项目 rejected 时 status=partial", async () => {
  const runtime = createRuntime();
  try {
    const run = await makeReadyDiscoveryRun(runtime);
    const first = run.result.implementation_list[0];
    const intent = runtime.platform.commerceHandoffService.create(
      runtime.platform.actorId,
      run.product_discovery_run_id,
      {
        schema_version: "1.0",
        items: [
          { list_item_id: first.list_item_id, match_id: first.selected_match_id, quantity: 1 },
          { list_item_id: "implementation-item-fake", match_id: "match-fake", quantity: 1 }
        ]
      }
    );
    assert.equal(intent.status, "partial");
    assert.equal(intent.accepted_count, 1);
    assert.equal(intent.rejected.length, 1);
  } finally {
    await runtime.close();
  }
});
