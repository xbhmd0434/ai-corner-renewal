import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelProductDiscoveryRun,
  createProductDiscoveryRun,
  getProductDiscoveryRun,
  listProductDiscoveryRuns
} from "../douyin-static-demo/api/product-discovery-client.js";

test("Product Discovery client follows the four frozen routes", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await createProductDiscoveryRun("plan/a", "version b");
  await listProductDiscoveryRuns("plan/a", "version b");
  await getProductDiscoveryRun("run/1");
  await cancelProductDiscoveryRun("run/1");

  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /plans\/plan%2Fa\/versions\/version%20b\/product-discovery-runs$/);
  assert.equal(calls[0].options.method, "POST");
  assert.ok(calls[0].options.headers.get("Idempotency-Key"));
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    schema_version: "1.0",
    reason: "initial",
    options: {
      discovery_mode: "auto",
      max_subjects: 6,
      matches_per_subject: 3
    }
  });
  assert.match(calls[1].url, /sort=recent&limit=1$/);
  assert.equal(calls[1].options.method, "GET");
  assert.match(calls[2].url, /product-discovery-runs\/run%2F1$/);
  assert.match(calls[3].url, /product-discovery-runs\/run%2F1\/cancel$/);
  assert.deepEqual(JSON.parse(calls[3].options.body), { schema_version: "1.0" });
});
