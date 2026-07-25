import test from "node:test";
import assert from "node:assert/strict";
import {
  BAG_ANCHORS,
  DEFAULT_COMPOSITION,
  MODEL_LIBRARY,
  STORAGE_KEY,
  VIEW_PRESETS
} from "../apps/web/data/accessory-demo-data.js";

test("3D 试搭默认方案只保存两个资产引用和组合变换", () => {
  assert.equal(DEFAULT_COMPOSITION.schemaVersion, 1);
  assert.ok(MODEL_LIBRARY.bags.some((item) => item.id === DEFAULT_COMPOSITION.baseModelId));
  assert.ok(MODEL_LIBRARY.charms.some((item) => item.id === DEFAULT_COMPOSITION.attachmentModelId));
  assert.ok(BAG_ANCHORS.some((item) => item.id === DEFAULT_COMPOSITION.anchorId));
  assert.equal(DEFAULT_COMPOSITION.transform.position.length, 3);
  assert.equal(DEFAULT_COMPOSITION.transform.rotation.length, 3);
  assert.equal(typeof DEFAULT_COMPOSITION.transform.scale, "number");
  assert.equal("mergedModel" in DEFAULT_COMPOSITION, false);
});

test("3D 资产和挂点稳定 ID 唯一，默认视角有效", () => {
  const assetIds = [
    ...MODEL_LIBRARY.bags.map((item) => item.id),
    ...MODEL_LIBRARY.charms.map((item) => item.id)
  ];
  const anchorIds = BAG_ANCHORS.map((item) => item.id);
  assert.equal(new Set(assetIds).size, assetIds.length);
  assert.equal(new Set(anchorIds).size, anchorIds.length);
  assert.ok(VIEW_PRESETS[DEFAULT_COMPOSITION.view]);
  assert.match(STORAGE_KEY, /composition-v1$/);
});

test("推荐挂点都提供三维坐标且处于 MVP 编辑范围", () => {
  for (const anchor of BAG_ANCHORS) {
    assert.equal(anchor.position.length, 3);
    assert.ok(anchor.position[0] >= -1.35 && anchor.position[0] <= 1.35);
    assert.ok(anchor.position[1] >= -.65 && anchor.position[1] <= 1.25);
    assert.ok(Number.isFinite(anchor.position[2]));
  }
});
