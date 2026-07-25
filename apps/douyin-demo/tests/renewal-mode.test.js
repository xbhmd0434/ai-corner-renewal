import test from "node:test";
import assert from "node:assert/strict";
import { resolveStartupContext } from "../douyin-static-demo/renewal/mode.js";

test("new query starts from video context without opening a drawer", () => {
  assert.deepEqual(
    resolveStartupContext({ search: "?source=video" }),
    {
      source: "video",
      drawer: null,
      requestUpload: false,
      planAssetId: null,
      planVersionId: null,
      legacyPath: null
    }
  );
});

test("asset drawer query opens the collection drawer", () => {
  const context = resolveStartupContext({
    search: "?source=home&drawer=asset"
  });
  assert.equal(context.source, "home");
  assert.equal(context.drawer, "asset");
});

test("legacy asset and task links remain compatible", () => {
  assert.equal(
    resolveStartupContext({ hash: "#/assets" }).drawer,
    "asset"
  );
  assert.equal(
    resolveStartupContext({ hash: "#/task?source=video" }).source,
    "video"
  );
});

test("legacy plan version is loaded into the core result", () => {
  const context = resolveStartupContext({
    hash: "#/plans/plan-1/versions/version-2"
  });
  assert.equal(context.drawer, "history");
  assert.equal(context.planAssetId, "plan-1");
  assert.equal(context.planVersionId, "version-2");
});
