import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInspirationEntryContext,
  buildRenewalEntryContext,
  buildVideoSourceContext,
  hasGenerationReadySourceComponent,
  isValidSelection,
  normalizeSelection,
  selectionArea,
  selectionToCss
} from "../douyin-static-demo/visual-search/model.js";

test("only a confirmed SourceComponent can be handed to renewal generation", () => {
  const sourceContext = {
    provider: "douyin_static_demo",
    external_content_id: "video-2",
    author_display: "@demo",
    timestamp_ms: 3214
  };
  const candidate = { name: "奶油白蘑菇灯" };
  const confirmed = {
    asset: {
      asset_id: "item-source-component-1",
      attributes: {
        source_component: {
          source_component_id: "source-component-1",
          immutable_anchor: true
        }
      }
    }
  };
  const legacyItem = {
    asset: {
      asset_id: "item-legacy-1",
      attributes: {}
    }
  };

  assert.equal(hasGenerationReadySourceComponent(confirmed), true);
  assert.equal(hasGenerationReadySourceComponent(legacyItem), false);
  assert.equal(hasGenerationReadySourceComponent(null), false);
  assert.equal(
    buildRenewalEntryContext(confirmed, sourceContext, candidate)
      .reference_asset_id,
    "item-source-component-1"
  );
});

test("confirmed InspirationAsset id is handed to renewal without transient media", () => {
  const context = buildInspirationEntryContext(
    {
      asset_id: "inspiration-video-1",
      attributes: {
        confirmed_intent: {
          intent_type: "component",
          summary: "奶油白蘑菇灯"
        }
      }
    },
    {
      provider: "douyin_static_demo",
      external_content_id: "video-2",
      author_display: "@demo",
      timestamp_ms: 3214,
      selection_bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      crop_url: "blob:not-persisted"
    },
    {
      intent_type: "component",
      summary: "奶油白蘑菇灯"
    },
  );
  assert.equal(context.reference_asset_id, "inspiration-video-1");
  assert.equal(context.inspiration_asset_id, "inspiration-video-1");
  assert.equal(context.confirmed_intent_type, "component");
  assert.equal(context.name, "奶油白蘑菇灯");
  assert.equal("selection_bbox" in context, false);
  assert.equal("crop_url" in context, false);
});

test("normalizeSelection supports reverse drag and clamps to the frame", () => {
  assert.deepEqual(
    normalizeSelection({ x: 0.8, y: 1.2 }, { x: -0.1, y: 0.2 }),
    { x: 0, y: 0.2, width: 0.8, height: 0.8 }
  );
});

test("selection validation rejects tiny accidental taps", () => {
  assert.equal(isValidSelection({ x: 0, y: 0, width: 0.02, height: 0.02 }), false);
  assert.equal(isValidSelection({ x: 0, y: 0, width: 0.2, height: 0.2 }), true);
  assert.ok(Math.abs(selectionArea({ width: 0.2, height: 0.2 }) - 0.04) < Number.EPSILON);
});

test("selectionToCss keeps normalized geometry as percentages", () => {
  assert.deepEqual(
    selectionToCss({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }),
    { left: "10%", top: "20%", width: "30%", height: "40%" }
  );
});

test("video source context excludes the frame payload", () => {
  const slide = {
    dataset: {
      videoId: "video-2",
      author: "@demo",
      caption: "桌面焕新"
    }
  };
  const video = { currentTime: 3.214 };
  const context = buildVideoSourceContext(
    slide,
    video,
    { x: 0.123456, y: 0.2, width: 0.4, height: 0.5 }
  );
  assert.equal(context.external_content_id, "video-2");
  assert.equal(context.timestamp_ms, 3214);
  assert.deepEqual(context.selection_bbox, {
    x: 0.1235,
    y: 0.2,
    width: 0.4,
    height: 0.5
  });
  assert.equal("frame_data_url" in context, false);
});
