import assert from "node:assert/strict";
import { File } from "node:buffer";
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url))
);
const backendRoot = resolve(projectRoot, "..", "..");
const { loadConfig } = await import(
  "../../../services/orchestrator/src/config.js"
);
const { createPlatform } = await import(
  "../../../services/orchestrator/src/platform.js"
);
const { createApiServer } = await import(
  "../../../services/orchestrator/src/server.js"
);
const scratch = mkdtempSync(join(tmpdir(), "douyin-ai-corner-"));
const config = {
  ...loadConfig({ AI_BACKEND_MODE: "demo" }),
  databasePath: join(scratch, "state.sqlite"),
  privateMediaDirectory: join(scratch, "private-media")
};
const platform = createPlatform({ config });
const server = createApiServer({
  orchestrator: platform,
  config,
  logger: { info() {}, error() {} }
});

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForAsset(getAsset, assetId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const asset = await getAsset(assetId);
    if (
      ["needs_confirmation", "ready", "failed"].includes(asset.parse_state)
    ) {
      return asset;
    }
    await wait(10);
  }
  throw new Error("asset parse timeout");
}

async function waitForRun(getGenerationRun, runId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await getGenerationRun(runId);
    if (["succeeded", "failed", "cancelled"].includes(run.status)) {
      return run;
    }
    await wait(10);
  }
  throw new Error("generation run timeout");
}

try {
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  globalThis.__AI_CORNER_API_BASE_URL__ =
    `http://127.0.0.1:${server.address().port}`;

  const {
    uploadMedia,
    createAsset,
    getAsset,
    confirmSpaceVersion,
    createDesignRequest,
    createGenerationRun,
    getGenerationRun,
    getPlanVersion
  } = await import("../douyin-static-demo/api/v1-client.js");
  const {
    confirmVideoInspirationIntent,
    createVideoInspiration
  } = await import(
    "../douyin-static-demo/api/visual-search-client.js"
  );
  const { buildDesignRequest, buildV2DesignRequest } = await import(
    "../douyin-static-demo/adapters/design-task-builder.js"
  );
  const { adaptPlanResult } = await import(
    "../douyin-static-demo/adapters/plan-version-view-model.js"
  );

  const imageBytes = readFileSync(
    resolve(
      backendRoot,
      "apps",
      "web",
      "assets",
      "desk-before.png"
    )
  );
  const file = new File([imageBytes], "integration-room.png", {
    type: "image/png"
  });
  const media = await uploadMedia(file, {
    purpose: "space_source"
  });
  const created = await createAsset({
    schema_version: "1.0",
    asset_type: "space",
    lifecycle: "temporary",
    media_ids: [media.media_id],
    provenance: { kind: "upload" },
    attributes: {
      name: "集成测试空间",
      scene_type: "desk_corner",
      reference_width_cm: 120
    }
  });
  const detail = await waitForAsset(getAsset, created.asset_id);
  assert.equal(detail.parse_state, "needs_confirmation");
  const editableRegionId =
    detail.attributes.editable_regions[0].editable_region_id;
  const sealed = await confirmSpaceVersion(
    detail.asset_id,
    detail.current_space_version.space_version_id,
    { editable_region_id: editableRegionId, seal: true },
    detail.current_space_version.resource_version
  );
  assert.equal(sealed.state, "sealed");

  // 真实走视频页 Client：裁剪图必须先成为 reference_source 媒体，再创建
  // InspirationAsset；不能把视觉搜索候选 ItemAsset 直接交给焕新页。
  const inspirationParsed = await createVideoInspiration({
    cropBlob: new Blob([imageBytes], { type: "image/png" }),
    sourceContext: {
      provider: "douyin_static_demo",
      external_content_id: "integration-video",
      author_display: "@集成测试",
      caption: "集成测试视频灵感",
      timestamp_ms: 1200,
      selection_bbox: {
        x: 0.12,
        y: 0.18,
        width: 0.42,
        height: 0.36
      }
    }
  });
  assert.equal(inspirationParsed.asset_type, "inspiration");
  assert.deepEqual(inspirationParsed.provenance.selection_bbox, {
    x: 0.12,
    y: 0.18,
    width: 0.42,
    height: 0.36
  });
  const inspirationConfirmed = await confirmVideoInspirationIntent(
    inspirationParsed,
    {
    intentType: inspirationParsed.attributes.intent_analysis.suggested_type,
    summary: inspirationParsed.attributes.intent_analysis.summary
    }
  );
  assert.ok(inspirationConfirmed.attributes.confirmed_intent);

  // 穿过真实前端 Builder、HTTP Client 与后端校验，锁定 V2.1 冻结请求体。
  // 该契约要求 goal=""、goal_codes=[]、constraints={}，不能只在两端单测。
  const v2Request = buildV2DesignRequest({
    trigger: "video_apply",
    space_asset_id: detail.asset_id,
    space_version_id: sealed.space_version_id,
    reference_asset_ids: [inspirationConfirmed.asset_id],
    editable_region_id: editableRegionId
  });
  assert.equal(v2Request.goal, "");
  const v2Design = await createDesignRequest(v2Request);
  assert.equal(v2Design.can_start_generation, true);

  const request = buildDesignRequest({
    trigger: "space_upload",
    space_asset_id: detail.asset_id,
    space_version_id: sealed.space_version_id,
    reference_asset_ids: [],
    goal: "让空间更整洁并增加暖光",
    goal_codes: ["organization", "ambient_lighting"],
    constraints: {
      budget_cny: 500,
      no_drilling: true,
      keep_detected_object_ids: [],
      pet_context: "none"
    },
    editable_region_id: editableRegionId,
    options: { analysis_mode: "demo", include_trace: true }
  });
  const design = await createDesignRequest(request);
  assert.equal(design.can_start_generation, true);
  const started = await createGenerationRun(design.design_request_id, {
    schema_version: "1.0",
    reason: "initial"
  });
  const completed = await waitForRun(
    getGenerationRun,
    started.generation_run_id
  );
  assert.equal(completed.status, "succeeded");
  const envelope = await getPlanVersion(
    completed.result.plan_asset_id,
    completed.result.plan_version.plan_version_id
  );
  const viewModel = adaptPlanResult(envelope);
  assert.equal(viewModel.title, "原木呼吸感");
  assert.equal(viewModel.products.length, 6);
  assert.equal(viewModel.steps.length, 4);
  assert.ok(viewModel.totalPriceCny <= 500);

  console.log(
    `integration ok: ${detail.asset_id} -> ${design.design_request_id} -> ${completed.result.plan_asset_id}`
  );
} finally {
  await new Promise((resolveClose) =>
    server.close(() => resolveClose())
  );
  await platform.close();
  rmSync(scratch, { recursive: true, force: true });
}
