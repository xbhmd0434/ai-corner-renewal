import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  adaptProductDiscoveryRun,
  createUnavailableProductDiscoveryViewModel,
  isSafeCommerceWebUrl,
  normalizeProductBbox
} from "../douyin-static-demo/adapters/product-discovery-view-model.js";
import { renderProductHotspots, ShopTheLook } from "../douyin-static-demo/renewal/components/shop-the-look.js";

async function fixture(name) {
  return JSON.parse(
    await readFile(
      new URL(`../../../examples/responses/product-discovery.run.${name}.json`, import.meta.url),
      "utf8"
    )
  );
}

test("shared running fixture maps to the staged analyzing state", async () => {
  const viewModel = adaptProductDiscoveryRun(await fixture("running"));
  assert.equal(viewModel.status, "analyzing");
  assert.equal(viewModel.progress, 62);
  assert.match(viewModel.description, /匹配抖音好物/);
});

test("shared ready fixture is honestly labeled plan-grounded + Demo", async () => {
  const viewModel = adaptProductDiscoveryRun(await fixture("ready"));
  assert.equal(viewModel.status, "ready");
  assert.equal(viewModel.sourceBadge, "方案关联 · Demo 商品");
  assert.match(viewModel.description, /根据本次方案/);
  assert.doesNotMatch(viewModel.description, /从图片识别|从焕新图里找到/);
  assert.equal(viewModel.subjects[0].bbox, null);
  assert.equal(viewModel.subjects[0].hotspotNumber, null);
  assert.equal(renderProductHotspots(viewModel), "");
});

test("shared empty fixture maps to a successful empty state", async () => {
  const viewModel = adaptProductDiscoveryRun(await fixture("empty"));
  assert.equal(viewModel.status, "empty");
  assert.equal(viewModel.sourceBadge, "暂未找到可靠好物");
  assert.equal(viewModel.canRetry, false);
});

test("partial preserves unmatched subjects and only numbers valid bboxes", async () => {
  const ready = await fixture("ready");
  const run = structuredClone(ready);
  run.result_state = "partial";
  run.result.provenance = {
    image_analysis: { source_type: "live", strategy: "image_agent" },
    commerce_catalog: { source_type: "douyin_catalog", label: "抖音商品目录" }
  };
  run.result.subjects[0].bbox = { x: 0.6, y: 0.2, width: 0.2, height: 0.3 };
  run.result.subjects.push({
    subject_id: "subject-unmatched",
    label: "墙面装饰",
    bbox: null,
    appearance: {},
    match_state: "unmatched",
    matches: []
  });
  const viewModel = adaptProductDiscoveryRun(run);
  assert.equal(viewModel.status, "partial");
  assert.equal(viewModel.sourceBadge, "AI 识别 · 抖音好物");
  assert.equal(viewModel.subjects[0].hotspotNumber, 1);
  assert.equal(viewModel.subjects[1].hotspotNumber, null);
  const markup = renderProductHotspots(viewModel);
  assert.match(markup, /data-product-hotspot="subject-example-lamp"/);
  assert.doesNotMatch(markup, /subject-unmatched/);
});

test("failed, cancelled and unavailable have distinct component states", async () => {
  const ready = await fixture("ready");
  const failed = adaptProductDiscoveryRun({
    ...ready,
    status: "failed",
    result_state: null,
    result: null,
    retryable: true,
    error: { message: "上游暂时不可用" }
  });
  const cancelled = adaptProductDiscoveryRun({
    ...ready,
    status: "cancelled",
    result_state: null,
    result: null,
    retryable: true
  });
  const unavailable = createUnavailableProductDiscoveryViewModel("能力未开放");
  const renderer = new ShopTheLook();
  assert.equal(failed.status, "failed");
  assert.match(renderer.render(failed), /重新识别/);
  assert.equal(cancelled.status, "cancelled");
  assert.match(renderer.render(cancelled), /重新开始/);
  assert.equal(unavailable.status, "unavailable");
  assert.match(renderer.render(unavailable), /使用本地离线 Demo/);
  assert.match(renderer.render(unavailable), /不会自动切换 Demo/);
});

test("all four CommerceAction types are preserved without inventing links", async () => {
  const ready = await fixture("ready");
  const actions = [
    { type: "douyin_deeplink", label: "去抖音购买", url: "snssdk1128://product/approved" },
    { type: "web_url", label: "查看商品", url: "https://www.douyin.com/product/approved" },
    { type: "search_query", label: "去抖音搜", query: "奶油白台灯" },
    { type: "unavailable", label: "暂不可购买" }
  ];
  const run = structuredClone(ready);
  run.result.subjects[0].matches = actions.map((commerce_action, index) => ({
    ...run.result.subjects[0].matches[0],
    match_id: `match-${index}`,
    product_id: `product-${index}`,
    commerce_action
  }));
  const viewModel = adaptProductDiscoveryRun(run);
  assert.deepEqual(
    viewModel.subjects[0].matches.map((match) => match.action.type),
    ["douyin_deeplink", "web_url", "search_query", "unavailable"]
  );
  assert.equal(viewModel.subjects[0].matches[3].action.disabled, true);
  assert.equal(viewModel.subjects[0].matches[0].action.url, actions[0].url);
  assert.match(new ShopTheLook().render(viewModel), /搜索：奶油白台灯/);
});

test("unsafe URLs and invalid bbox values are disabled instead of repaired", () => {
  assert.equal(isSafeCommerceWebUrl("http://example.com/product"), false);
  assert.equal(isSafeCommerceWebUrl("javascript:alert(1)"), false);
  assert.equal(isSafeCommerceWebUrl("https://example.com/product"), true);
  assert.equal(normalizeProductBbox({ x: 0.9, y: 0.1, width: 0.2, height: 0.2 }), null);
  assert.deepEqual(
    normalizeProductBbox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }),
    { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
  );
});

test("offline fixture presentation is explicit and close to commerce actions", async () => {
  const viewModel = adaptProductDiscoveryRun(await fixture("ready"), {
    deliveryMode: "offline_fixture"
  });
  const html = new ShopTheLook().render(viewModel);
  assert.equal(viewModel.sourceBadge, "本地离线 Demo");
  assert.match(html, /本地离线 Demo/);
  assert.match(html, /Demo 来源/);
});
