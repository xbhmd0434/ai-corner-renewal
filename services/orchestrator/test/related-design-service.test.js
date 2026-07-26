import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

const V2_OPTIONS = { experience_contract: "renewal-card/2.1" };

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-related-"));
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

async function waitForRun(platform, actorId, runId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = platform.relatedDesignService.get(actorId, runId);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`related run ${runId} 未在测试时间内结束`);
}

function makeDesign(platform, actorId) {
  return platform.designRequestService.create(actorId, {
    schema_version: "1.0",
    trigger: "video_apply",
    space_asset_id: "space-demo-desk",
    space_version_id: "space-demo-desk-v1",
    reference_asset_ids: ["inspiration-demo-warm"],
    goal_codes: [],
    constraints: {},
    options: V2_OPTIONS
  });
}

test("RelatedDesignRun 走完状态机、返回 ready/partial/empty 三态之一", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const design = makeDesign(runtime.platform, actorId);
    const run = runtime.platform.relatedDesignService.create(actorId, design.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    assert.equal(run.contract_version, "renewal-card/2.1");
    assert.equal(run.status, "queued");
    const completed = await waitForRun(runtime.platform, actorId, run.related_design_run_id);
    assert.equal(completed.status, "succeeded");
    assert.ok(["ready", "partial", "empty"].includes(completed.result_state));
    assert.equal(completed.source_mode, "fallback");
    // 所有 items 至少必须有 inspiration 或 scene 关系
    for (const item of completed.result.items) {
      assert.ok(
        item.relations.inspiration.strength !== "none" ||
          item.relations.scene.strength !== "none",
        "item 必须至少匹配一维"
      );
    }
  } finally {
    await runtime.close();
  }
});

test("并发创建 RelatedDesignRun 返回 409 related_design_run_active", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const design = makeDesign(runtime.platform, actorId);
    runtime.platform.relatedDesignService.create(actorId, design.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    let conflict;
    try {
      runtime.platform.relatedDesignService.create(actorId, design.design_request_id, {
        schema_version: "1.0",
        reason: "initial"
      });
    } catch (err) {
      conflict = err;
    }
    assert.ok(conflict);
    assert.equal(conflict.code, "related_design_run_active");
  } finally {
    await runtime.close();
  }
});

test("cancel 生效并生成终态", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const design = makeDesign(runtime.platform, actorId);
    const run = runtime.platform.relatedDesignService.create(actorId, design.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    const cancelled = runtime.platform.relatedDesignService.cancel(actorId, run.related_design_run_id);
    assert.equal(cancelled.status, "cancelled");
    // 再次 cancel 返回冲突
    let error;
    try {
      runtime.platform.relatedDesignService.cancel(actorId, run.related_design_run_id);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.code, "related_design_not_cancellable");
  } finally {
    await runtime.close();
  }
});

test("非 renewal-card/2.1 的 DesignRequest 不能创建 RelatedDesignRun", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    // 用非 V2.1 options 创建（不给 experience_contract）
    const legacyDesign = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal_codes: [],
      constraints: {}
    });
    let error;
    try {
      runtime.platform.relatedDesignService.create(actorId, legacyDesign.design_request_id, {
        schema_version: "1.0",
        reason: "initial"
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.code, "related_design_request_invalid");
  } finally {
    await runtime.close();
  }
});

test("重启后恢复：queued 的 run 会继续跑到 succeeded", async () => {
  const runtime = createRuntime();
  const actorId = runtime.platform.actorId;
  const design = makeDesign(runtime.platform, actorId);
  const run = runtime.platform.relatedDesignService.create(actorId, design.design_request_id, {
    schema_version: "1.0",
    reason: "initial"
  });
  await runtime.platform.close();
  // 重新打开 platform，指向同一 sqlite
  const config = {
    ...loadConfig({}),
    databasePath: join(runtime.directory, "state.sqlite"),
    privateMediaDirectory: join(runtime.directory, "media")
  };
  const { createPlatform: create } = await import("../src/platform.js");
  const platform2 = create({ config });
  try {
    const completed = await waitForRun(platform2, actorId, run.related_design_run_id);
    assert.equal(completed.status, "succeeded");
  } finally {
    await platform2.close();
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});

test("未发布的 Publication 永远不出现在 RelatedDesignRun.items 里", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    // 手工写入一条 indexing/withdrawn publication，且相同 scene_type
    runtime.platform.repository.save("publications", actorId, {
      schema_version: "1.0",
      contract_version: "renewal-card/2.1",
      publication_id: "publication-indexing-01",
      plan_asset_id: "plan-x",
      plan_version_id: "plan-version-x",
      status: "indexing",
      visibility: "public",
      title: "示例",
      published_snapshot: {
        scene_type: "desk_corner",
        intent_type: "style",
        source_attribution: "test",
        style_keywords: ["warm"]
      },
      created_at: "2026-07-25T00:00:00.000Z",
      updated_at: "2026-07-25T00:00:00.000Z"
    });
    const design = makeDesign(runtime.platform, actorId);
    const run = runtime.platform.relatedDesignService.create(actorId, design.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    const completed = await waitForRun(runtime.platform, actorId, run.related_design_run_id);
    assert.equal(completed.status, "succeeded");
    // 未 published 的 publication 一定不出现
    for (const item of completed.result.items) {
      assert.notEqual(item.content_id, "publication-indexing-01");
    }
  } finally {
    await runtime.close();
  }
});
