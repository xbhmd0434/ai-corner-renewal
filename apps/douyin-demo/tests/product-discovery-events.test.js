import test from "node:test";
import assert from "node:assert/strict";
import { buildProductDiscoveryEvent } from "../douyin-static-demo/renewal/product-discovery-events.js";

test("product discovery events keep only the frozen privacy allowlist", () => {
  const event = buildProductDiscoveryEvent(
    "commerce_search_copied",
    {
      plan_version_id: "plan-version-1",
      product_discovery_run_id: "run-1",
      subject_id: "subject-1",
      match_id: "match-1",
      product_id: "product-1",
      commerce_action_type: "search_query",
      source_type: "demo_catalog",
      query: "不得进入事件",
      bbox: "不得进入事件",
      url: "https://example.com/private",
      free_text: "不得进入事件"
    },
    {
      eventId: "event-1",
      clientTime: "2026-07-25T12:00:00.000Z"
    }
  );

  assert.deepEqual(event.entity_ids, {
    plan_version_id: "plan-version-1",
    product_discovery_run_id: "run-1",
    subject_id: "subject-1",
    match_id: "match-1",
    product_id: "product-1"
  });
  assert.deepEqual(event.attributes, {
    commerce_action_type: "search_query",
    source_type: "demo_catalog"
  });
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /不得进入事件|example\.com|"query"|"bbox"|"url"|"free_text"/);
});
