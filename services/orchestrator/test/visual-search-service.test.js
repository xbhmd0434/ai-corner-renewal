import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";
import { createApiServer } from "../src/server.js";
import { listenLoopbackSafely } from "./helpers/http-listen.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const IMAGE = `data:image/png;base64,${ONE_PIXEL_PNG.toString("base64")}`;

test("视频圈选裁剪图经识别和候选确认后成为稳定 SourceComponent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "corner-visual-search-"));
  const config = {
    ...loadConfig({ AI_BACKEND_MODE: "demo" }),
    databasePath: join(directory, "state.sqlite"),
    privateMediaDirectory: join(directory, "media")
  };
  const platform = createPlatform({ config });
  try {
    const actorId = platform.actorId;
    const media = platform.mediaService.create(actorId, {
      file: {
        filename: "component.png",
        contentType: "image/png",
        bytes: ONE_PIXEL_PNG
      },
      purpose: "visual_search_query",
      retention: "temporary"
    });
    await assert.rejects(
      platform.createVisualSearchQuery(actorId, {
        schema_version: "1.0",
        query_media_id: media.media_id,
        source_context: {
          provider: "douyin",
          external_content_id: "video-001",
          timestamp_ms: 1234,
          selection_bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
          full_frame_data_url: IMAGE
        }
      }),
      (error) => error.code === "visual_search_source_invalid"
    );
    const query = await platform.createVisualSearchQuery(actorId, {
      schema_version: "1.0",
      query_media_id: media.media_id,
      source_context: {
        provider: "douyin",
        external_content_id: "video-001",
        author_display: "测试作者",
        caption: "桌面增高架改造",
        timestamp_ms: 1234,
        selection_bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }
      },
      options: {
        max_candidates: 3,
        search_scope: ["same_item", "similar_item"]
      }
    });
    assert.equal(query.status, "succeeded");
    assert.equal(query.component_identity.category_code, "desk_riser");
    assert.ok(query.candidates.length > 0);

    const selection = platform.selectVisualSearchCandidate(
      actorId,
      query.visual_search_query_id,
      {
        schema_version: "1.0",
        candidate_id: query.candidates[0].candidate_id,
        asset_lifecycle: "saved",
        modeling_mode: "preview_2d"
      }
    );
    assert.equal(selection.asset.parse_state, "ready");
    assert.equal(selection.source_component.immutable_anchor, true);
    assert.equal(selection.source_component.query_media_id, media.media_id);

    const detail = platform.assetService.detail(
      actorId,
      selection.asset.asset_id
    );
    assert.equal(
      detail.attributes.source_component.source_component_id,
      selection.source_component.source_component_id
    );
    assert.equal(detail.provenance.timestamp_ms, 1234);
    assert.equal(
      platform.repository.get("media", actorId, media.media_id)
        .retention_expires_at,
      null
    );

    const design = platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: [selection.asset.asset_id],
      goal_codes: ["organization", "ambient_lighting"],
      constraints: { budget_cny: 500 },
      options: {
        analysis_mode: "demo",
        include_trace: true,
        experience_contract: "renewal-card/2.1"
      }
    });
    const started = platform.planService.startRun(
      actorId,
      design.design_request_id,
      { schema_version: "1.0", reason: "initial" }
    );
    let completed;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      completed = platform.planService.getRun(
        actorId,
        started.generation_run_id
      );
      if (["succeeded", "failed"].includes(completed.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(
      completed.status,
      "succeeded",
      JSON.stringify(
        platform.repository.get(
          "generationRuns",
          actorId,
          started.generation_run_id
        ).failure_diagnostics || null
      )
    );
    const artifacts = completed.result.plan_version.pipeline_artifacts;
    assert.equal(
      artifacts.source_component.source_component_id,
      selection.source_component.source_component_id
    );
    assert.ok(
      artifacts.layout_plan.actions.some(
        (action) =>
          action.target ===
          `source_component:${selection.source_component.source_component_id}`
      )
    );
    assert.ok(
      artifacts.product_slots.every(
        (slot) =>
          slot.category !== selection.source_component.category_code
      )
    );
  } finally {
    await platform.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("视觉搜索三条 HTTP 路由与前端请求形状闭环", async () => {
  const directory = mkdtempSync(join(tmpdir(), "corner-visual-search-http-"));
  const config = {
    ...loadConfig({ AI_BACKEND_MODE: "demo" }),
    databasePath: join(directory, "state.sqlite"),
    privateMediaDirectory: join(directory, "media")
  };
  const platform = createPlatform({ config });
  const server = createApiServer({
    orchestrator: platform,
    config,
    logger: { info() {}, error() {} }
  });
  const { baseUrl } = await listenLoopbackSafely(server);
  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([ONE_PIXEL_PNG], { type: "image/png" }),
      "component.png"
    );
    form.append("purpose", "visual_search_query");
    form.append("retention", "temporary");
    const uploadResponse = await fetch(`${baseUrl}/api/v1/media`, {
      method: "POST",
      headers: { "Idempotency-Key": "visual-media-001" },
      body: form
    });
    const media = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201);

    const queryResponse = await fetch(
      `${baseUrl}/api/v1/visual-search/queries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "visual-query-001"
        },
        body: JSON.stringify({
          schema_version: "1.0",
          query_media_id: media.media_id,
          source_context: {
            provider: "douyin",
            external_content_id: "video-http-001",
            caption: "桌面灯",
            timestamp_ms: 800,
            selection_bbox: {
              x: 0.2,
              y: 0.2,
              width: 0.3,
              height: 0.3
            }
          },
          options: { max_candidates: 2 }
        })
      }
    );
    const query = await queryResponse.json();
    assert.equal(queryResponse.status, 202);
    assert.equal(query.status, "succeeded");

    const selectionResponse = await fetch(
      `${baseUrl}/api/v1/visual-search/queries/${query.visual_search_query_id}/selections`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "visual-selection-001"
        },
        body: JSON.stringify({
          schema_version: "1.0",
          candidate_id: query.candidates[0].candidate_id,
          asset_lifecycle: "saved",
          modeling_mode: "preview_2d"
        })
      }
    );
    const selection = await selectionResponse.json();
    assert.equal(selectionResponse.status, 201);
    assert.equal(selection.source_component.immutable_anchor, true);

    const getResponse = await fetch(
      `${baseUrl}/api/v1/visual-search/queries/${query.visual_search_query_id}`
    );
    const reread = await getResponse.json();
    assert.equal(getResponse.status, 200);
    assert.equal(reread.selected_asset_id, selection.asset.asset_id);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await platform.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
