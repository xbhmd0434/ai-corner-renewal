import test from "node:test";
import assert from "node:assert/strict";
import {
  beginDesignContext,
  getState,
  isCurrentDesignContext,
  persistDesignContextResume,
  loadDesignContextResume,
  reset,
  setDesignRequestIdForEpoch,
  updateGeneration,
  updateGenerationForContext,
  updateRelatedDesigns,
  updateRelatedDesignsForContext
} from "../douyin-static-demo/renewal/renewal-store.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test("epoch plus request and run IDs reject both late async branches", () => {
  reset();
  const firstEpoch = beginDesignContext();
  setDesignRequestIdForEpoch(firstEpoch, "design-old");
  updateGeneration({
    status: "active",
    generationRunId: "generation-old"
  });
  updateRelatedDesigns({
    status: "active",
    relatedDesignRunId: "related-old"
  });

  const nextEpoch = beginDesignContext();
  setDesignRequestIdForEpoch(nextEpoch, "design-new");
  updateGeneration({
    status: "active",
    generationRunId: "generation-new"
  });
  updateRelatedDesigns({
    status: "active",
    relatedDesignRunId: "related-new"
  });

  assert.equal(
    updateGenerationForContext(
      {
        epoch: firstEpoch,
        designRequestId: "design-old",
        generationRunId: "generation-old"
      },
      { status: "ready" }
    ),
    false
  );
  assert.equal(
    updateRelatedDesignsForContext(
      {
        epoch: firstEpoch,
        designRequestId: "design-old",
        relatedDesignRunId: "related-old"
      },
      { status: "ready" }
    ),
    false
  );
  assert.equal(
    isCurrentDesignContext({
      epoch: nextEpoch,
      designRequestId: "design-new"
    }),
    true
  );
  assert.equal(getState().generation.status, "active");
  assert.equal(getState().relatedDesigns.status, "active");
});

test("resume persistence merges orthogonal business IDs without retaining private payloads", (t) => {
  const original = globalThis.sessionStorage;
  globalThis.sessionStorage = memoryStorage();
  t.after(() => {
    globalThis.sessionStorage = original;
  });

  persistDesignContextResume({
    designRequestId: "design-1",
    generationRunId: "generation-1"
  });
  persistDesignContextResume({
    relatedDesignRunId: "related-1"
  });
  persistDesignContextResume({
    planAssetId: "plan-1",
    planVersionId: "version-1",
    privateImage: "must-not-persist"
  });

  assert.deepEqual(loadDesignContextResume(), {
    designRequestId: "design-1",
    generationRunId: "generation-1",
    relatedDesignRunId: "related-1",
    planAssetId: "plan-1",
    planVersionId: "version-1",
    publicationId: null
  });
});
