import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-designv2-"));
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

const V2_OPTIONS = { experience_contract: "renewal-card/2.1" };

test("V2.1 DesignRequest 快照 confirmed_intent 并生成稳定 context_fingerprint", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const design = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal: "",
      goal_codes: [],
      constraints: {},
      options: V2_OPTIONS
    });
    const full = runtime.platform.designRequestService.get(actorId, design.design_request_id);
    assert.ok(full.input_snapshot.context_fingerprint.startsWith("sha256:"));
    const snapshotIntent = full.input_snapshot.reference_snapshots[0].confirmed_intent;
    assert.ok(snapshotIntent);
    assert.equal(snapshotIntent.intent_type, "style");
    assert.equal(full.input_snapshot.goal, "");
    // 空 constraints 不产生 blocking missing_fields
    const blocking = full.missing_fields.filter((item) => item.blocking);
    assert.equal(blocking.length, 0);
    // budget_source 是 preference/space_default/system_default 之一，但不是 request
    assert.notEqual(full.input_snapshot.budget_source, "request");
  } finally {
    await runtime.close();
  }
});

test("换场景强制创建新 DesignRequest 且 context_fingerprint 不同", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const first = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "space_reuse",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal_codes: [],
      constraints: {},
      options: V2_OPTIONS
    });
    const second = runtime.platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "space_reuse",
      space_asset_id: "space-demo-balcony",
      space_version_id: "space-demo-balcony-v1",
      reference_asset_ids: ["inspiration-demo-warm"],
      goal_codes: [],
      constraints: {},
      options: V2_OPTIONS
    });
    assert.notEqual(first.design_request_id, second.design_request_id);
    const firstFull = runtime.platform.designRequestService.get(actorId, first.design_request_id);
    const secondFull = runtime.platform.designRequestService.get(actorId, second.design_request_id);
    assert.notEqual(
      firstFull.input_snapshot.context_fingerprint,
      secondFull.input_snapshot.context_fingerprint
    );
  } finally {
    await runtime.close();
  }
});

test("空 goal 只为 renewal-card/2.1 放行，旧契约仍拒绝", async () => {
  const runtime = createRuntime();
  try {
    assert.throws(
      () =>
        runtime.platform.designRequestService.create(runtime.platform.actorId, {
          schema_version: "1.0",
          trigger: "video_apply",
          space_asset_id: "space-demo-desk",
          space_version_id: "space-demo-desk-v1",
          reference_asset_ids: ["inspiration-demo-warm"],
          goal: "",
          goal_codes: [],
          constraints: {}
        }),
      (error) =>
        error.code === "design_request_invalid" &&
        error.message === "goal 必须是 1～500 字符"
    );
  } finally {
    await runtime.close();
  }
});

test("引用未确认灵感的 DesignRequest 被拒绝：intent_confirmation_required", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const inspiration = runtime.platform.assetService.create(actorId, {
      schema_version: "1.0",
      asset_type: "inspiration",
      lifecycle: "saved",
      media_ids: [],
      provenance: {
        kind: "video_context",
        provider: "douyin_demo",
        external_content_id: "video-needs-confirm",
        timestamp_ms: 3200
      },
      attributes: { name: "未确认灵感" }
    });
    // 等待解析进入 needs_confirmation
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const detail = runtime.platform.assetService.detail(actorId, inspiration.value.asset_id);
      if (detail.parse_state === "needs_confirmation") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    let error;
    try {
      runtime.platform.designRequestService.create(actorId, {
        schema_version: "1.0",
        trigger: "video_apply",
        space_asset_id: "space-demo-desk",
        space_version_id: "space-demo-desk-v1",
        reference_asset_ids: [inspiration.value.asset_id],
        goal_codes: [],
        constraints: {},
        options: V2_OPTIONS
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.code, "intent_confirmation_required");
    assert.equal(error.statusCode, 409);
  } finally {
    await runtime.close();
  }
});

test("AI 示例场景默认 read_only=true 且不能被 PATCH 或 DELETE", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const detail = runtime.platform.assetService.detail(actorId, "space-demo-desk");
    assert.equal(detail.attributes.scene_origin, "ai_example");
    assert.equal(detail.attributes.read_only, true);
    let patchError;
    try {
      runtime.platform.assetService.patch(actorId, "space-demo-desk", {
        schema_version: "1.0",
        resource_version: detail.resource_version,
        changes: { name: "改名" }
      });
    } catch (err) {
      patchError = err;
    }
    assert.ok(patchError);
    assert.equal(patchError.code, "ai_example_scene_read_only");
    let deleteError;
    try {
      runtime.platform.assetService.delete(actorId, "space-demo-desk");
    } catch (err) {
      deleteError = err;
    }
    assert.ok(deleteError);
    assert.equal(deleteError.code, "ai_example_scene_read_only");
  } finally {
    await runtime.close();
  }
});
