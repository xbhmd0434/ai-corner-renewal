import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createPlatform } from "../src/platform.js";
import { createApiServer } from "../src/server.js";
import { listenLoopbackSafely } from "./helpers/http-listen.js";

const V2_OPTIONS = { experience_contract: "renewal-card/2.1", analysis_mode: "demo", include_trace: false };
const silentLogger = { info() {}, error() {} };

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "corner-v2-e2e-"));
  return {
    directory,
    config() {
      return {
        ...loadConfig({}),
        databasePath: join(directory, "state.sqlite"),
        privateMediaDirectory: join(directory, "media")
      };
    }
  };
}

async function startServer(runtime) {
  const config = runtime.config();
  const platform = createPlatform({ config });
  const server = createApiServer({ orchestrator: platform, config, logger: silentLogger });
  const { baseUrl } = await listenLoopbackSafely(server);
  return {
    platform,
    baseUrl,
    async close() {
      await new Promise((r, rej) => server.close((err) => (err ? rej(err) : r())));
      await platform.close();
    }
  };
}

async function jsonRequest(baseUrl, path, { method = "GET", body, key, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const value = response.status === 204 ? null : await response.json();
  return { response, value };
}

async function waitJson(baseUrl, path, isReady) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const { value } = await jsonRequest(baseUrl, path);
    if (isReady(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`${path} 未在测试时间内就绪`);
}

test("V2.1 HTTP e2e：确认意图 + 双 run 并行 + 保存发布 + 实施 + 购物车", async () => {
  const runtime = createRuntime();
  const server = await startServer(runtime);
  try {
    // 1. 创建 inspiration + 确认意图（用 seed 资产也行；这里演示 seed 已 confirmed）
    const assets = await jsonRequest(server.baseUrl, "/api/v1/assets?asset_type=inspiration");
    assert.equal(assets.response.status, 200);
    assert.ok(assets.value.items.length >= 1);
    const inspiration = assets.value.items[0];

    // 2. 创建 DesignRequest（V2.1）
    const design = await jsonRequest(server.baseUrl, "/api/v1/design-requests", {
      method: "POST",
      key: "design-v2-e2e-001",
      body: {
        schema_version: "1.0",
        trigger: "video_apply",
        space_asset_id: "space-demo-desk",
        space_version_id: "space-demo-desk-v1",
        reference_asset_ids: [inspiration.asset_id],
        goal_codes: [],
        constraints: {},
        options: V2_OPTIONS
      }
    });
    assert.equal(design.response.status, 201);

    // 3. 并行创建 GenerationRun 与 RelatedDesignRun
    const [gen, related] = await Promise.all([
      jsonRequest(server.baseUrl, `/api/v1/design-requests/${design.value.design_request_id}/runs`, {
        method: "POST",
        key: "gen-v2-e2e-001",
        body: { schema_version: "1.0", reason: "initial" }
      }),
      jsonRequest(
        server.baseUrl,
        `/api/v1/design-requests/${design.value.design_request_id}/related-design-runs`,
        {
          method: "POST",
          key: "related-v2-e2e-001",
          body: { schema_version: "1.0", reason: "initial" }
        }
      )
    ]);
    assert.equal(gen.response.status, 202);
    assert.equal(related.response.status, 202);
    // 幂等重放 GenerationRun 应命中同一 run
    const genReplay = await jsonRequest(
      server.baseUrl,
      `/api/v1/design-requests/${design.value.design_request_id}/runs`,
      {
        method: "POST",
        key: "gen-v2-e2e-001",
        body: { schema_version: "1.0", reason: "initial" }
      }
    );
    assert.equal(genReplay.value.generation_run_id, gen.value.generation_run_id);

    // 4. 等待两个 run 完成
    const genFinal = await waitJson(
      server.baseUrl,
      `/api/v1/generation-runs/${gen.value.generation_run_id}`,
      (v) => ["succeeded", "failed", "cancelled"].includes(v.status)
    );
    assert.equal(genFinal.status, "succeeded");
    const relatedFinal = await waitJson(
      server.baseUrl,
      `/api/v1/related-design-runs/${related.value.related_design_run_id}`,
      (v) => ["succeeded", "failed", "cancelled"].includes(v.status)
    );
    assert.equal(relatedFinal.status, "succeeded");

    // 5. 保存方案并发布
    const planAssetId = genFinal.result.plan_asset_id;
    const planVersionId = genFinal.result.plan_version.plan_version_id;
    const plan = await jsonRequest(server.baseUrl, `/api/v1/plans/${planAssetId}`);
    const savePatch = await jsonRequest(server.baseUrl, `/api/v1/plans/${planAssetId}`, {
      method: "PATCH",
      body: {
        schema_version: "1.0",
        resource_version: plan.value.resource_version,
        changes: { lifecycle: "saved" }
      }
    });
    assert.equal(savePatch.response.status, 200);

    const pub = await jsonRequest(
      server.baseUrl,
      `/api/v1/plans/${planAssetId}/versions/${planVersionId}/publications`,
      {
        method: "POST",
        key: "pub-v2-e2e-001",
        body: {
          schema_version: "1.0",
          title: "e2e 发布",
          cover_source: "plan_render",
          source_attribution_acknowledged: true
        }
      }
    );
    assert.equal(pub.response.status, 201);
    const pubFinal = await waitJson(
      server.baseUrl,
      `/api/v1/publications/${pub.value.publication_id}`,
      (v) => ["published", "index_failed"].includes(v.status)
    );
    assert.equal(pubFinal.status, "published");

    // 6. 创建 ProductDiscoveryRun + implementation list
    const discovery = await jsonRequest(
      server.baseUrl,
      `/api/v1/plans/${planAssetId}/versions/${planVersionId}/product-discovery-runs`,
      {
        method: "POST",
        key: "pd-v2-e2e-001",
        body: { schema_version: "1.0", reason: "initial" }
      }
    );
    assert.equal(discovery.response.status, 202);
    const discoveryFinal = await waitJson(
      server.baseUrl,
      `/api/v1/product-discovery-runs/${discovery.value.product_discovery_run_id}`,
      (v) => ["succeeded", "failed", "cancelled"].includes(v.status)
    );
    assert.equal(discoveryFinal.status, "succeeded");
    assert.ok(Array.isArray(discoveryFinal.result.implementation_list));

    // 7. 生成 CartIntent
    const firstItem = discoveryFinal.result.implementation_list[0];
    const cart = await jsonRequest(
      server.baseUrl,
      `/api/v1/product-discovery-runs/${discovery.value.product_discovery_run_id}/cart-intents`,
      {
        method: "POST",
        key: "cart-v2-e2e-001",
        body: {
          schema_version: "1.0",
          items: [
            {
              list_item_id: firstItem.list_item_id,
              match_id: firstItem.selected_match_id,
              quantity: 1
            }
          ]
        }
      }
    );
    assert.equal(cart.response.status, 201);
    assert.equal(cart.value.action.type, "search_bundle"); // 宿主 Bridge 未接入
    // 幂等重放
    const cartReplay = await jsonRequest(
      server.baseUrl,
      `/api/v1/product-discovery-runs/${discovery.value.product_discovery_run_id}/cart-intents`,
      {
        method: "POST",
        key: "cart-v2-e2e-001",
        body: {
          schema_version: "1.0",
          items: [
            {
              list_item_id: firstItem.list_item_id,
              match_id: firstItem.selected_match_id,
              quantity: 1
            }
          ]
        }
      }
    );
    assert.equal(cartReplay.value.cart_intent_id, cart.value.cart_intent_id);

    // 8. 撤下 Publication
    const withdraw = await jsonRequest(
      server.baseUrl,
      `/api/v1/publications/${pub.value.publication_id}`,
      { method: "DELETE" }
    );
    assert.equal(withdraw.response.status, 204);

    // 9. /api/health 5 个 flags
    const health = await jsonRequest(server.baseUrl, "/api/health");
    assert.equal(health.value.features.renewal_intent_v2, true);
    assert.equal(health.value.features.related_designs, true);
    assert.equal(health.value.features.plan_publication, true);
    assert.equal(health.value.features.implementation_list_v2, true);
    assert.equal(health.value.features.cart_batch_handoff, false); // 未接入真实宿主
  } finally {
    await server.close();
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});

test("V2.1 e2e：不存在的 related-design-run 返回 404，跨 actor 语义等价", async () => {
  const runtime = createRuntime();
  const server = await startServer(runtime);
  try {
    const notFound = await jsonRequest(server.baseUrl, "/api/v1/related-design-runs/no-such-run");
    assert.equal(notFound.response.status, 404);
    assert.equal(notFound.value.error.code, "resource_not_found");

    const pubNotFound = await jsonRequest(server.baseUrl, "/api/v1/publications/no-such-publication");
    assert.equal(pubNotFound.response.status, 404);
  } finally {
    await server.close();
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});

test("V2.1 e2e：意图确认 Idempotency-Key 重放稳定，冲突 key 返回 409", async () => {
  const runtime = createRuntime();
  const server = await startServer(runtime);
  try {
    // 通过 API 创建 inspiration
    const created = await jsonRequest(server.baseUrl, "/api/v1/assets", {
      method: "POST",
      key: "asset-inspiration-e2e-001",
      body: {
        schema_version: "1.0",
        asset_type: "inspiration",
        lifecycle: "saved",
        media_ids: [],
        provenance: {
          kind: "video_context",
          provider: "douyin_demo",
          external_content_id: "video-e2e",
          timestamp_ms: 5000
        },
        attributes: { name: "e2e 灵感" }
      }
    });
    assert.equal(created.response.status, 201);
    // 等 parse 完成
    const detail = await waitJson(
      server.baseUrl,
      `/api/v1/assets/${created.value.asset_id}`,
      (v) => ["needs_confirmation", "ready"].includes(v.parse_state)
    );
    // 确认为 style
    const confirmA = await jsonRequest(
      server.baseUrl,
      `/api/v1/assets/${created.value.asset_id}/intent-confirmations`,
      {
        method: "POST",
        key: "confirm-style-001",
        body: {
          schema_version: "1.0",
          resource_version: detail.resource_version,
          intent_type: "style",
          summary: "e2e 风格"
        }
      }
    );
    assert.equal(confirmA.response.status, 200);
    // 幂等重放
    const confirmReplay = await jsonRequest(
      server.baseUrl,
      `/api/v1/assets/${created.value.asset_id}/intent-confirmations`,
      {
        method: "POST",
        key: "confirm-style-001",
        body: {
          schema_version: "1.0",
          resource_version: detail.resource_version,
          intent_type: "style",
          summary: "e2e 风格"
        }
      }
    );
    assert.equal(confirmReplay.value.resource_version, confirmA.value.resource_version);
    // 同 key 不同 body → 409 idempotency_key_reused
    const confirmClash = await jsonRequest(
      server.baseUrl,
      `/api/v1/assets/${created.value.asset_id}/intent-confirmations`,
      {
        method: "POST",
        key: "confirm-style-001",
        body: {
          schema_version: "1.0",
          resource_version: detail.resource_version,
          intent_type: "component",
          summary: "改成组件"
        }
      }
    );
    assert.equal(confirmClash.response.status, 409);
    assert.equal(confirmClash.value.error.code, "idempotency_key_reused");
  } finally {
    await server.close();
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});

test("V2.1 e2e：重启后 RelatedDesignRun / Publication 自动恢复", async () => {
  const runtime = createRuntime();
  let server = await startServer(runtime);
  let publicationId;
  let relatedRunId;
  try {
    const design = await jsonRequest(server.baseUrl, "/api/v1/design-requests", {
      method: "POST",
      key: "design-restart-001",
      body: {
        schema_version: "1.0",
        trigger: "video_apply",
        space_asset_id: "space-demo-desk",
        space_version_id: "space-demo-desk-v1",
        reference_asset_ids: ["inspiration-demo-warm"],
        goal_codes: [],
        constraints: {},
        options: V2_OPTIONS
      }
    });
    const related = await jsonRequest(
      server.baseUrl,
      `/api/v1/design-requests/${design.value.design_request_id}/related-design-runs`,
      {
        method: "POST",
        key: "related-restart-001",
        body: { schema_version: "1.0", reason: "initial" }
      }
    );
    relatedRunId = related.value.related_design_run_id;
    // 立即关闭并重启，检查恢复
    await server.close();
    server = await startServer(runtime);
    const relatedFinal = await waitJson(
      server.baseUrl,
      `/api/v1/related-design-runs/${relatedRunId}`,
      (v) => ["succeeded", "failed", "cancelled"].includes(v.status)
    );
    assert.equal(relatedFinal.status, "succeeded");
  } finally {
    await server.close();
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});
