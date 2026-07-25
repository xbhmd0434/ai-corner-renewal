import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVideoSourceContext,
  isValidSelection,
  normalizeSelection,
  selectionArea,
  selectionToCss
} from "../douyin-static-demo/visual-search/model.js";

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
