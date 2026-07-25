import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-intent-"));
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

async function waitForAsset(platform, actorId, assetId, { until }) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const detail = platform.assetService.detail(actorId, assetId);
    if (until(detail)) return detail;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`asset ${assetId} 未达到目标状态`);
}

test("视频圈选的组件 inspiration 解析出 component 意图并 ready", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const created = runtime.platform.assetService.create(actorId, {
      schema_version: "1.0",
      asset_type: "inspiration",
      lifecycle: "saved",
      media_ids: [],
      provenance: {
        kind: "video_context",
        provider: "douyin_demo",
        external_content_id: "video-component-01",
        timestamp_ms: 3200,
        selection_bbox: { x: 0.2, y: 0.18, width: 0.34, height: 0.42 }
      },
      attributes: { name: "视频里的花瓶" }
    });
    const detail = await waitForAsset(runtime.platform, actorId, created.value.asset_id, {
      until: (d) => d.parse_state === "ready"
    });
    assert.equal(detail.attributes.intent_analysis.state, "ready");
    assert.equal(detail.attributes.intent_analysis.suggested_type, "component");
    // 未经用户确认前 confirmed_intent 为 null
    assert.equal(detail.attributes.confirmed_intent, null);
  } finally {
    await runtime.close();
  }
});

test("模糊场景下解析为 needs_confirmation，需要用户手动确认", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const created = runtime.platform.assetService.create(actorId, {
      schema_version: "1.0",
      asset_type: "inspiration",
      lifecycle: "saved",
      media_ids: [],
      provenance: {
        kind: "video_context",
        provider: "douyin_demo",
        external_content_id: "video-uncertain-01",
        timestamp_ms: 3200
      },
      attributes: { name: "不确定圈选的内容" }
    });
    const detail = await waitForAsset(runtime.platform, actorId, created.value.asset_id, {
      until: (d) => d.parse_state === "needs_confirmation"
    });
    assert.equal(detail.attributes.intent_analysis.state, "needs_confirmation");
    assert.ok(detail.attributes.intent_analysis.candidates.length >= 2);
    // 未确认无法生成 DesignRequest (renewal-card/2.1)
    let error;
    try {
      runtime.platform.designRequestService.create(actorId, {
        schema_version: "1.0",
        trigger: "video_apply",
        space_asset_id: "space-demo-desk",
        space_version_id: "space-demo-desk-v1",
        reference_asset_ids: [created.value.asset_id],
        goal_codes: [],
        constraints: {},
        options: { experience_contract: "renewal-card/2.1" }
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error, "未确认灵感不能建 DesignRequest");
    assert.equal(error.code, "intent_confirmation_required");
    assert.equal(error.statusCode, 409);
  } finally {
    await runtime.close();
  }
});

test("用户确认意图后 confirmed_intent 稳定、可幂等重放，且不覆盖 intent_analysis", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    const created = runtime.platform.assetService.create(actorId, {
      schema_version: "1.0",
      asset_type: "inspiration",
      lifecycle: "saved",
      media_ids: [],
      provenance: {
        kind: "video_context",
        provider: "douyin_demo",
        external_content_id: "video-confirm-01",
        timestamp_ms: 3200
      },
      attributes: { name: "灵感对象" }
    });
    const detail = await waitForAsset(runtime.platform, actorId, created.value.asset_id, {
      until: (d) => d.parse_state === "needs_confirmation"
    });
    const confirmedSummary = runtime.platform.assetService.confirmIntent(actorId, created.value.asset_id, {
      schema_version: "1.0",
      resource_version: detail.resource_version,
      intent_type: "style",
      summary: "视频里的暖光氛围"
    });
    const afterConfirm = runtime.platform.assetService.detail(actorId, created.value.asset_id);
    assert.equal(afterConfirm.parse_state, "ready");
    assert.equal(afterConfirm.attributes.confirmed_intent.intent_type, "style");
    assert.equal(afterConfirm.attributes.confirmed_intent.confirmed_by, "user");
    // 分析仍保留
    assert.ok(afterConfirm.attributes.intent_analysis);
    assert.equal(confirmedSummary.resource_version, detail.resource_version + 1);

    // resource_version 冲突
    let stale;
    try {
      runtime.platform.assetService.confirmIntent(actorId, created.value.asset_id, {
        schema_version: "1.0",
        resource_version: detail.resource_version, // 旧版本
        intent_type: "component",
        summary: "换成组件"
      });
    } catch (err) {
      stale = err;
    }
    assert.ok(stale);
    assert.equal(stale.code, "resource_version_conflict");
  } finally {
    await runtime.close();
  }
});

test("跨 actor 访问不同 actor 的 asset 意图确认统一返回 404", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    let error;
    try {
      runtime.platform.assetService.confirmIntent(actorId, "does-not-exist", {
        schema_version: "1.0",
        resource_version: 1,
        intent_type: "component",
        summary: "任意"
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.statusCode, 404);
  } finally {
    await runtime.close();
  }
});

test("非 inspiration 资产拒绝调用意图确认接口", async () => {
  const runtime = createRuntime();
  try {
    const actorId = runtime.platform.actorId;
    let error;
    try {
      runtime.platform.assetService.confirmIntent(actorId, "space-demo-desk", {
        schema_version: "1.0",
        resource_version: 1,
        intent_type: "component",
        summary: "非法尝试"
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(error.code, "intent_confirmation_invalid");
  } finally {
    await runtime.close();
  }
});
