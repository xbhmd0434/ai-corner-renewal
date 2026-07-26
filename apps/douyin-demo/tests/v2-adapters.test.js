import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adaptInspirationIntent } from "../douyin-static-demo/adapters/inspiration-intent-view-model.js";
import { adaptRelatedDesignRun } from "../douyin-static-demo/adapters/related-design-view-model.js";
import { adaptPublication } from "../douyin-static-demo/adapters/publication-view-model.js";
import { adaptImplementationList } from "../douyin-static-demo/adapters/implementation-list-view-model.js";

async function fixture(name) {
  return JSON.parse(
    await readFile(
      new URL(
        `../../../examples/contracts/renewal-v2/${name}.json`,
        import.meta.url
      ),
      "utf8"
    )
  );
}

test("ambiguous inspiration exposes only the two backend candidates", async () => {
  const viewModel = adaptInspirationIntent(
    await fixture("inspiration.needs-confirmation")
  );
  assert.equal(viewModel.isConfirmed, false);
  assert.deepEqual(
    viewModel.candidates.map((item) => item.intentType),
    ["component", "style"]
  );
  assert.match(viewModel.candidates[0].summary, /花瓶/);
});

test("confirmed inspiration keeps the immutable confirmed intent", async () => {
  const viewModel = adaptInspirationIntent(
    await fixture("inspiration.confirmed.component")
  );
  assert.equal(viewModel.isConfirmed, true);
  assert.equal(viewModel.confirmedIntent.intentType, "component");
  assert.equal(viewModel.confirmedIntent.confirmedBy, "user");
});

test("related designs preserve backend reasons and safe action types", async () => {
  const viewModel = adaptRelatedDesignRun(
    await fixture("related.ready.mixed-source")
  );
  assert.equal(viewModel.resultState, "ready");
  assert.deepEqual(
    viewModel.items.map((item) => item.sourceType),
    ["douyin", "user_publication"]
  );
  assert.deepEqual(viewModel.items[0].reasonLabels, ["同款花瓶的书桌搭配"]);
  assert.equal(viewModel.items[1].openAction.type, "internal_publication");
});

test("publication and implementation adapters preserve independent states and backend order", async () => {
  const publication = adaptPublication(
    await fixture("publication.indexing")
  );
  assert.equal(publication.isIndexing, true);
  assert.equal(publication.visibility, "public");

  const implementation = adaptImplementationList(
    await fixture("implementation.ready.component")
  );
  assert.equal(implementation.items[0].originType, "video_selected");
  assert.equal(implementation.items[0].sortGroup, 0);
  assert.equal(implementation.selectedMatchIds.length, 1);
});
