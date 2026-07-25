import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";
import { createApiServer } from "../src/server.js";

const silentLogger = { info() {}, error() {} };

async function createTestRuntime(
  directory,
  { configOverrides = {}, fetchImpl } = {}
) {
  const config = {
    ...loadConfig({}),
    ...configOverrides,
    databasePath: join(directory, "state.sqlite"),
    privateMediaDirectory: join(directory, "media")
  };
  const platform = createPlatform({ config, fetchImpl });
  const server = createApiServer({
    orchestrator: platform,
    config,
    logger: silentLogger
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    config,
    platform,
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await platform.close();
    }
  };
}

test("真实图片适配器输出会绑定空间资产并通过私有媒体端点返回", async () => {
  const directory = mkdtempSync(join(tmpdir(), "corner-render-"));
  const onePixelPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=";
  const requestedUrls = [];
  const runtime = await createTestRuntime(directory, {
    configOverrides: {
      ...loadConfig({
        AI_BACKEND_MODE: "auto",
        AGENT_PLAN_API_KEY: "secret"
      })
    },
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    room_type: "desk_corner",
                    fixed_elements: ["wall", "window", "desk", "chair"],
                    editable_zones: [
                      "desktop",
                      "desktop_back",
                      "underdesk_right",
                      "wall_leaning_zone"
                    ],
                    lighting: { direction: "left", confidence: 0.9 },
                    uncertainties: [],
                    needs_confirmation: []
                  })
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          model: "doubao-seedream-5.0-lite",
          data: [{ b64_json: onePixelPng }]
        }),
        { status: 200 }
      );
    }
  });

  try {
    const request = {
      schema_version: "1.0",
      room_input: {
        room_id: "room-live-render",
        image: {
          data_url: `data:image/png;base64,${onePixelPng}`,
          media_type: "image/png"
        },
        reference_width_cm: 120,
        quality_hint: "clear"
      },
      inspiration_input: {
        inspiration_id: "demo-inspiration-warm",
        source_type: "demo",
        style_key: "warm"
      },
      constraints: {
        budget_cny: 500,
        hard_constraints: ["no_drilling", "keep_desk", "keep_chair"],
        soft_preferences: [],
        goals: ["organization"]
      },
      options: { analysis_mode: "live", include_trace: true }
    };
    const generated = await jsonRequest(runtime.baseUrl, "/api/generate", {
      method: "POST",
      body: request
    });

    assert.equal(generated.response.status, 200);
    assert.equal(generated.value.source_mode, "live");
    assert.equal(generated.value.render.is_demo_asset, false);
    assert.match(
      generated.value.render.after_ref,
      /^\/api\/v1\/media\/media-[^/]+\/content\?token=/
    );
    assert.deepEqual(
      requestedUrls.map((url) => new URL(url).pathname),
      [
        "/api/plan/v3/chat/completions",
        "/api/plan/v3/images/generations"
      ]
    );

    const mediaResponse = await fetch(
      `${runtime.baseUrl}${generated.value.render.after_ref}`
    );
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "image/png");
    assert.ok((await mediaResponse.arrayBuffer()).byteLength > 0);
  } finally {
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

async function jsonRequest(baseUrl, path, {
  method = "GET",
  body,
  key,
  headers = {}
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const value = response.status === 204 ? null : await response.json();
  return { response, value };
}

async function waitForRun(baseUrl, runId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { value } = await jsonRequest(
      baseUrl,
      `/api/v1/generation-runs/${runId}`
    );
    if (["succeeded", "failed", "cancelled"].includes(value.status)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`run ${runId} 未在测试时间内结束`);
}

test("v1 CORS、种子资产、幂等重放与冲突", async () => {
  const directory = mkdtempSync(join(tmpdir(), "corner-v1-"));
  const runtime = await createTestRuntime(directory);
  try {
    const preflight = await fetch(`${runtime.baseUrl}/api/v1/assets`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:8765",
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "Content-Type, Idempotency-Key"
      }
    });
    assert.equal(preflight.status, 204);
    assert.match(
      preflight.headers.get("access-control-allow-methods"),
      /PATCH.*DELETE/
    );
    assert.match(
      preflight.headers.get("access-control-allow-headers"),
      /Idempotency-Key/
    );

    const assets = await jsonRequest(runtime.baseUrl, "/api/v1/assets?limit=20");
    assert.equal(assets.response.status, 200);
    assert.equal(assets.value.total, 10);

    const request = {
      schema_version: "1.0",
      asset_type: "inspiration",
      lifecycle: "saved",
      media_ids: [],
      provenance: {
        kind: "video_context",
        provider: "douyin_demo",
        external_content_id: "video-2",
        timestamp_ms: 3200,
        selection_bbox: { x: 0.12, y: 0.18, width: 0.46, height: 0.38 }
      },
      attributes: { name: "原木暖光桌搭" }
    };
    const first = await jsonRequest(runtime.baseUrl, "/api/v1/assets", {
      method: "POST",
      key: "asset-create-001",
      body: request
    });
    const replay = await jsonRequest(runtime.baseUrl, "/api/v1/assets", {
      method: "POST",
      key: "asset-create-001",
      body: request
    });
    assert.equal(first.response.status, 201);
    assert.equal(replay.response.status, 201);
    assert.equal(replay.value.asset_id, first.value.asset_id);

    const conflict = await jsonRequest(runtime.baseUrl, "/api/v1/assets", {
      method: "POST",
      key: "asset-create-001",
      body: {
        ...request,
        attributes: { name: "不同请求" }
      }
    });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.value.error.code, "idempotency_key_reused");
  } finally {
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("私有媒体、空间解析封存与删除级联", async () => {
  const directory = mkdtempSync(join(tmpdir(), "corner-media-"));
  const runtime = await createTestRuntime(directory);
  try {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "room.png");
    form.append("purpose", "space_source");
    const uploadResponse = await fetch(`${runtime.baseUrl}/api/v1/media`, {
      method: "POST",
      headers: { "Idempotency-Key": "media-upload-001" },
      body: form
    });
    const media = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201);
    assert.equal(media.sanitized, true);
    const replayForm = new FormData();
    replayForm.append(
      "file",
      new Blob([png], { type: "image/png" }),
      "room.png"
    );
    replayForm.append("purpose", "space_source");
    const replayUpload = await fetch(`${runtime.baseUrl}/api/v1/media`, {
      method: "POST",
      headers: { "Idempotency-Key": "media-upload-001" },
      body: replayForm
    });
    const replayedMedia = await replayUpload.json();
    assert.equal(replayedMedia.media_id, media.media_id);
    assert.match(replayedMedia.access.url, /token=/);

    const content = await fetch(`${runtime.baseUrl}${media.access.url}`, {
      headers: { Origin: "http://127.0.0.1:8765" }
    });
    assert.equal(content.status, 200);
    assert.equal(content.headers.get("content-type"), "image/png");
    assert.equal(
      content.headers.get("access-control-allow-origin"),
      "http://127.0.0.1:8765"
    );

    const created = await jsonRequest(runtime.baseUrl, "/api/v1/assets", {
      method: "POST",
      key: "space-create-001",
      body: {
        schema_version: "1.0",
        asset_type: "space",
        lifecycle: "temporary",
        media_ids: [media.media_id],
        provenance: { kind: "upload" },
        attributes: {
          name: "测试书桌",
          scene_type: "desk_corner",
          reference_width_cm: 120
        }
      }
    });
    assert.equal(created.response.status, 201);
    let detail;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      detail = (
        await jsonRequest(
          runtime.baseUrl,
          `/api/v1/assets/${created.value.asset_id}`
        )
      ).value;
      if (detail.parse_state === "needs_confirmation") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(detail.parse_state, "needs_confirmation");

    const sealed = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/assets/${created.value.asset_id}/versions/${detail.current_space_version_id}`,
      {
        method: "PATCH",
        body: {
          schema_version: "1.0",
          resource_version: detail.current_space_version.resource_version,
          changes: {
            editable_region_id: "desktop-and-back-wall",
            seal: true
          }
        }
      }
    );
    assert.equal(sealed.response.status, 200);
    assert.equal(sealed.value.state, "sealed");

    const deleted = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/assets/${created.value.asset_id}`,
      { method: "DELETE" }
    );
    assert.equal(deleted.response.status, 204);
    const afterDelete = await fetch(`${runtime.baseUrl}${media.access.url}`);
    assert.equal(afterDelete.status, 404);
  } finally {
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("DesignRequest → GenerationRun → 预算/风格调整 → 幂等重启恢复", async () => {
  const directory = mkdtempSync(join(tmpdir(), "corner-plan-"));
  let runtime = await createTestRuntime(directory);
  let planAssetId;
  let currentVersionId;
  try {
    const designBody = {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal: "更整洁，并增加暖光",
      goal_codes: ["organization", "ambient_lighting"],
      constraints: {
        budget_cny: 300,
        no_drilling: true,
        keep_detected_object_ids: ["detected-space-demo-desk-desk"],
        pet_context: "none"
      },
      editable_region_id: "desktop-and-back-wall",
      options: { analysis_mode: "demo", include_trace: true }
    };
    const design = await jsonRequest(runtime.baseUrl, "/api/v1/design-requests", {
      method: "POST",
      key: "design-create-001",
      body: designBody
    });
    assert.equal(design.response.status, 201);
    assert.equal(design.value.can_start_generation, true);

    const started = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/design-requests/${design.value.design_request_id}/runs`,
      {
        method: "POST",
        key: "run-create-001",
        body: { schema_version: "1.0", reason: "initial" }
      }
    );
    assert.equal(started.response.status, 202);
    const completed = await waitForRun(
      runtime.baseUrl,
      started.value.generation_run_id
    );
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.result.plan_version.aicard.request_id, completed.generation_run_id);
    assert.equal(
      completed.result.plan_version.aicard.plan.plan_id,
      completed.result.plan_version.plan_version_id
    );
    assert.ok(completed.result.plan_version.aicard.plan.total_price_cny <= 300);
    planAssetId = completed.result.plan_asset_id;
    currentVersionId = completed.result.plan_version.plan_version_id;

    const revision = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/plans/${planAssetId}/revisions`,
      {
        method: "POST",
        key: "revision-create-001",
        body: {
          schema_version: "1.0",
          parent_plan_version_id: currentVersionId,
          action: { type: "reduce_budget", target_budget_cny: 200 }
        }
      }
    );
    assert.equal(revision.response.status, 202);
    const revised = await waitForRun(
      runtime.baseUrl,
      revision.value.generation_run_id
    );
    assert.equal(revised.status, "succeeded");
    assert.ok(revised.result.plan_version.aicard.plan.total_price_cny <= 200);
    assert.equal(
      revised.result.plan_version.parent_plan_version_id,
      currentVersionId
    );
    currentVersionId = revised.result.plan_version.plan_version_id;

    const styleDesignBody = structuredClone(designBody);
    styleDesignBody.constraints.budget_cny = 600;
    const styleDesign = await jsonRequest(
      runtime.baseUrl,
      "/api/v1/design-requests",
      {
        method: "POST",
        key: "design-style-001",
        body: styleDesignBody
      }
    );
    const styleStarted = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/design-requests/${styleDesign.value.design_request_id}/runs`,
      {
        method: "POST",
        key: "run-style-001",
        body: { schema_version: "1.0", reason: "initial" }
      }
    );
    const styleInitial = await waitForRun(
      runtime.baseUrl,
      styleStarted.value.generation_run_id
    );
    const styleRevision = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/plans/${styleInitial.result.plan_asset_id}/revisions`,
      {
        method: "POST",
        key: "revision-style-001",
        body: {
          schema_version: "1.0",
          parent_plan_version_id:
            styleInitial.result.plan_version.plan_version_id,
          action: {
            type: "change_style",
            style_key: "green",
            reference_asset_ids: []
          }
        }
      }
    );
    const restyled = await waitForRun(
      runtime.baseUrl,
      styleRevision.value.generation_run_id
    );
    assert.equal(restyled.status, "succeeded");
    assert.equal(restyled.result.plan_version.revision_action.type, "change_style");
    assert.equal(
      restyled.result.plan_version.design_request_snapshot.space_version_id,
      styleInitial.result.plan_version.design_request_snapshot.space_version_id
    );
    assert.equal(
      restyled.result.plan_version.aicard.plan.title,
      "轻绿治愈版"
    );

    const cancelDesignBody = structuredClone(designBody);
    cancelDesignBody.goal = "用于验证取消状态";
    const cancelDesign = await jsonRequest(
      runtime.baseUrl,
      "/api/v1/design-requests",
      {
        method: "POST",
        key: "design-cancel-001",
        body: cancelDesignBody
      }
    );
    const queuedForCancel = runtime.platform.planService.startRun(
      runtime.platform.actorId,
      cancelDesign.value.design_request_id,
      { schema_version: "1.0", reason: "initial" }
    );
    const cancelled = runtime.platform.planService.cancel(
      runtime.platform.actorId,
      queuedForCancel.generation_run_id
    );
    assert.equal(cancelled.status, "cancelled");

    await runtime.close();
    runtime = await createTestRuntime(directory);
    const replayedDesign = await jsonRequest(
      runtime.baseUrl,
      "/api/v1/design-requests",
      {
        method: "POST",
        key: "design-create-001",
        body: designBody
      }
    );
    assert.equal(replayedDesign.response.status, 201);
    assert.equal(
      replayedDesign.value.design_request_id,
      design.value.design_request_id
    );
    const plan = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/plans/${planAssetId}`
    );
    assert.equal(plan.response.status, 200);
    assert.equal(
      plan.response.headers.get("etag"),
      `"resource-version-${plan.value.resource_version}"`
    );
    assert.equal(plan.value.versions.length, 2);
    assert.equal(plan.value.current_plan_version_id, currentVersionId);
  } finally {
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GenerationRun 暴露稳定进度和结构化 needs_input", async () => {
  const directory = mkdtempSync(join(tmpdir(), "corner-run-state-"));
  const runtime = await createTestRuntime(directory);
  try {
    const design = await jsonRequest(runtime.baseUrl, "/api/v1/design-requests", {
      method: "POST",
      key: "design-needs-input-001",
      body: {
        schema_version: "1.0",
        trigger: "space_reuse",
        space_asset_id: "space-demo-desk",
        space_version_id: "space-demo-desk-v1",
        reference_asset_ids: [],
        goal: "预算内先整理桌面",
        goal_codes: ["organization", "low_budget"],
        constraints: {
          budget_cny: 1,
          no_drilling: true,
          keep_detected_object_ids: ["detected-space-demo-desk-desk"],
          pet_context: "none"
        },
        editable_region_id: "desktop-and-back-wall",
        options: { analysis_mode: "demo", include_trace: false }
      }
    });
    assert.equal(design.response.status, 201);

    const started = await jsonRequest(
      runtime.baseUrl,
      `/api/v1/design-requests/${design.value.design_request_id}/runs`,
      {
        method: "POST",
        key: "run-needs-input-001",
        body: { schema_version: "1.0", reason: "initial" }
      }
    );
    assert.equal(started.response.status, 202);
    assert.equal(started.value.progress, 0);
    assert.equal(started.value.needs_input, null);

    const completed = await waitForRun(
      runtime.baseUrl,
      started.value.generation_run_id
    );
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.progress, 100);
    assert.equal(completed.needs_input.reason_code, "budget_below_minimum");
    assert.equal(completed.needs_input.has_preview, false);
    assert.deepEqual(completed.needs_input.required_fields, [
      "constraints.budget_cny"
    ]);
    assert.equal(completed.result.plan_asset_id, null);
    assert.equal(completed.result.aicard.status, "needs_input");
  } finally {
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
