import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryCardStore } from "../src/store.js";

test("内存 AICard 达到容量后淘汰最早快照", () => {
  const store = new InMemoryCardStore({
    ttlMs: 10_000,
    maxEntries: 2,
    now: () => 0
  });
  store.set({ request_id: "req-1", value: 1 });
  store.set({ request_id: "req-2", value: 2 });
  store.set({ request_id: "req-3", value: 3 });

  assert.equal(store.size, 2);
  assert.throws(() => store.get("req-1"), { code: "card_not_found" });
  assert.equal(store.get("req-2").value, 2);
  assert.equal(store.get("req-3").value, 3);
});

test("内存 AICard 到期后返回明确 404 语义", () => {
  let now = 0;
  const store = new InMemoryCardStore({
    ttlMs: 100,
    maxEntries: 2,
    now: () => now
  });
  store.set({ request_id: "req-expiring" });
  now = 101;

  assert.equal(store.size, 0);
  assert.throws(() => store.get("req-expiring"), {
    code: "card_not_found",
    statusCode: 404
  });
});
