import test from "node:test";
import assert from "node:assert/strict";
import {
  applyProductDiscoveryViewModel,
  beginProductDiscoveryContext,
  getState,
  reset,
  updateProductDiscoveryForContext
} from "../douyin-static-demo/renewal/renewal-store.js";

function viewModel(planVersionId, runId, status = "ready") {
  return {
    runId,
    planAssetId: "plan-1",
    planVersionId,
    status,
    stage: "packaging",
    progress: 100,
    subjects: [],
    errorMessage: null,
    deliveryMode: "api"
  };
}

test("late ProductDiscoveryRun response cannot overwrite a new PlanVersion", () => {
  reset();
  const oldContext = beginProductDiscoveryContext("plan-1", "version-1");
  const newContext = beginProductDiscoveryContext("plan-1", "version-2");

  assert.equal(applyProductDiscoveryViewModel(oldContext, viewModel("version-1", "run-old")), false);
  assert.equal(applyProductDiscoveryViewModel(newContext, viewModel("version-2", "run-new")), true);
  assert.equal(getState().productDiscovery.runId, "run-new");
  assert.equal(getState().productDiscovery.planVersionId, "version-2");
});

test("a new retry context isolates late responses for the same PlanVersion", () => {
  reset();
  const initialContext = beginProductDiscoveryContext("plan-1", "version-1");
  const retryContext = beginProductDiscoveryContext("plan-1", "version-1");

  assert.equal(applyProductDiscoveryViewModel(initialContext, viewModel("version-1", "run-initial")), false);
  assert.equal(applyProductDiscoveryViewModel(retryContext, viewModel("version-1", "run-retry")), true);
  assert.equal(getState().productDiscovery.runId, "run-retry");
});

test("context-guarded polling updates reject mismatched PlanVersion", () => {
  reset();
  const context = beginProductDiscoveryContext("plan-1", "version-1");
  assert.equal(
    updateProductDiscoveryForContext(context, { planVersionId: "version-2", polling: true }),
    false
  );
  assert.equal(getState().productDiscovery.polling, false);
});
