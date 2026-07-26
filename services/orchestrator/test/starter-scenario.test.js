import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-starter-"));
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

test("初始体验持久化脏乱书桌与不可替换蘑菇灯组件", async () => {
  const runtime = createRuntime();
  try {
    const { platform } = runtime;
    const actorId = platform.actorId;
    const space = platform.assetService.detail(actorId, "space-demo-desk");
    const component = platform.assetService.detail(actorId, "item-demo-lamp");
    const version = platform.repository.get(
      "spaceVersions",
      actorId,
      "space-demo-desk-v1"
    );

    assert.equal(space.name, "原来的脏乱书桌");
    assert.equal(space.attributes.starter_sample, true);
    assert.match(space.preview.url, /media-demo-starter-cluttered-desk/);
    assert.deepEqual(version.media_ids, [
      "media-demo-starter-cluttered-desk"
    ]);

    assert.equal(component.name, "奶油白蘑菇小台灯");
    assert.match(component.preview.url, /media-demo-starter-mushroom-lamp/);
    assert.equal(
      component.attributes.source_component.source_component_id,
      "source-component-demo-mushroom-lamp"
    );
    assert.equal(
      component.attributes.source_component.immutable_anchor,
      true
    );

    const request = platform.designRequestService.create(actorId, {
      schema_version: "1.0",
      trigger: "video_apply",
      space_asset_id: "space-demo-desk",
      space_version_id: "space-demo-desk-v1",
      reference_asset_ids: ["item-demo-lamp"],
      goal: "",
      goal_codes: [],
      constraints: {},
      options: { experience_contract: "renewal-card/2.1" }
    });
    assert.equal(request.can_start_generation, true);
    const full = platform.designRequestService.get(
      actorId,
      request.design_request_id
    );
    assert.equal(
      full.input_snapshot.reference_snapshots[0].attributes.source_component
        .immutable_anchor,
      true
    );
  } finally {
    await runtime.close();
  }
});
