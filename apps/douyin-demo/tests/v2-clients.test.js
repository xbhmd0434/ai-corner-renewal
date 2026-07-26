import test from "node:test";
import assert from "node:assert/strict";
import { confirmInspirationIntent } from "../douyin-static-demo/api/intent-confirmation-client.js";
import {
  cancelRelatedDesignRun,
  createRelatedDesignRun,
  getRelatedDesignRun,
  listRelatedDesignRuns
} from "../douyin-static-demo/api/related-design-client.js";
import {
  createPublication,
  getPublication,
  withdrawPublication
} from "../douyin-static-demo/api/publication-client.js";
import { createCartIntent } from "../douyin-static-demo/api/cart-intent-client.js";
import {
  confirmVideoInspirationIntent,
  createVideoInspiration
} from "../douyin-static-demo/api/visual-search-client.js";
import { mapError } from "../douyin-static-demo/api/http-client.js";

test("V2.1 clients use frozen routes, encoded IDs and idempotency keys", async (t) => {
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

  await confirmInspirationIntent("asset/a", {
    resource_version: 2,
    intent_type: "component",
    summary: "奶油白花瓶"
  });
  await createRelatedDesignRun("design/a");
  await listRelatedDesignRuns("design/a");
  await getRelatedDesignRun("related/a");
  await cancelRelatedDesignRun("related/a");
  await createPublication("plan/a", "version/a", {
    title: "我的一角",
    cover_source: "plan_render",
    source_attribution_acknowledged: true
  });
  await getPublication("publication/a");
  await withdrawPublication("publication/a");
  await createCartIntent("discovery/a", {
    items: [
      {
        list_item_id: "item-1",
        match_id: "match-1",
        quantity: 1
      }
    ]
  });

  assert.equal(calls.length, 9);
  assert.match(calls[0].url, /assets\/asset%2Fa\/intent-confirmations$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    schema_version: "1.0",
    resource_version: 2,
    intent_type: "component",
    summary: "奶油白花瓶"
  });
  assert.match(
    calls[1].url,
    /design-requests\/design%2Fa\/related-design-runs$/
  );
  assert.match(calls[2].url, /sort=recent&limit=5$/);
  assert.match(calls[3].url, /related-design-runs\/related%2Fa$/);
  assert.match(calls[4].url, /related-design-runs\/related%2Fa\/cancel$/);
  assert.match(
    calls[5].url,
    /plans\/plan%2Fa\/versions\/version%2Fa\/publications$/
  );
  assert.match(calls[6].url, /publications\/publication%2Fa$/);
  assert.equal(calls[7].options.method, "DELETE");
  assert.match(calls[8].url, /product-discovery-runs\/discovery%2Fa\/cart-intents$/);

  for (const index of [0, 1, 4, 5, 7, 8]) {
    assert.ok(calls[index].options.headers.get("Idempotency-Key"));
  }
});

test("publication title is constrained to the backend 100-character limit", async (t) => {
  let body;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await createPublication("plan", "version", {
    title: "一".repeat(120)
  });
  assert.equal(body.title.length, 100);
});

test("HTTP validation errors preserve the backend's actionable public message", () => {
  const mapped = mapError({
    status: 422,
    code: "design_request_invalid",
    message: "goal 必须是 1～500 字符"
  });
  assert.equal(mapped.type, "validation");
  assert.equal(mapped.message, "goal 必须是 1～500 字符");
});

test("video entry creates and confirms one InspirationAsset before renewal handoff", async (t) => {
  const calls = [];
  let assetReads = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, options });
    if (href.endsWith("/api/v1/media")) {
      return Response.json(
        { media_id: "media-inspiration-001" },
        { status: 201 }
      );
    }
    if (
      href.endsWith("/api/v1/assets") &&
      (options.method || "GET") === "POST"
    ) {
      return Response.json(
        {
          asset_id: "inspiration-001",
          asset_type: "inspiration",
          parse_state: "queued"
        },
        { status: 201 }
      );
    }
    if (href.endsWith("/intent-confirmations")) {
      return Response.json(
        {
          asset_id: "inspiration-001",
          resource_version: 3,
          parse_state: "ready"
        },
        { status: 200 }
      );
    }
    if (href.endsWith("/api/v1/assets/inspiration-001")) {
      assetReads += 1;
      return Response.json(
        {
          asset_id: "inspiration-001",
          asset_type: "inspiration",
          resource_version: assetReads === 1 ? 2 : 3,
          parse_state:
            assetReads === 1 ? "needs_confirmation" : "ready",
          attributes: {
            intent_analysis: {
              state: "needs_confirmation",
              suggested_type: "component",
              summary: "奶油白陶瓷花瓶"
            },
            confirmed_intent:
              assetReads === 1
                ? null
                : {
                    intent_type: "component",
                    summary: "奶油白陶瓷花瓶"
                  }
          }
        },
        { status: 200 }
      );
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const sourceContext = {
    provider: "douyin",
    external_content_id: "video-001",
    author_display: "@家居作者",
    timestamp_ms: 1200,
    selection_bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    caption: "桌面花瓶搭配"
  };
  const created = await createVideoInspiration({
    cropBlob: new Blob(["image"], { type: "image/webp" }),
    sourceContext
  });
  assert.equal(created.asset_type, "inspiration");
  assert.equal(created.parse_state, "needs_confirmation");

  const confirmed = await confirmVideoInspirationIntent(created, {
    intentType: "component",
    summary: "奶油白陶瓷花瓶"
  });
  assert.equal(
    confirmed.attributes.confirmed_intent.intent_type,
    "component"
  );

  const createCall = calls.find(
    (call) =>
      call.url.endsWith("/api/v1/assets") &&
      (call.options.method || "GET") === "POST"
  );
  const payload = JSON.parse(createCall.options.body);
  assert.equal(payload.asset_type, "inspiration");
  assert.deepEqual(payload.media_ids, ["media-inspiration-001"]);
  assert.deepEqual(
    payload.provenance.selection_bbox,
    sourceContext.selection_bbox
  );
  assert.equal(
    calls.some((call) => call.url.includes("/visual-search/queries")),
    false
  );
});
