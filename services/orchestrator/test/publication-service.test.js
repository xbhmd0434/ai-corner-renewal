import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

const V2_OPTIONS = { experience_contract: "renewal-card/2.1", analysis_mode: "demo", include_trace: false };

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-pub-"));
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
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const run = platform.planService.getRun(actorId, runId);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`run ${runId} 未在测试时间内结束`);
}

async function makeSavedPlan(platform) {
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
  const started = platform.planService.startRun(
    actorId,
    design.design_request_id,
    { schema_version: "1.0", reason: "initial" }
  );
  const completed = await waitForRun(platform, actorId, started.generation_run_id);
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

async function waitPublished(platform, actorId, publicationId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const pub = platform.publicationService.get(actorId, publicationId);
    if (["published", "index_failed", "withdrawn"].includes(pub.status)) return pub;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`publication ${publicationId} 未到达终态`);
}

test("保存后发布：Publication 走 indexing → published 且出现在 RelatedDesignRun", async () => {
  const runtime = createRuntime();
  try {
    const { actorId, planAssetId, planVersionId } = await makeSavedPlan(runtime.platform);
    const publication = runtime.platform.publicationService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      title: "我的原木暖光书桌",
      cover_source: "plan_render",
      source_attribution_acknowledged: true
    });
    assert.equal(publication.status, "indexing");
    const finalPub = await waitPublished(runtime.platform, actorId, publication.publication_id);
    assert.equal(finalPub.status, "published");
    // 用 Related run 验证它出现
    const design2 = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "space_reuse",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal_codes: [],
      constraints: {},
      options: V2_OPTIONS
    });
    const relatedRun = runtime.platform.relatedDesignService.create(actorId, design2.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const state = runtime.platform.relatedDesignService.get(actorId, relatedRun.related_design_run_id);
      if (["succeeded", "failed", "cancelled"].includes(state.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const finalRun = runtime.platform.relatedDesignService.get(actorId, relatedRun.related_design_run_id);
    assert.equal(finalRun.status, "succeeded");
    assert.ok(
      finalRun.result.items.some((item) => item.content_id === publication.publication_id),
      "Related run 应召回已发布 Publication"
    );
  } finally {
    await runtime.close();
  }
});

test("draft 方案无法发布：publication_requires_saved_plan", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const design = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal_codes: [],
      constraints: {},
      options: V2_OPTIONS
    });
    const started = runtime.platform.planService.startRun(actorId, design.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    const completed = await waitForRun(runtime.platform, actorId, started.generation_run_id);
    let error;
    try {
      runtime.platform.publicationService.create(
        actorId,
        completed.result.plan_asset_id,
        completed.result.plan_version.plan_version_id,
        {
          schema_version: "1.0",
          title: "draft 试试",
          cover_source: "plan_render",
          source_attribution_acknowledged: true
        }
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.code, "publication_requires_saved_plan");
  } finally {
    await runtime.close();
  }
});

test("同一 PlanVersion 只能有一个未撤下 Publication", async () => {
  const runtime = createRuntime();
  try {
    const { actorId, planAssetId, planVersionId } = await makeSavedPlan(runtime.platform);
    const first = runtime.platform.publicationService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      title: "首发",
      cover_source: "plan_render",
      source_attribution_acknowledged: true
    });
    let error;
    try {
      runtime.platform.publicationService.create(actorId, planAssetId, planVersionId, {
        schema_version: "1.0",
        title: "第二发",
        cover_source: "plan_render",
        source_attribution_acknowledged: true
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.code, "publication_already_exists");
    // 撤下后可再次发布
    runtime.platform.publicationService.withdraw(actorId, first.publication_id);
    const republished = runtime.platform.publicationService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      title: "再发",
      cover_source: "plan_render",
      source_attribution_acknowledged: true
    });
    assert.equal(republished.status, "indexing");
  } finally {
    await runtime.close();
  }
});

test("索引失败可以重试且不影响私人方案", async () => {
  const runtime = createRuntime();
  try {
    const { actorId, planAssetId, planVersionId } = await makeSavedPlan(runtime.platform);
    runtime.platform.publicationService.testFailNextIndexOnce = true;
    const publication = runtime.platform.publicationService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      title: "会失败一次",
      cover_source: "plan_render",
      source_attribution_acknowledged: true
    });
    const failed = await waitPublished(runtime.platform, actorId, publication.publication_id);
    assert.equal(failed.status, "index_failed");
    // 私人方案仍是 saved
    const plan = runtime.platform.planService.getPlan(actorId, planAssetId);
    assert.equal(plan.lifecycle, "saved");
    const retried = runtime.platform.publicationService.retryIndex(actorId, publication.publication_id);
    assert.equal(retried.status, "indexing");
    const finalPub = await waitPublished(runtime.platform, actorId, publication.publication_id);
    assert.equal(finalPub.status, "published");
  } finally {
    await runtime.close();
  }
});

test("撤下后立即不出现在 RelatedDesign", async () => {
  const runtime = createRuntime();
  try {
    const { actorId, planAssetId, planVersionId } = await makeSavedPlan(runtime.platform);
    const publication = runtime.platform.publicationService.create(actorId, planAssetId, planVersionId, {
      schema_version: "1.0",
      title: "先发再撤",
      cover_source: "plan_render",
      source_attribution_acknowledged: true
    });
    await waitPublished(runtime.platform, actorId, publication.publication_id);
    runtime.platform.publicationService.withdraw(actorId, publication.publication_id);

    const design = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "space_reuse",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal_codes: [],
      constraints: {},
      options: V2_OPTIONS
    });
    const relatedRun = runtime.platform.relatedDesignService.create(actorId, design.design_request_id, {
      schema_version: "1.0",
      reason: "initial"
    });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const state = runtime.platform.relatedDesignService.get(actorId, relatedRun.related_design_run_id);
      if (["succeeded", "failed", "cancelled"].includes(state.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const finalRun = runtime.platform.relatedDesignService.get(actorId, relatedRun.related_design_run_id);
    for (const item of finalRun.result.items) {
      assert.notEqual(item.content_id, publication.publication_id, "撤下的 Publication 不能被召回");
    }
  } finally {
    await runtime.close();
  }
});
